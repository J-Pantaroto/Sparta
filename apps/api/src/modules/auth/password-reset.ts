import { createHash, randomBytes } from "node:crypto";
import { URL } from "node:url";
import type { Prisma } from "@prisma/client";
import type { ResolvedEnv } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { hashPassword } from "./password.js";
import type { TransactionalEmailProvider } from "./email-provider.js";

const HOUR_MS = 60 * 60 * 1000;

export type PasswordResetDeliveryStatus = "SENT" | "COOLDOWN" | "RATE_LIMITED" | "UNAVAILABLE";

export interface IssuedPasswordReset {
  deliveryStatus: PasswordResetDeliveryStatus;
  nextAllowedAt: string;
  rawToken?: string;
}

export function createPasswordResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildPasswordResetUrl(baseUrl: string, token: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * Mesma forma que `issueEmailVerification`: transacao serializavel decide
 * cooldown/limite por hora, revoga tokens ainda validos do mesmo usuario e
 * cria um novo antes de qualquer chamada ao provider (que roda fora da
 * transacao, ja que e I/O externo).
 */
export async function issuePasswordReset(input: {
  user: { id: string; email: string | null; displayName: string | null; passwordHash: string | null };
  provider: TransactionalEmailProvider;
  env: ResolvedEnv;
  now?: Date;
}): Promise<IssuedPasswordReset> {
  const now = input.now ?? new Date();
  const email = input.user.email;
  const nextAllowedAt = new Date(
    now.getTime() + input.env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1000
  ).toISOString();
  // Conta sem email ou sem senha local nao tem o que resetar - nunca chega
  // a criar token, mas a resposta ao chamador continua a mesma neutra.
  if (!email || !input.user.passwordHash) return { deliveryStatus: "UNAVAILABLE", nextAllowedAt };

  const issued = await prisma.$transaction(
    async (tx) => {
      const recent = await tx.passwordResetToken.findMany({
        where: {
          userId: input.user.id,
          createdAt: { gte: new Date(now.getTime() - HOUR_MS) }
        },
        orderBy: { createdAt: "desc" },
        take: input.env.PASSWORD_RESET_MAX_PER_HOUR
      });
      const latest = recent[0];
      if (
        latest &&
        now.getTime() - latest.createdAt.getTime() <
          input.env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1000
      ) {
        return {
          deliveryStatus: "COOLDOWN" as const,
          nextAllowedAt: new Date(
            latest.createdAt.getTime() + input.env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1000
          ).toISOString()
        };
      }
      if (recent.length >= input.env.PASSWORD_RESET_MAX_PER_HOUR) {
        return {
          deliveryStatus: "RATE_LIMITED" as const,
          nextAllowedAt: new Date(recent.at(-1)!.createdAt.getTime() + HOUR_MS).toISOString()
        };
      }

      const rawToken = createPasswordResetToken();
      await tx.passwordResetToken.updateMany({
        where: { userId: input.user.id, consumedAt: null, revokedAt: null },
        data: { revokedAt: now }
      });
      await tx.passwordResetToken.create({
        data: {
          userId: input.user.id,
          emailSnapshot: email,
          tokenHash: hashPasswordResetToken(rawToken),
          expiresAt: new Date(now.getTime() + input.env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000)
        }
      });
      return { deliveryStatus: "SENT" as const, nextAllowedAt, rawToken };
    },
    { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel }
  );

  if (issued.deliveryStatus !== "SENT") return issued;
  if (!input.provider.isConfigured() || !input.env.PASSWORD_RESET_URL_BASE) {
    return { ...issued, deliveryStatus: "UNAVAILABLE" };
  }

  try {
    await input.provider.sendPasswordReset({
      to: email,
      displayName: input.user.displayName,
      resetUrl: buildPasswordResetUrl(input.env.PASSWORD_RESET_URL_BASE, issued.rawToken),
      expiresAt: new Date(
        now.getTime() + input.env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000
      ).toISOString()
    });
    return issued;
  } catch {
    return { ...issued, deliveryStatus: "UNAVAILABLE" };
  }
}

export type PasswordResetConfirmationResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "INVALID_OR_EXPIRED" };

/**
 * Consome o token, troca a senha e revoga TODA sessao existente (incrementa
 * sessionVersion) na mesma transacao - politica de seguranca deliberada:
 * uma redefinicao de senha nunca deixa uma sessao antiga (talvez do atacante
 * que forcou a redefinicao, ou de um dispositivo esquecido) continuar valida.
 * O `updateMany` com `consumedAt: null` como guarda de linha e o que decide
 * a corrida entre duas tentativas simultaneas do mesmo token: so uma bate
 * `count === 1`.
 */
export async function confirmPasswordReset(
  rawToken: string,
  newPassword: string,
  now = new Date()
): Promise<PasswordResetConfirmationResult> {
  const tokenHash = hashPasswordResetToken(rawToken);
  return prisma.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
    if (
      !record ||
      record.consumedAt ||
      record.revokedAt ||
      record.expiresAt.getTime() <= now.getTime() ||
      !record.user.isActive ||
      record.user.email !== record.emailSnapshot
    ) {
      return { ok: false, reason: "INVALID_OR_EXPIRED" };
    }

    const consumed = await tx.passwordResetToken.updateMany({
      where: {
        id: record.id,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now }
      },
      data: { consumedAt: now }
    });
    if (consumed.count !== 1) return { ok: false, reason: "INVALID_OR_EXPIRED" };

    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash: hashPassword(newPassword), sessionVersion: { increment: 1 } }
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, id: { not: record.id }, consumedAt: null, revokedAt: null },
      data: { revokedAt: now }
    });
    return { ok: true, userId: record.userId };
  });
}
