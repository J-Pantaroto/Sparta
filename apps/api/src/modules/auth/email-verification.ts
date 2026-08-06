import { createHash, randomBytes } from "node:crypto";
import { URL } from "node:url";
import type { Prisma } from "@prisma/client";
import type { ResolvedEnv } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import type { TransactionalEmailProvider } from "./email-provider.js";

const HOUR_MS = 60 * 60 * 1000;

export type EmailVerificationDeliveryStatus = "SENT" | "COOLDOWN" | "RATE_LIMITED" | "UNAVAILABLE";

export interface IssuedEmailVerification {
  deliveryStatus: EmailVerificationDeliveryStatus;
  nextAllowedAt: string;
  rawToken?: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export function maskEmail(email: string | null): string {
  if (!email) return "email indisponivel";
  const separator = email.lastIndexOf("@");
  if (separator <= 0) return "***";
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export function createEmailVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashEmailVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildEmailVerificationUrl(baseUrl: string, token: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function issueEmailVerification(input: {
  user: { id: string; email: string | null; displayName: string | null };
  provider: TransactionalEmailProvider;
  env: ResolvedEnv;
  now?: Date;
}): Promise<IssuedEmailVerification> {
  const now = input.now ?? new Date();
  const email = input.user.email;
  const nextAllowedAt = new Date(
    now.getTime() + input.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000
  ).toISOString();
  if (!email) return { deliveryStatus: "UNAVAILABLE", nextAllowedAt };

  const issued = await prisma.$transaction(
    async (tx) => {
      const recent = await tx.emailVerificationToken.findMany({
        where: {
          userId: input.user.id,
          createdAt: { gte: new Date(now.getTime() - HOUR_MS) }
        },
        orderBy: { createdAt: "desc" },
        take: input.env.EMAIL_VERIFICATION_MAX_PER_HOUR
      });
      const latest = recent[0];
      if (
        latest &&
        now.getTime() - latest.createdAt.getTime() <
          input.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000
      ) {
        return {
          deliveryStatus: "COOLDOWN" as const,
          nextAllowedAt: new Date(
            latest.createdAt.getTime() + input.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000
          ).toISOString()
        };
      }
      if (recent.length >= input.env.EMAIL_VERIFICATION_MAX_PER_HOUR) {
        return {
          deliveryStatus: "RATE_LIMITED" as const,
          nextAllowedAt: new Date(recent.at(-1)!.createdAt.getTime() + HOUR_MS).toISOString()
        };
      }

      const rawToken = createEmailVerificationToken();
      await tx.emailVerificationToken.updateMany({
        where: {
          userId: input.user.id,
          consumedAt: null,
          revokedAt: null
        },
        data: { revokedAt: now }
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: input.user.id,
          emailSnapshot: email,
          tokenHash: hashEmailVerificationToken(rawToken),
          expiresAt: new Date(
            now.getTime() + input.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000
          )
        }
      });
      return { deliveryStatus: "SENT" as const, nextAllowedAt, rawToken };
    },
    { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel }
  );

  if (issued.deliveryStatus !== "SENT") return issued;
  if (!input.provider.isConfigured() || !input.env.EMAIL_VERIFICATION_URL_BASE) {
    return { ...issued, deliveryStatus: "UNAVAILABLE" };
  }

  try {
    await input.provider.sendEmailVerification({
      to: email,
      displayName: input.user.displayName,
      verificationUrl: buildEmailVerificationUrl(
        input.env.EMAIL_VERIFICATION_URL_BASE,
        issued.rawToken
      ),
      expiresAt: new Date(
        now.getTime() + input.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000
      ).toISOString()
    });
    return issued;
  } catch {
    return { ...issued, deliveryStatus: "UNAVAILABLE" };
  }
}

export async function confirmEmailVerificationToken(
  rawToken: string,
  now = new Date()
): Promise<boolean> {
  const tokenHash = hashEmailVerificationToken(rawToken);
  return prisma.$transaction(async (tx) => {
    const record = await tx.emailVerificationToken.findUnique({
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
      return false;
    }

    const consumed = await tx.emailVerificationToken.updateMany({
      where: {
        id: record.id,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now }
      },
      data: { consumedAt: now }
    });
    if (consumed.count !== 1) return false;
    await tx.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: now }
    });
    await tx.emailVerificationToken.updateMany({
      where: {
        userId: record.userId,
        id: { not: record.id },
        consumedAt: null,
        revokedAt: null
      },
      data: { revokedAt: now }
    });
    return true;
  });
}
