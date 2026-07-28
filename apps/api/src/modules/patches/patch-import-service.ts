import type { CacheState, PatchRelease } from "@sparta/core";
import {
  collectOfficialPatchNotesPage,
  ExternalServiceError,
  IncompatiblePatchNotesError,
  officialPatchNotesUrl,
  parseOfficialPatchNotes,
  type CollectedPatchNotesPage
} from "@sparta/riot";
import { readCache, setCached } from "../../db/api-cache.js";
import {
  findPatchHashState,
  persistPatchRelease,
  recordPatchImportFailure,
  resolvePatchCatalogAssociations
} from "./patch-repository.js";

const PATCH_NOTES_FRESH_TTL_MS = 60 * 60 * 1000;
const PATCH_NOTES_STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class PatchImportError extends Error {
  constructor(
    public readonly code: "PATCH_PAGE_UNAVAILABLE" | "PATCH_PARSER_INCOMPATIBLE",
    message: string
  ) {
    super(message);
  }
}

export interface PatchImportReport {
  patch: string;
  locale: string;
  sourceUrl: string;
  releaseStatus: PatchRelease["status"];
  changesFound: number;
  resolvedEntities: number;
  unresolvedEntities: number;
  content: "NEW" | "UNCHANGED" | "REVISION";
  revision: number | null;
  parserFailures: number;
  cacheState: CacheState;
  staleFallback: boolean;
}

function cacheKey(patch: string, locale: string): string {
  return `riot-patch-notes:${locale}:${patch}`;
}

export async function importOfficialPatchNotes(input: {
  patch: string;
  locale: string;
  persist: boolean;
}): Promise<PatchImportReport> {
  const sourceUrl = officialPatchNotesUrl(input.patch, input.locale);
  const cached = await readCache<CollectedPatchNotesPage>(
    cacheKey(input.patch, input.locale),
    PATCH_NOTES_STALE_TTL_MS
  );
  let page: CollectedPatchNotesPage;
  let cacheState = cached.metadata.state;
  let staleFallback = false;
  let fromNetwork = false;

  if (cached.metadata.state === "FRESH" && cached.value) {
    page = cached.value;
  } else {
    try {
      page = await collectOfficialPatchNotesPage(sourceUrl);
      fromNetwork = true;
      cacheState = "MISS";
    } catch (error) {
      if (cached.metadata.state === "STALE" && cached.value) {
        page = cached.value;
        cacheState = "STALE";
        staleFallback = true;
      } else {
        if (input.persist) {
          await recordPatchImportFailure({
            patch: input.patch,
            locale: input.locale,
            sourceUrl,
            status: "PAGE_UNAVAILABLE",
            errorCode: error instanceof ExternalServiceError ? error.code : "NETWORK_UNAVAILABLE",
            cacheState: cached.metadata.state
          });
        }
        throw new PatchImportError(
          "PATCH_PAGE_UNAVAILABLE",
          "A página oficial do patch está indisponível."
        );
      }
    }
  }

  let parsed: PatchRelease;
  try {
    parsed = parseOfficialPatchNotes({
      html: page.html,
      patch: input.patch,
      locale: input.locale,
      sourceUrl: page.sourceUrl,
      collectedAt: page.collectedAt
    });
  } catch (error) {
    if (input.persist) {
      await recordPatchImportFailure({
        patch: input.patch,
        locale: input.locale,
        sourceUrl,
        status: "PARSER_INCOMPATIBLE",
        errorCode:
          error instanceof IncompatiblePatchNotesError ? error.code : "PATCH_PARSER_INCOMPATIBLE",
        cacheState
      });
    }
    throw new PatchImportError(
      "PATCH_PARSER_INCOMPATIBLE",
      "A estrutura da página oficial não é compatível com o parser atual."
    );
  }

  if (fromNetwork && input.persist) {
    await setCached(cacheKey(input.patch, input.locale), page, PATCH_NOTES_FRESH_TTL_MS);
  }
  const resolved = await resolvePatchCatalogAssociations(parsed);
  const release: PatchRelease = staleFallback
    ? {
        ...resolved.release,
        status: "STALE",
        staleReason: "Conteúdo servido do último cache oficial válido após falha de coleta.",
        provenance: {
          ...resolved.release.provenance,
          status: "STALE",
          staleReason: "Conteúdo servido do último cache oficial válido após falha de coleta.",
          cache: {
            ...cached.metadata,
            state: "STALE",
            servedAsFallback: true
          }
        }
      }
    : resolved.release;
  const content = await findPatchHashState({
    patch: release.patch,
    locale: release.locale,
    sourceUrl: release.sourceUrl,
    sourceHash: release.sourceHash
  });
  const persistence = input.persist
    ? await persistPatchRelease(release, staleFallback ? "STALE_FALLBACK" : "SUCCESS", cacheState)
    : null;

  return {
    patch: release.patch,
    locale: release.locale,
    sourceUrl: release.sourceUrl,
    releaseStatus: release.status,
    changesFound: release.changes.length,
    resolvedEntities: resolved.resolvedEntities,
    unresolvedEntities: resolved.unresolvedEntities,
    content: persistence?.content ?? content,
    revision: persistence?.revision ?? null,
    parserFailures: 0,
    cacheState,
    staleFallback
  };
}
