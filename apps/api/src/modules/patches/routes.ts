import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { findLatestPatchFailure, findPatchRelease, listPatchReleases } from "./patch-repository.js";

const localeQuery = z.object({
  locale: z
    .string()
    .regex(/^[a-z]{2}_[A-Z]{2}$/)
    .default("pt_BR")
});
const patchParams = z.object({ patch: z.string().regex(/^\d{1,2}\.\d{1,2}$/) });

async function unavailablePatch(reply: FastifyReply, patch: string, locale: string) {
  const failure = await findLatestPatchFailure(patch, locale);
  if (failure) {
    reply.code(503);
    return {
      status: "UNAVAILABLE",
      code:
        failure.status === "PARSER_INCOMPATIBLE"
          ? "PATCH_PARSER_INCOMPATIBLE"
          : "PATCH_PAGE_UNAVAILABLE",
      patch,
      locale,
      sourceUrl: failure.sourceUrl,
      attemptedAt: failure.attemptedAt.toISOString(),
      unavailableReason:
        failure.status === "PARSER_INCOMPATIBLE"
          ? "A página oficial existe, mas o parser atual não reconhece sua estrutura."
          : "A página oficial não estava disponível na última tentativa."
    };
  }
  reply.code(404);
  return {
    status: "UNAVAILABLE",
    code: "PATCH_NOT_IMPORTED",
    patch,
    locale,
    unavailableReason: "Este patch ainda não foi importado."
  };
}

export const patchesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/patches", async (request) => {
    const { locale } = localeQuery.parse(request.query);
    const releases = await listPatchReleases(locale);
    return releases.length > 0
      ? { status: "AVAILABLE", locale, releases }
      : {
          status: "UNAVAILABLE",
          locale,
          releases: [],
          unavailableReason: "Nenhum release válido foi importado para este locale."
        };
  });

  app.get("/patches/current", async (request, reply) => {
    const { locale } = localeQuery.parse(request.query);
    const summaries = await listPatchReleases(locale);
    const current = summaries[0];
    if (!current) {
      reply.code(404);
      return {
        status: "UNAVAILABLE",
        code: "PATCH_NOT_IMPORTED",
        locale,
        unavailableReason: "Nenhum patch válido foi importado."
      };
    }
    return findPatchRelease(current.patch, locale);
  });

  app.get("/patches/:patch/champions/:championId", async (request, reply) => {
    const { patch } = patchParams
      .extend({ championId: z.coerce.number().int().positive() })
      .parse(request.params);
    const championId = z.coerce
      .number()
      .int()
      .positive()
      .parse((request.params as { championId: unknown }).championId);
    const { locale } = localeQuery.parse(request.query);
    const release = await findPatchRelease(patch, locale);
    if (!release) return unavailablePatch(reply, patch, locale);
    const changes = release.changes.filter(
      (change) => change.entityType === "CHAMPION" && change.entityId === championId
    );
    return {
      release: {
        patch: release.patch,
        title: release.title,
        locale: release.locale,
        publishedAt: release.publishedAt,
        collectedAt: release.collectedAt,
        sourceUrl: release.sourceUrl,
        sourceHash: release.sourceHash,
        parserVersion: release.parserVersion,
        revision: release.revision,
        status: release.status,
        provenance: release.provenance,
        staleReason: release.staleReason
      },
      championId,
      entityChanged: changes.length > 0,
      changes
    };
  });

  app.get("/patches/:patch", async (request, reply) => {
    const { patch } = patchParams.parse(request.params);
    const { locale } = localeQuery.parse(request.query);
    const release = await findPatchRelease(patch, locale);
    return release ?? unavailablePatch(reply, patch, locale);
  });
};
