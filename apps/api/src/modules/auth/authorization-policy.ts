import type { FastifyReply, FastifyRequest } from "fastify";
import { loadEnv } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "./routes.js";
import { isRiotAccountAccessAllowed } from "./riot-identity.js";

export { isRiotAccountAccessAllowed } from "./riot-identity.js";

export type RouteAccessClass =
  "PUBLIC" | "AUTHENTICATED" | "OWN_RESOURCE" | "ADMINISTRATIVE" | "INTERNAL_ONLY";

type IdentityParameter = "puuid" | "playerId" | "riotId";
export type RouteAuthorizationPolicy = {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  access: RouteAccessClass;
  identityParameter?: IdentityParameter;
};

const publicGet = (path: string): RouteAuthorizationPolicy => ({
  method: "GET",
  path,
  access: "PUBLIC"
});
const ownGet = (path: string, identityParameter?: IdentityParameter): RouteAuthorizationPolicy => ({
  method: "GET",
  path,
  access: "OWN_RESOURCE",
  ...(identityParameter ? { identityParameter } : {})
});

/** Matriz executavel e usada tambem como fonte do inventario documental. */
export const ROUTE_AUTHORIZATION_POLICIES: readonly RouteAuthorizationPolicy[] = [
  publicGet("/health"),
  publicGet("/ready"),
  { method: "POST", path: "/auth/register", access: "PUBLIC" },
  { method: "POST", path: "/auth/login", access: "PUBLIC" },
  { method: "POST", path: "/auth/email-verification/resend", access: "PUBLIC" },
  { method: "POST", path: "/auth/email-verification/confirm", access: "PUBLIC" },
  { method: "GET", path: "/auth/me", access: "AUTHENTICATED" },
  { method: "GET", path: "/auth/onboarding-status", access: "AUTHENTICATED" },
  { method: "POST", path: "/auth/logout", access: "AUTHENTICATED" },
  { method: "PATCH", path: "/auth/account/email", access: "AUTHENTICATED" },
  { method: "POST", path: "/auth/riot/rso/start", access: "AUTHENTICATED" },
  { method: "GET", path: "/auth/riot/rso/callback", access: "PUBLIC" },
  { method: "POST", path: "/auth/riot/revoke", access: "AUTHENTICATED" },
  { method: "POST", path: "/players/link-riot-account", access: "AUTHENTICATED" },

  publicGet("/catalog/champions/:championId/capabilities"),
  publicGet("/patches"),
  publicGet("/patches/current"),
  publicGet("/patches/:patch/champions/:championId"),
  publicGet("/patches/:patch/impacts"),
  publicGet("/patches/:patch"),
  publicGet("/draft-reviews/form"),

  ownGet("/me/player-profile"),
  ownGet("/players/:riotName/:tagLine/profile", "riotId"),
  ownGet("/players/:puuid/champions/:championId/role-evidence", "puuid"),
  ownGet("/players/:playerId/champions/:championId/roles/:role/loadout-evidence", "playerId"),
  ownGet("/players/pool"),
  { method: "POST", path: "/players/pool", access: "OWN_RESOURCE" },
  { method: "PATCH", path: "/players/pool/:championId", access: "OWN_RESOURCE" },
  { method: "POST", path: "/players/sync", access: "OWN_RESOURCE" },
  ownGet("/players/:puuid/recent-matches", "puuid"),
  ownGet("/players/:puuid/champion-performance", "puuid"),
  ownGet("/players/:puuid/growth-journey", "puuid"),
  ownGet("/players/settings"),
  { method: "PUT", path: "/players/settings", access: "OWN_RESOURCE" },

  { method: "POST", path: "/drafts/recommendations", access: "OWN_RESOURCE" },
  { method: "POST", path: "/drafts/pre-game-analysis", access: "OWN_RESOURCE" },
  ownGet("/drafts/sessions/active"),
  ownGet("/drafts/sessions"),
  ownGet("/drafts/sessions/:sessionId"),
  ownGet("/drafts/sessions/:sessionId/snapshots"),
  { method: "POST", path: "/drafts/sessions/:sessionId/lock-in", access: "OWN_RESOURCE" },
  { method: "POST", path: "/drafts/sessions/:sessionId/status", access: "OWN_RESOURCE" },
  { method: "POST", path: "/drafts/sessions/:sessionId/observed-game", access: "OWN_RESOURCE" },
  { method: "POST", path: "/drafts/sessions/reconcile", access: "OWN_RESOURCE" },
  ownGet("/draft-sessions/:sessionId/replay-capability"),
  ownGet("/recommendation-snapshots/:snapshotId/replay-bundle-summary"),
  {
    method: "POST",
    path: "/recommendation-snapshots/:snapshotId/verify-replay",
    access: "OWN_RESOURCE"
  },

  ownGet("/draft-sessions/:sessionId/post-game-comparison"),
  ownGet("/matches/:matchId/draft-comparison"),
  {
    method: "POST",
    path: "/draft-sessions/:sessionId/post-game-comparison/generate",
    access: "OWN_RESOURCE"
  },
  { method: "POST", path: "/postgame/analyze", access: "OWN_RESOURCE" },
  ownGet("/postgame/:matchId"),
  ownGet("/matches/:matchId/observation"),
  ownGet("/players/:playerId/recommendation-observability", "playerId"),
  ownGet("/players/:playerId/recommendation-observability/versions", "playerId"),
  ownGet("/players/:playerId/recommendation-observability/roles/:role", "playerId"),
  { method: "POST", path: "/draft-sessions/:sessionId/reviews", access: "OWN_RESOURCE" },
  ownGet("/draft-sessions/:sessionId/reviews"),
  { method: "POST", path: "/draft-reviews/:reviewId/pre-match", access: "OWN_RESOURCE" },
  { method: "POST", path: "/draft-reviews/:reviewId/reveal-result", access: "OWN_RESOURCE" },
  { method: "POST", path: "/draft-reviews/:reviewId/post-match", access: "OWN_RESOURCE" },
  ownGet("/players/draft-review-summary"),

  { method: "GET", path: "/calibration/parameters", access: "INTERNAL_ONLY" },
  { method: "POST", path: "/calibration/candidates/validate", access: "INTERNAL_ONLY" },
  { method: "POST", path: "/calibration/candidates", access: "INTERNAL_ONLY" },
  { method: "GET", path: "/calibration/candidates", access: "INTERNAL_ONLY" },
  { method: "GET", path: "/calibration/candidates/:id", access: "INTERNAL_ONLY" },
  { method: "GET", path: "/calibration/candidates/:id/revisions", access: "INTERNAL_ONLY" },
  { method: "POST", path: "/calibration/candidates/:id/revisions", access: "INTERNAL_ONLY" },
  { method: "POST", path: "/calibration/experiments", access: "INTERNAL_ONLY" },
  { method: "GET", path: "/calibration/experiments", access: "INTERNAL_ONLY" },
  { method: "GET", path: "/calibration/experiments/:id", access: "INTERNAL_ONLY" },
  { method: "GET", path: "/calibration/experiments/:id/cases", access: "INTERNAL_ONLY" },
  { method: "POST", path: "/calibration/candidates/:id/reject", access: "INTERNAL_ONLY" },
  {
    method: "POST",
    path: "/calibration/candidates/:id/approve-for-future-release",
    access: "INTERNAL_ONLY"
  },
  {
    method: "POST",
    path: "/calibration/candidates/:candidateId/releases",
    access: "ADMINISTRATIVE"
  },
  { method: "GET", path: "/calibration/releases", access: "ADMINISTRATIVE" },
  { method: "GET", path: "/calibration/releases/:releaseId", access: "ADMINISTRATIVE" },
  { method: "POST", path: "/calibration/releases/:releaseId/validate", access: "ADMINISTRATIVE" },
  { method: "POST", path: "/calibration/releases/:releaseId/activate", access: "ADMINISTRATIVE" },
  { method: "POST", path: "/calibration/releases/:releaseId/rollback", access: "ADMINISTRATIVE" },
  { method: "GET", path: "/recommendation-engine/active-release", access: "ADMINISTRATIVE" },
  { method: "POST", path: "/replays/import", access: "INTERNAL_ONLY" },
  { method: "GET", path: "/replays/:jobId", access: "INTERNAL_ONLY" }
] as const;

function sameRiotId(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("en-US") === right.trim().toLocaleLowerCase("en-US");
}

export function hasAuthorizationPolicy(method: string, path: string): boolean {
  return ROUTE_AUTHORIZATION_POLICIES.some(
    (entry) => entry.method === method && entry.path === path
  );
}

export async function enforceRouteAuthorization(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (request.method === "OPTIONS" || request.method === "HEAD") return;
  const routePath = request.routeOptions.url;
  // O handler 404 interno do Fastify nao e uma rota de aplicacao e nao entra
  // no inventario. Deixa-o responder 404 normalmente.
  if (!routePath || routePath === "/*") return;
  // O Swagger UI e registrado antes das rotas da aplicacao e existe somente
  // no modo de desenvolvimento explicitamente habilitado por app.ts. Seus
  // assets internos compartilham o prefixo; em producao nenhuma dessas rotas
  // e registrada.
  if (routePath === "/docs" || routePath.startsWith("/docs/")) return;
  const policy = ROUTE_AUTHORIZATION_POLICIES.find(
    (entry) => entry.method === request.method && entry.path === routePath
  );
  if (!policy) {
    request.log.error({ event: "route_without_authorization_policy", route: routePath });
    await reply
      .status(500)
      .send({ code: "AUTHORIZATION_POLICY_MISSING", message: "Rota indisponivel." });
    return;
  }
  if (policy.access === "PUBLIC") return;

  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    await reply.status(401).send({ code: "UNAUTHENTICATED", message: "Nao autenticado." });
    return;
  }
  const env = loadEnv();
  const onboardingExempt = new Set([
    "/auth/me",
    "/auth/onboarding-status",
    "/auth/logout",
    "/auth/account/email"
  ]);
  if (policy.access === "AUTHENTICATED" && onboardingExempt.has(routePath)) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true, isActive: true }
  });
  if (!user?.isActive) {
    await reply.status(401).send({ code: "UNAUTHENTICATED", message: "Nao autenticado." });
    return;
  }
  if (!user.emailVerifiedAt) {
    await reply.status(403).send({
      code: "ONBOARDING_INCOMPLETE",
      requiredStep: "EMAIL_VERIFICATION",
      message: "Confirme seu email para continuar."
    });
    return;
  }

  const riotOnboardingPaths = new Set([
    "/auth/riot/rso/start",
    "/auth/riot/revoke",
    "/players/link-riot-account"
  ]);
  if (policy.access === "AUTHENTICATED" && riotOnboardingPaths.has(routePath)) return;

  if (
    (policy.access === "INTERNAL_ONLY" || policy.access === "ADMINISTRATIVE") &&
    env.IDENTITY_MODE === "RSO_REQUIRED"
  ) {
    await reply
      .status(404)
      .send({ code: "RESOURCE_NOT_FOUND", message: "Recurso nao encontrado." });
    return;
  }

  const account = await prisma.riotAccount.findFirst({
    where: { userId },
    orderBy: [{ linkStatus: "desc" }, { createdAt: "asc" }]
  });
  if (!account) {
    await reply.status(403).send({
      code: "ONBOARDING_INCOMPLETE",
      requiredStep: "RIOT_LINK",
      message: "Vincule e confirme sua conta Riot para continuar."
    });
    return;
  }
  const allowedStatus = isRiotAccountAccessAllowed(account.linkStatus, env.IDENTITY_MODE);
  if (!allowedStatus) {
    await reply.status(403).send({
      code: "ONBOARDING_INCOMPLETE",
      requiredStep: "RIOT_LINK",
      message: "A conta Riot precisa de verificacao aceita neste ambiente para continuar."
    });
    return;
  }

  if (policy.access === "AUTHENTICATED") return;

  const params = (request.params ?? {}) as Record<string, unknown>;
  const supplied = policy.identityParameter ? params[policy.identityParameter] : undefined;
  const identityMatches =
    policy.identityParameter === undefined ||
    ((policy.identityParameter === "puuid" || policy.identityParameter === "playerId") &&
      supplied === account.puuid) ||
    (policy.identityParameter === "riotId" &&
      typeof params.riotName === "string" &&
      typeof params.tagLine === "string" &&
      sameRiotId(params.riotName, account.gameName) &&
      sameRiotId(params.tagLine, account.tagLine));
  if (!identityMatches) {
    await reply
      .status(404)
      .send({ code: "RESOURCE_NOT_FOUND", message: "Recurso nao encontrado." });
  }
}
