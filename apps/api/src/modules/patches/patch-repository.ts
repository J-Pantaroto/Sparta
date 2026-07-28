import type { DataProvenance, PatchChange, PatchRelease, PatchReleaseSummary } from "@sparta/core";
import { summarizePatchRelease } from "@sparta/core";
import { Prisma, type PatchImportAttempt, type PatchReleaseRevision } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { decidePatchRevision } from "./patch-revision.js";

export type PatchAttemptStatus =
  "SUCCESS" | "STALE_FALLBACK" | "PAGE_UNAVAILABLE" | "PARSER_INCOMPATIBLE";

export interface PatchRevisionAudit {
  revision: number;
  sourceHash: string;
  collectedAt: string;
  parserVersion: string;
  status: string;
}

export interface StoredPatchRelease extends PatchRelease {
  revisionHistory: PatchRevisionAudit[];
}

export interface PatchImportPersistenceResult {
  content: "NEW" | "UNCHANGED" | "REVISION";
  revision: number;
  releaseId: string;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isFailureAttempt(attempt: PatchImportAttempt | undefined): boolean {
  return Boolean(
    attempt &&
    ["STALE_FALLBACK", "PAGE_UNAVAILABLE", "PARSER_INCOMPATIBLE"].includes(attempt.status)
  );
}

function releaseFromRows(
  identity: { patch: string; locale: string; sourceUrl: string },
  revision: PatchReleaseRevision,
  revisions: PatchReleaseRevision[],
  lastAttempt?: PatchImportAttempt
): StoredPatchRelease {
  const baseStatus = revision.status as PatchRelease["status"];
  const stale =
    isFailureAttempt(lastAttempt) &&
    lastAttempt!.attemptedAt.getTime() > revision.collectedAt.getTime();
  const status: PatchRelease["status"] = stale ? "STALE" : baseStatus;
  const staleReason = stale
    ? lastAttempt!.status === "PARSER_INCOMPATIBLE"
      ? "A página oficial mudou para uma estrutura incompatível; a última revisão válida foi preservada."
      : "A página oficial não pôde ser atualizada; a última revisão válida foi preservada."
    : undefined;
  const provenance = revision.provenanceJson as unknown as DataProvenance;

  return {
    patch: identity.patch,
    title: revision.title,
    locale: identity.locale,
    publishedAt: revision.publishedAt?.toISOString() ?? null,
    collectedAt: revision.collectedAt.toISOString(),
    sourceUrl: identity.sourceUrl,
    sourceHash: revision.sourceHash,
    parserVersion: revision.parserVersion,
    revision: revision.revision,
    status,
    changes: revision.changesJson as unknown as PatchChange[],
    provenance: {
      ...provenance,
      status,
      ...(staleReason ? { staleReason } : {})
    },
    ...(staleReason ? { staleReason } : {}),
    revisionHistory: revisions.map((entry) => ({
      revision: entry.revision,
      sourceHash: entry.sourceHash,
      collectedAt: entry.collectedAt.toISOString(),
      parserVersion: entry.parserVersion,
      status: entry.status
    }))
  };
}

export async function resolvePatchCatalogAssociations(release: PatchRelease): Promise<{
  release: PatchRelease;
  resolvedEntities: number;
  unresolvedEntities: number;
}> {
  const champions = await prisma.champion.findMany({ select: { id: true, name: true } });
  const normalize = (name: string) =>
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\p{Letter}\p{Number}]/gu, "")
      .toLowerCase();
  const byName = new Map<string, { id: number; name: string }[]>();
  for (const champion of champions) {
    const key = normalize(champion.name);
    byName.set(key, [...(byName.get(key) ?? []), champion]);
  }

  const resolvedEntityKeys = new Set<string>();
  const unresolvedEntityKeys = new Set<string>();
  const changes = release.changes.map((change): PatchChange => {
    const entityKey = `${change.entityType}:${normalize(change.entityName)}`;
    if (change.entityType === "CHAMPION") {
      const candidates = byName.get(normalize(change.entityName)) ?? [];
      if (candidates.length === 1) {
        resolvedEntityKeys.add(entityKey);
        return {
          ...change,
          entityId: candidates[0]!.id,
          entityResolution: { status: "RESOLVED" }
        };
      }
      unresolvedEntityKeys.add(entityKey);
      return {
        ...change,
        entityResolution: {
          status: "UNRESOLVED",
          reason:
            candidates.length > 1
              ? "Mais de uma entrada do catálogo corresponde ao nome oficial normalizado."
              : "Nenhuma correspondência exata e segura no catálogo local de campeões."
        }
      };
    }
    if (change.entityType === "ITEM" || change.entityType === "RUNE") {
      unresolvedEntityKeys.add(entityKey);
      return {
        ...change,
        entityResolution: {
          status: "UNRESOLVED",
          reason: `O catálogo local de ${change.entityType === "ITEM" ? "itens" : "runas"} não está disponível.`
        }
      };
    }
    return { ...change, entityResolution: { status: "NOT_APPLICABLE" } };
  });
  const status: PatchRelease["status"] = unresolvedEntityKeys.size > 0 ? "PARTIAL" : release.status;

  return {
    release: {
      ...release,
      status,
      changes,
      provenance: { ...release.provenance, status }
    },
    resolvedEntities: resolvedEntityKeys.size,
    unresolvedEntities: unresolvedEntityKeys.size
  };
}

export async function findPatchHashState(input: {
  patch: string;
  locale: string;
  sourceUrl: string;
  sourceHash: string;
}): Promise<"NEW" | "UNCHANGED" | "REVISION"> {
  const release = await prisma.patchRelease.findUnique({
    where: {
      patch_locale_sourceUrl: {
        patch: input.patch,
        locale: input.locale,
        sourceUrl: input.sourceUrl
      }
    },
    include: { revisions: { select: { sourceHash: true } } }
  });
  if (!release) return "NEW";
  return release.revisions.some((revision) => revision.sourceHash === input.sourceHash)
    ? "UNCHANGED"
    : "REVISION";
}

export async function persistPatchRelease(
  release: PatchRelease,
  attemptStatus: Extract<PatchAttemptStatus, "SUCCESS" | "STALE_FALLBACK">,
  cacheState: string
): Promise<PatchImportPersistenceResult> {
  return prisma.$transaction(async (tx) => {
    const identity = await tx.patchRelease.upsert({
      where: {
        patch_locale_sourceUrl: {
          patch: release.patch,
          locale: release.locale,
          sourceUrl: release.sourceUrl
        }
      },
      update: {},
      create: {
        patch: release.patch,
        locale: release.locale,
        sourceUrl: release.sourceUrl
      },
      include: { revisions: { orderBy: { revision: "desc" } } }
    });
    const { content, revision } = decidePatchRevision(identity.revisions, release.sourceHash);
    if (content !== "UNCHANGED") {
      await tx.patchReleaseRevision.create({
        data: {
          patchReleaseId: identity.id,
          revision,
          sourceHash: release.sourceHash,
          title: release.title,
          publishedAt: release.publishedAt ? new Date(release.publishedAt) : null,
          collectedAt: new Date(release.collectedAt),
          parserVersion: release.parserVersion,
          status: release.status,
          changesJson: asJson(release.changes),
          provenanceJson: asJson(release.provenance)
        }
      });
    }
    await tx.patchImportAttempt.create({
      data: {
        patchReleaseId: identity.id,
        patch: release.patch,
        locale: release.locale,
        sourceUrl: release.sourceUrl,
        status: attemptStatus,
        cacheState
      }
    });
    return { content, revision, releaseId: identity.id };
  });
}

export async function recordPatchImportFailure(input: {
  patch: string;
  locale: string;
  sourceUrl: string;
  status: Extract<PatchAttemptStatus, "PAGE_UNAVAILABLE" | "PARSER_INCOMPATIBLE">;
  errorCode: string;
  cacheState?: string;
}): Promise<void> {
  const release = await prisma.patchRelease.findUnique({
    where: {
      patch_locale_sourceUrl: {
        patch: input.patch,
        locale: input.locale,
        sourceUrl: input.sourceUrl
      }
    },
    select: { id: true }
  });
  await prisma.patchImportAttempt.create({
    data: {
      patchReleaseId: release?.id,
      patch: input.patch,
      locale: input.locale,
      sourceUrl: input.sourceUrl,
      status: input.status,
      errorCode: input.errorCode,
      cacheState: input.cacheState
    }
  });
}

export async function findPatchRelease(
  patch: string,
  locale: string
): Promise<StoredPatchRelease | null> {
  const identity = await prisma.patchRelease.findFirst({
    where: { patch, locale },
    orderBy: { createdAt: "desc" },
    include: {
      revisions: { orderBy: { revision: "desc" } },
      attempts: { orderBy: { attemptedAt: "desc" }, take: 1 }
    }
  });
  const latest = identity?.revisions[0];
  if (!identity || !latest) return null;
  return releaseFromRows(identity, latest, identity.revisions, identity.attempts[0]);
}

export async function listPatchReleases(locale: string): Promise<PatchReleaseSummary[]> {
  const identities = await prisma.patchRelease.findMany({
    where: { locale },
    include: {
      revisions: { orderBy: { revision: "desc" } },
      attempts: { orderBy: { attemptedAt: "desc" }, take: 1 }
    }
  });
  return identities
    .flatMap((identity) => {
      const latest = identity.revisions[0];
      return latest
        ? [
            summarizePatchRelease(
              releaseFromRows(identity, latest, identity.revisions, identity.attempts[0])
            )
          ]
        : [];
    })
    .sort((a, b) => {
      const [aMajor = 0, aMinor = 0] = a.patch.split(".").map(Number);
      const [bMajor = 0, bMinor = 0] = b.patch.split(".").map(Number);
      return bMajor - aMajor || bMinor - aMinor;
    });
}

export async function findLatestPatchFailure(patch: string, locale: string) {
  return prisma.patchImportAttempt.findFirst({
    where: { patch, locale, status: { in: ["PAGE_UNAVAILABLE", "PARSER_INCOMPATIBLE"] } },
    orderBy: { attemptedAt: "desc" },
    select: { status: true, errorCode: true, attemptedAt: true, sourceUrl: true }
  });
}
