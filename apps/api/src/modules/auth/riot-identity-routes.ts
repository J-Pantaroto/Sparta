import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { loadEnv } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "./routes.js";
import {
  buildRsoAuthorizationUrl,
  createAuthorizationState,
  hashAuthorizationState,
  unavailableRiotIdentityProvider,
  verificationEvidenceHash,
  type RiotIdentityProvider
} from "./riot-identity.js";

const CALLBACK_TTL_MS = 10 * 60 * 1000;
const identityClaimSchema = z
  .object({
    puuid: z.string().min(1).max(256),
    gameName: z.string().min(1).max(128),
    tagLine: z.string().min(1).max(32),
    platformRegion: z.string().min(2).max(16),
    regionalRouting: z.string().min(2).max(32)
  })
  .strict();

function statusBeforePending(
  account: {
    linkStatus: string;
    verifiedAt: Date | null;
    verificationMethod: string | null;
    verificationEvidenceHash: string | null;
    reauthenticationRequiredAt: Date | null;
  } | null
): string | null {
  if (!account || account.linkStatus !== "PENDING_VERIFICATION") return account?.linkStatus ?? null;
  if (account.reauthenticationRequiredAt) return "REQUIRES_REAUTHENTICATION";
  if (account.verifiedAt && account.verificationMethod && account.verificationEvidenceHash) {
    return "VERIFIED_BY_RSO";
  }
  return "UNVERIFIED_LEGACY";
}

function statusAfterFailedVerification(
  previousLinkStatus: string | null
): "UNVERIFIED_LEGACY" | "REVOKED" | "REQUIRES_REAUTHENTICATION" {
  if (previousLinkStatus === "REVOKED") return "REVOKED";
  if (
    previousLinkStatus === "VERIFIED_BY_RSO" ||
    previousLinkStatus === "REQUIRES_REAUTHENTICATION"
  ) {
    return "REQUIRES_REAUTHENTICATION";
  }
  return "UNVERIFIED_LEGACY";
}

export function createRiotIdentityRoutes(
  provider: RiotIdentityProvider = unavailableRiotIdentityProvider
): FastifyPluginAsync {
  return async (app) => {
    const env = loadEnv();

    app.post("/auth/riot/rso/start", async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      if (!userId) {
        reply.code(401);
        return { code: "UNAUTHENTICATED", message: "Nao autenticado." };
      }
      if (
        !env.RSO_ENABLED ||
        !env.RSO_CLIENT_ID ||
        !env.RSO_REDIRECT_URI ||
        !provider.isConfigured()
      ) {
        reply.code(503);
        return {
          code: "RSO_NOT_CONFIGURED",
          message: "A verificacao oficial da Riot ainda nao esta disponivel."
        };
      }

      const currentAccount = await prisma.riotAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" }
      });
      const state = createAuthorizationState();
      await prisma.$transaction(async (tx) => {
        await tx.rsoAuthorizationTransaction.create({
          data: {
            userId,
            stateHash: hashAuthorizationState(state),
            redirectUri: env.RSO_REDIRECT_URI!,
            riotAccountId: currentAccount?.id ?? null,
            previousLinkStatus: statusBeforePending(currentAccount),
            expiresAt: new Date(Date.now() + CALLBACK_TTL_MS)
          }
        });
        if (currentAccount && currentAccount.linkStatus !== "REVOKED") {
          await tx.riotAccount.update({
            where: { id: currentAccount.id },
            data: { linkStatus: "PENDING_VERIFICATION" }
          });
        }
      });

      return {
        status: "PENDING_VERIFICATION",
        authorizationUrl: buildRsoAuthorizationUrl({
          clientId: env.RSO_CLIENT_ID,
          redirectUri: env.RSO_REDIRECT_URI,
          state
        }),
        expiresInSeconds: CALLBACK_TTL_MS / 1000
      };
    });

    app.get("/auth/riot/rso/callback", async (request, reply) => {
      const { code, state } = z
        .object({ code: z.string().min(1).max(4096), state: z.string().min(32).max(512) })
        .parse(request.query);
      if (!provider.isConfigured()) {
        reply.code(503);
        return { code: "RSO_NOT_CONFIGURED", message: "Verificacao oficial indisponivel." };
      }

      const stateHash = hashAuthorizationState(state);
      const transaction = await prisma.rsoAuthorizationTransaction.findUnique({
        where: { stateHash }
      });
      if (
        !transaction ||
        transaction.status !== "PENDING" ||
        transaction.expiresAt.getTime() <= Date.now()
      ) {
        reply.code(400);
        return { code: "RSO_CALLBACK_INVALID", message: "Callback invalido ou expirado." };
      }

      const claimed = await prisma.rsoAuthorizationTransaction.updateMany({
        where: { id: transaction.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "CONSUMING", consumedAt: new Date() }
      });
      if (claimed.count !== 1) {
        reply.code(400);
        return { code: "RSO_CALLBACK_INVALID", message: "Callback invalido ou expirado." };
      }

      try {
        const claim = identityClaimSchema.parse(
          await provider.exchangeCodeForOwnIdentity({
            code,
            redirectUri: transaction.redirectUri
          })
        );
        const boundAccount = transaction.riotAccountId
          ? await prisma.riotAccount.findUnique({ where: { id: transaction.riotAccountId } })
          : null;
        if (
          boundAccount &&
          (boundAccount.userId !== transaction.userId || boundAccount.puuid !== claim.puuid)
        ) {
          throw new Error("RSO_BOUND_IDENTITY_MISMATCH");
        }
        const existing = await prisma.riotAccount.findUnique({ where: { puuid: claim.puuid } });
        if (existing?.userId && existing.userId !== transaction.userId) {
          await prisma.rsoAuthorizationTransaction.update({
            where: { id: transaction.id },
            data: { status: "REJECTED", failureCode: "IDENTITY_ALREADY_ASSOCIATED" }
          });
          reply.code(409);
          return {
            code: "RIOT_IDENTITY_ALREADY_ASSOCIATED",
            message: "Esta identidade Riot nao pode ser vinculada a esta conta."
          };
        }

        await prisma.$transaction(async (tx) => {
          if (existing) {
            await tx.riotAccount.update({
              where: { id: existing.id },
              data: {
                userId: transaction.userId,
                gameName: claim.gameName,
                tagLine: claim.tagLine,
                platformRegion: claim.platformRegion,
                regionalRouting: claim.regionalRouting,
                linkStatus: "VERIFIED_BY_RSO",
                verifiedAt: new Date(),
                verificationMethod: "RIOT_RSO_ACCOUNT_V1_ME",
                verificationEvidenceHash: verificationEvidenceHash(claim),
                revokedAt: null,
                reauthenticationRequiredAt: null
              }
            });
          } else if (transaction.riotAccountId) {
            await tx.riotAccount.update({
              where: { id: transaction.riotAccountId },
              data: {
                puuid: claim.puuid,
                gameName: claim.gameName,
                tagLine: claim.tagLine,
                platformRegion: claim.platformRegion,
                regionalRouting: claim.regionalRouting,
                linkStatus: "VERIFIED_BY_RSO",
                verifiedAt: new Date(),
                verificationMethod: "RIOT_RSO_ACCOUNT_V1_ME",
                verificationEvidenceHash: verificationEvidenceHash(claim),
                revokedAt: null,
                reauthenticationRequiredAt: null
              }
            });
          } else {
            await tx.riotAccount.create({
              data: {
                userId: transaction.userId,
                puuid: claim.puuid,
                gameName: claim.gameName,
                tagLine: claim.tagLine,
                platformRegion: claim.platformRegion,
                regionalRouting: claim.regionalRouting,
                linkStatus: "VERIFIED_BY_RSO",
                verifiedAt: new Date(),
                verificationMethod: "RIOT_RSO_ACCOUNT_V1_ME",
                verificationEvidenceHash: verificationEvidenceHash(claim)
              }
            });
          }
          await tx.rsoAuthorizationTransaction.update({
            where: { id: transaction.id },
            data: { status: "CONSUMED", failureCode: null }
          });
        });
        return { status: "VERIFIED_BY_RSO" };
      } catch {
        if ((reply as { sent?: boolean }).sent) return;
        await prisma.$transaction(async (tx) => {
          await tx.rsoAuthorizationTransaction.update({
            where: { id: transaction.id },
            data: { status: "REJECTED", failureCode: "PROVIDER_EXCHANGE_FAILED" }
          });
          if (transaction.riotAccountId) {
            const restoredStatus = statusAfterFailedVerification(transaction.previousLinkStatus);
            await tx.riotAccount.updateMany({
              where: { id: transaction.riotAccountId, userId: transaction.userId },
              data: {
                linkStatus: restoredStatus,
                reauthenticationRequiredAt:
                  restoredStatus === "REQUIRES_REAUTHENTICATION" ? new Date() : null,
                revokedAt: restoredStatus === "REVOKED" ? undefined : null
              }
            });
          }
        });
        request.log.warn({ event: "rso_callback_failed", code: "PROVIDER_EXCHANGE_FAILED" });
        reply.code(502);
        return { code: "RSO_VERIFICATION_FAILED", message: "Nao foi possivel verificar a conta." };
      }
    });

    app.post("/auth/riot/revoke", async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      if (!userId) {
        reply.code(401);
        return { code: "UNAUTHENTICATED", message: "Nao autenticado." };
      }
      const account = await prisma.riotAccount.findFirst({ where: { userId } });
      if (!account) {
        reply.code(404);
        return { code: "RIOT_ACCOUNT_NOT_LINKED", message: "Conta Riot nao vinculada." };
      }
      await prisma.riotAccount.update({
        where: { id: account.id },
        data: {
          linkStatus: "REVOKED",
          revokedAt: new Date(),
          verificationEvidenceHash: null,
          verificationMethod: null
        }
      });
      return { status: "REVOKED" };
    });
  };
}
