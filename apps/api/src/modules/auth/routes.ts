import { createHash, randomBytes } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { loadEnv } from "../../config/env.js";
import {
  confirmEmailVerificationToken,
  issueEmailVerification,
  normalizeEmail
} from "./email-verification.js";
import {
  defaultEmailProviderForEnvironment,
  type TransactionalEmailProvider
} from "./email-provider.js";
import { confirmPasswordReset, issuePasswordReset } from "./password-reset.js";
import { buildAccountOnboardingStatus } from "./onboarding.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signToken, verifyToken } from "./token.js";

const env = loadEnv();

export const registerSchema = z.object({
  email: z.string().email("Informe um email valido"),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres").max(256),
  displayName: z.string().trim().min(2).max(80).optional()
});

export const loginSchema = z.object({
  email: z.string().email("Informe um email valido"),
  password: z.string().min(1, "Informe a senha").max(256)
});

const resendSchema = z.object({ email: z.string().email("Informe um email valido") });
const confirmationSchema = z.object({ token: z.string().min(32).max(512) });
const emailChangeSchema = z.object({
  email: z.string().email("Informe um email valido"),
  currentPassword: z.string().min(1).max(256)
});
const passwordResetRequestSchema = z.object({ email: z.string().email("Informe um email valido") });
const passwordResetConfirmSchema = z.object({
  token: z.string().min(32).max(512),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres").max(256)
});

type AuthenticatedUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  sessionVersion: number;
};

async function getAuthenticatedUser(request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const payload = verifyToken(header.slice("Bearer ".length), env.AUTH_TOKEN_SECRET);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      displayName: true,
      emailVerifiedAt: true,
      isActive: true,
      sessionVersion: true
    }
  });
  if (!user?.isActive || user.sessionVersion !== payload.ver) return null;
  return user;
}

/** Valida assinatura, expiracao, atividade e versao revogavel da sessao. */
export async function getAuthenticatedUserId(request: FastifyRequest): Promise<string | null> {
  return (await getAuthenticatedUser(request))?.id ?? null;
}

function toPublicUser(user: AuthenticatedUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    isActive: user.isActive
  };
}

function sessionToken(user: Pick<AuthenticatedUser, "id" | "sessionVersion">): string {
  return signToken(user.id, env.AUTH_TOKEN_SECRET, env.AUTH_TOKEN_TTL_SECONDS, user.sessionVersion);
}

function opaqueUserRef(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

async function findUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  return (
    (await prisma.user.findUnique({ where: { email: normalized } })) ??
    prisma.user.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
      orderBy: { createdAt: "asc" }
    })
  );
}

function neutralVerificationResponse(nextAllowedAt: string, localPreviewToken?: string) {
  return {
    status: "VERIFICATION_REQUIRED" as const,
    message:
      "Se o endereco puder ser usado, enviaremos instrucoes de confirmacao. Verifique sua caixa de entrada.",
    nextAllowedAt,
    ...(localPreviewToken ? { localPreviewToken, localPreviewOnly: true as const } : {})
  };
}

// Resposta identica exista ou nao a conta: o unico jeito de nao revelar
// existencia de conta e a mesma resposta valer para "enviamos" e "nao ha o
// que enviar" (conta inexistente/sem senha local). O tempo de resposta
// tambem nao diverge de forma observavel, porque as duas ramificacoes
// passam pela mesma transacao serializavel em `issuePasswordReset`.
function neutralPasswordResetResponse(nextAllowedAt: string, localPreviewToken?: string) {
  return {
    status: "RESET_REQUESTED" as const,
    message:
      "Se o endereco tiver uma conta com senha, enviaremos instrucoes de redefinicao. Verifique sua caixa de entrada.",
    nextAllowedAt,
    ...(localPreviewToken ? { localPreviewToken, localPreviewOnly: true as const } : {})
  };
}

const CREDENTIAL_RATE_LIMIT = { max: env.CREDENTIAL_RATE_LIMIT_MAX, timeWindow: "1 minute" };

export interface AuthRoutesOptions {
  emailProvider?: TransactionalEmailProvider;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  const provider = options.emailProvider ?? defaultEmailProviderForEnvironment(env);

  app.post(
    "/auth/register",
    { config: { rateLimit: CREDENTIAL_RATE_LIMIT } },
    async (request, reply) => {
      const responseNextAllowedAt = new Date(
        Date.now() + env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1_000
      ).toISOString();
      const payload = registerSchema.parse(request.body);
      const email = normalizeEmail(payload.email);
      // O trabalho de hash ocorre mesmo quando a conta ja existe, reduzindo
      // diferencas observaveis entre os dois caminhos.
      const passwordHash = hashPassword(payload.password);
      let user = await findUserByEmail(email);
      if (!user) {
        try {
          user = await prisma.user.create({
            data: { email, passwordHash, displayName: payload.displayName ?? null }
          });
        } catch {
          // Uma corrida pelo mesmo email deve continuar produzindo a mesma
          // resposta neutra, nunca um 409 enumeravel.
          user = await findUserByEmail(email);
        }
      }

      let previewToken: string | undefined;
      if (user?.isActive && !user.emailVerifiedAt) {
        const issued = await issueEmailVerification({ user, provider, env });
        previewToken = issued.rawToken;
        request.log.info({
          event: "email_verification_requested",
          userRef: opaqueUserRef(user.id),
          deliveryStatus: issued.deliveryStatus
        });
      }
      // O preview e um recurso explicitamente local. Para manter o contrato
      // neutro, contas inexistentes/ja verificadas recebem um token inerte com
      // o mesmo formato; nenhum desses valores e registrado em log.
      const localPreviewToken =
        env.NODE_ENV !== "production" && env.LOCAL_EMAIL_PREVIEW_ENABLED
          ? (previewToken ?? randomBytes(32).toString("base64url"))
          : undefined;
      reply.code(202);
      return neutralVerificationResponse(responseNextAllowedAt, localPreviewToken);
    }
  );

  app.post(
    "/auth/email-verification/resend",
    { config: { rateLimit: CREDENTIAL_RATE_LIMIT } },
    async (request, reply) => {
      const responseNextAllowedAt = new Date(
        Date.now() + env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1_000
      ).toISOString();
      const payload = resendSchema.parse(request.body);
      const user = await findUserByEmail(payload.email);
      let previewToken: string | undefined;
      if (user?.isActive && !user.emailVerifiedAt) {
        const issued = await issueEmailVerification({ user, provider, env });
        previewToken = issued.rawToken;
        request.log.info({
          event: "email_verification_resent",
          userRef: opaqueUserRef(user.id),
          deliveryStatus: issued.deliveryStatus
        });
      }
      const localPreviewToken =
        env.NODE_ENV !== "production" && env.LOCAL_EMAIL_PREVIEW_ENABLED
          ? (previewToken ?? randomBytes(32).toString("base64url"))
          : undefined;
      reply.code(202);
      return neutralVerificationResponse(responseNextAllowedAt, localPreviewToken);
    }
  );

  app.post(
    "/auth/email-verification/confirm",
    { config: { rateLimit: CREDENTIAL_RATE_LIMIT } },
    async (request, reply) => {
      const { token } = confirmationSchema.parse(request.body);
      const confirmed = await confirmEmailVerificationToken(token);
      if (!confirmed) {
        reply.code(400);
        return {
          code: "EMAIL_VERIFICATION_INVALID",
          message: "O link de confirmacao e invalido, expirou ou ja foi utilizado."
        };
      }
      request.log.info({ event: "email_verification_confirmed" });
      return { status: "EMAIL_VERIFIED" };
    }
  );

  app.post(
    "/auth/password-reset/request",
    { config: { rateLimit: CREDENTIAL_RATE_LIMIT } },
    async (request, reply) => {
      const responseNextAllowedAt = new Date(
        Date.now() + env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1_000
      ).toISOString();
      const payload = passwordResetRequestSchema.parse(request.body);
      const user = await findUserByEmail(payload.email);
      let previewToken: string | undefined;
      if (user?.isActive) {
        const issued = await issuePasswordReset({ user, provider, env });
        previewToken = issued.rawToken;
        request.log.info({
          event: "password_reset_requested",
          userRef: opaqueUserRef(user.id),
          deliveryStatus: issued.deliveryStatus
        });
      }
      const localPreviewToken =
        env.NODE_ENV !== "production" && env.LOCAL_EMAIL_PREVIEW_ENABLED
          ? (previewToken ?? randomBytes(32).toString("base64url"))
          : undefined;
      reply.code(202);
      return neutralPasswordResetResponse(responseNextAllowedAt, localPreviewToken);
    }
  );

  app.post(
    "/auth/password-reset/confirm",
    { config: { rateLimit: CREDENTIAL_RATE_LIMIT } },
    async (request, reply) => {
      const { token, password } = passwordResetConfirmSchema.parse(request.body);
      const result = await confirmPasswordReset(token, password);
      if (!result.ok) {
        reply.code(400);
        return {
          code: "PASSWORD_RESET_INVALID",
          message: "O link de redefinicao e invalido, expirou ou ja foi utilizado."
        };
      }
      request.log.info({
        event: "password_reset_confirmed",
        userRef: opaqueUserRef(result.userId)
      });
      return { status: "PASSWORD_RESET" };
    }
  );

  app.post(
    "/auth/login",
    { config: { rateLimit: CREDENTIAL_RATE_LIMIT } },
    async (request, reply) => {
      const payload = loginSchema.parse(request.body);
      const user = await findUserByEmail(payload.email);
      if (
        !user?.passwordHash ||
        !user.isActive ||
        !verifyPassword(payload.password, user.passwordHash)
      ) {
        reply.code(401);
        return { code: "INVALID_CREDENTIALS", message: "Email ou senha invalidos." };
      }
      return { token: sessionToken(user), user: toPublicUser(user) };
    }
  );

  app.get("/auth/me", async (request, reply) => {
    const authenticated = await getAuthenticatedUser(request);
    if (!authenticated) {
      reply.code(401);
      return { code: "UNAUTHENTICATED", message: "Nao autenticado." };
    }
    const user = await prisma.user.findUnique({
      where: { id: authenticated.id },
      include: { accounts: { orderBy: [{ linkStatus: "desc" }, { createdAt: "asc" }] } }
    });
    if (!user?.isActive) {
      reply.code(401);
      return { code: "UNAUTHENTICATED", message: "Nao autenticado." };
    }
    const riotAccount = user.accounts[0] ?? null;
    return {
      user: toPublicUser(user),
      onboarding: buildAccountOnboardingStatus({ user, riotAccount, env }),
      riotAccounts: user.accounts.map((account) => ({
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        platformRegion: account.platformRegion,
        regionalRouting: account.regionalRouting,
        linkStatus: account.linkStatus,
        verifiedAt: account.verifiedAt?.toISOString() ?? null
      }))
    };
  });

  app.get("/auth/onboarding-status", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      reply.code(401);
      return { code: "UNAUTHENTICATED", message: "Nao autenticado." };
    }
    const riotAccount = await prisma.riotAccount.findFirst({
      where: { userId: user.id },
      orderBy: [{ linkStatus: "desc" }, { createdAt: "asc" }]
    });
    return buildAccountOnboardingStatus({ user, riotAccount, env });
  });

  app.post("/auth/logout", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      reply.code(401);
      return { code: "UNAUTHENTICATED", message: "Nao autenticado." };
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } }
    });
    reply.code(204);
  });

  app.patch("/auth/account/email", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      reply.code(401);
      return { code: "UNAUTHENTICATED", message: "Nao autenticado." };
    }
    const payload = emailChangeSchema.parse(request.body);
    const credential = await prisma.user.findUnique({ where: { id: user.id } });
    if (
      !credential?.passwordHash ||
      !verifyPassword(payload.currentPassword, credential.passwordHash)
    ) {
      reply.code(401);
      return { code: "REAUTHENTICATION_REQUIRED", message: "Confirme sua senha atual." };
    }
    const email = normalizeEmail(payload.email);
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.user.update({
          where: { id: user.id },
          data: { email, emailVerifiedAt: null, sessionVersion: { increment: 1 } }
        });
        await tx.emailVerificationToken.updateMany({
          where: { userId: user.id, consumedAt: null, revokedAt: null },
          data: { revokedAt: new Date() }
        });
        return next;
      });
      const issued = await issueEmailVerification({ user: updated, provider, env });
      request.log.info({
        event: "account_email_changed",
        userRef: opaqueUserRef(user.id),
        deliveryStatus: issued.deliveryStatus
      });
      return {
        token: sessionToken(updated),
        user: toPublicUser(updated),
        onboarding: buildAccountOnboardingStatus({ user: updated, riotAccount: null, env }),
        ...(env.NODE_ENV !== "production" && env.LOCAL_EMAIL_PREVIEW_ENABLED && issued.rawToken
          ? { localPreviewToken: issued.rawToken, localPreviewOnly: true as const }
          : {})
      };
    } catch {
      reply.code(409);
      return { code: "EMAIL_UNAVAILABLE", message: "Nao foi possivel usar esse endereco." };
    }
  });
};
