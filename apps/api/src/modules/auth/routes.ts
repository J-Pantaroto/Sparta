import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { loadEnv } from "../../config/env";
import { hashPassword, verifyPassword } from "./password";
import { signToken, verifyToken } from "./token";

const env = loadEnv();

export const registerSchema = z.object({
  email: z.string().email("Informe um email valido"),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
  displayName: z.string().min(2).optional()
});

export const loginSchema = z.object({
  email: z.string().email("Informe um email valido"),
  password: z.string().min(1, "Informe a senha")
});

/**
 * Extrai e valida o usuario autenticado a partir do header
 * `Authorization: Bearer <token>`. Retorna null se ausente/invalido/expirado.
 */
export async function getAuthenticatedUserId(request: FastifyRequest): Promise<string | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  const payload = verifyToken(token, env.AUTH_TOKEN_SECRET);
  return payload?.sub ?? null;
}

function toPublicUser(user: { id: string; email: string | null; displayName: string | null }) {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

// Limite restrito nas rotas de credencial: mitiga forca bruta de senha e
// enumeracao de emails cadastrados.
const CREDENTIAL_RATE_LIMIT = { max: 5, timeWindow: "1 minute" };

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/register", { config: { rateLimit: CREDENTIAL_RATE_LIMIT } }, async (request, reply) => {
    const payload = registerSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email: payload.email } });
    if (existing) {
      reply.code(409);
      return { error: "Ja existe uma conta com esse email." };
    }

    const user = await prisma.user.create({
      data: {
        email: payload.email,
        passwordHash: hashPassword(payload.password),
        displayName: payload.displayName ?? null
      }
    });

    const token = signToken(user.id, env.AUTH_TOKEN_SECRET);
    reply.code(201);
    return { token, user: toPublicUser(user) };
  });

  app.post("/auth/login", { config: { rateLimit: CREDENTIAL_RATE_LIMIT } }, async (request, reply) => {
    const payload = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: payload.email } });

    if (!user?.passwordHash || !verifyPassword(payload.password, user.passwordHash)) {
      reply.code(401);
      return { error: "Email ou senha invalidos." };
    }

    const token = signToken(user.id, env.AUTH_TOKEN_SECRET);
    return { token, user: toPublicUser(user) };
  });

  app.get("/auth/me", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { accounts: true } });
    if (!user) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    return {
      user: toPublicUser(user),
      riotAccounts: user.accounts.map((account) => ({
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        platformRegion: account.platformRegion,
        regionalRouting: account.regionalRouting
      }))
    };
  });
};
