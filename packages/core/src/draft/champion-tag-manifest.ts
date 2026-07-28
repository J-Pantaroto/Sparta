import type { ChampionTag, DamageProfile, Role } from "../types/domain.js";
import type { ChampionDifficultyEvidence } from "../types/champion-difficulty.js";
import {
  CHAMPION_TAG_DIMENSIONS,
  CHAMPION_TAG_NUMERIC_DIMENSIONS,
  deriveReviewState,
  type ChampionTagDimension,
  type ChampionTagOverride,
  type ChampionTagProvenance
} from "../types/champion-tag-provenance.js";
import { CHAMPION_TAG_DERIVATION_VERSION } from "./champion-tag-derivation.js";
import { CHAMPION_DIFFICULTY_NORMALIZATION_VERSION } from "./execution-risk.js";

/**
 * Leitura, montagem e validação do arquivo versionado de `ChampionTag`
 * (`data/seeds/champion-tags.json`).
 *
 * ## Formato
 *
 * Um manifesto `{ metadata, champions }` em vez de um array plano. Os
 * metadados (versão da Data Dragon, locale, recurso, versão do algoritmo,
 * data de geração) valem para o arquivo inteiro — repeti-los em 173
 * entradas encheria o diff de ruído a cada regeração sem acrescentar
 * informação.
 *
 * ## Onde mora a curadoria
 *
 * Cada entrada guarda os **valores efetivos** (é isso que se quer ler num
 * diff) e, em `review.overrides`, **quais dimensões** foram revisadas à
 * mão, com motivo e data quando conhecidos. O estado de revisão não é
 * gravado: é derivado das chaves de `overrides`, então não tem como
 * divergir da lista.
 *
 * Consequência deliberada: editar um valor **sem** registrar o override faz
 * a regeneração devolvê-lo ao valor derivado. O gerador avisa quando
 * detecta esse caso, em vez de descartar a edição em silêncio.
 *
 * ## Formato antigo
 *
 * Um array plano (o formato anterior a esta etapa) continua sendo lido. Ele
 * não tem metadados, então as entradas saem **sem proveniência** — origem
 * não informada. O `source: "manual"` de lá não é promovido a "revisado":
 * "alguém curou isto" e "não sabemos de onde veio" são afirmações
 * diferentes, e converter uma na outra é exatamente o tipo de invenção que
 * esta etapa existe pra impedir.
 */

export const CHAMPION_TAG_SOURCE_RESOURCE = "champion.json";
export const CHAMPION_TAG_SOURCE_ID = "data-dragon";

export interface ChampionTagManifestMetadata {
  /** Versão real da Data Dragon usada na geração. Ausente = desconhecida. */
  dataDragonVersion?: string;
  locale?: string;
  sourceResource?: string;
  algorithmVersion?: string;
  difficultyNormalizationAlgorithmVersion?: string;
  /** ISO 8601. Só muda quando o conteúdo funcional muda. */
  generatedAt?: string;
}

/** Uma entrada do arquivo: valores efetivos + o que foi revisado. */
export interface ChampionTagManifestEntry {
  championId: number;
  championName: string;
  roles: Role[];
  damageProfile: DamageProfile;
  tags: string[];
  blindSafety: number;
  difficulty: number;
  dataDragonDifficultyOriginal?: number;
  dataDragonDifficultyNormalized?: number;
  engage: number;
  peel: number;
  frontline: number;
  pickoff: number;
  waveclear: number;
  scaling: number;
  earlyPressure: number;
  review?: { overrides: Partial<Record<ChampionTagDimension, ChampionTagOverride>> };
}

export interface ChampionTagManifest {
  /** Ausente quando o arquivo é do formato antigo (array plano). */
  metadata?: ChampionTagManifestMetadata;
  champions: ChampionTagManifestEntry[];
}

/** Ordem estável das chaves numéricas, pra serialização determinística. */
const NUMERIC_KEYS = CHAMPION_TAG_NUMERIC_DIMENSIONS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEntry(raw: unknown): ChampionTagManifestEntry | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.championId !== "number" || typeof raw.championName !== "string") return null;

  const entry: ChampionTagManifestEntry = {
    championId: raw.championId,
    championName: raw.championName,
    // Campo legado pode existir no JSON, mas não possui semântica global
    // conhecida. O adaptador público de compatibilidade pode lê-lo; o
    // manifesto de ChampionTag nunca o promove.
    roles: [],
    damageProfile: (raw.damageProfile as DamageProfile) ?? "MIXED",
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    blindSafety: Number(raw.blindSafety),
    difficulty: Number(raw.difficulty),
    dataDragonDifficultyOriginal:
      typeof raw.dataDragonDifficultyOriginal === "number"
        ? raw.dataDragonDifficultyOriginal
        : undefined,
    dataDragonDifficultyNormalized:
      typeof raw.dataDragonDifficultyNormalized === "number"
        ? raw.dataDragonDifficultyNormalized
        : undefined,
    engage: Number(raw.engage),
    peel: Number(raw.peel),
    frontline: Number(raw.frontline),
    pickoff: Number(raw.pickoff),
    waveclear: Number(raw.waveclear),
    scaling: Number(raw.scaling),
    earlyPressure: Number(raw.earlyPressure)
  };

  if (isRecord(raw.review) && isRecord(raw.review.overrides)) {
    const overrides: Partial<Record<ChampionTagDimension, ChampionTagOverride>> = {};
    for (const dimension of CHAMPION_TAG_DIMENSIONS) {
      const detail = raw.review.overrides[dimension];
      if (detail === undefined) continue;
      overrides[dimension] = isRecord(detail)
        ? {
            reason: typeof detail.reason === "string" ? detail.reason : undefined,
            reviewedAt: typeof detail.reviewedAt === "string" ? detail.reviewedAt : undefined
          }
        : {};
    }
    if (Object.keys(overrides).length > 0) entry.review = { overrides };
  }

  return entry;
}

/**
 * Lê o conteúdo do arquivo, aceitando o manifesto atual e o array antigo.
 * Nunca lança por conteúdo inesperado: entrada irreconhecível é descartada
 * e o chamador vê a diferença de contagem.
 */
export function parseChampionTagManifest(raw: unknown): ChampionTagManifest {
  if (Array.isArray(raw)) {
    // Formato antigo: sem metadados, e portanto sem proveniência.
    return { champions: raw.map(readEntry).filter((entry): entry is ChampionTagManifestEntry => entry !== null) };
  }

  if (!isRecord(raw) || !Array.isArray(raw.champions)) return { champions: [] };

  const metadata = isRecord(raw.metadata)
    ? {
        dataDragonVersion: typeof raw.metadata.dataDragonVersion === "string" ? raw.metadata.dataDragonVersion : undefined,
        locale: typeof raw.metadata.locale === "string" ? raw.metadata.locale : undefined,
        sourceResource: typeof raw.metadata.sourceResource === "string" ? raw.metadata.sourceResource : undefined,
        algorithmVersion: typeof raw.metadata.algorithmVersion === "string" ? raw.metadata.algorithmVersion : undefined,
        difficultyNormalizationAlgorithmVersion:
          typeof raw.metadata.difficultyNormalizationAlgorithmVersion === "string"
            ? raw.metadata.difficultyNormalizationAlgorithmVersion
            : undefined,
        generatedAt: typeof raw.metadata.generatedAt === "string" ? raw.metadata.generatedAt : undefined
      }
    : undefined;

  return {
    metadata,
    champions: raw.champions.map(readEntry).filter((entry): entry is ChampionTagManifestEntry => entry !== null)
  };
}

/**
 * Proveniência de uma entrada. `undefined` quando o arquivo não tem
 * metadados — sem eles não dá pra afirmar versão, algoritmo nem revisão.
 */
export function entryProvenance(
  entry: ChampionTagManifestEntry,
  metadata: ChampionTagManifestMetadata | undefined
): ChampionTagProvenance | undefined {
  if (!metadata) return undefined;

  const overrides = entry.review?.overrides;
  const reviewedDimensions = overrides
    ? CHAMPION_TAG_DIMENSIONS.filter((dimension) => overrides[dimension] !== undefined)
    : [];

  return {
    source: {
      // DERIVED, nunca OFFICIAL: a Riot publica classe e notas, não estas
      // dimensões. Vale inclusive pra entrada revisada - curadoria é
      // julgamento de design, não publicação oficial.
      sourceType: "DERIVED",
      sourceId: CHAMPION_TAG_SOURCE_ID,
      resource: metadata.sourceResource,
      // Versão ausente permanece ausente: nunca preenchida com um default.
      patch: metadata.dataDragonVersion,
      locale: metadata.locale,
      algorithmVersion: metadata.algorithmVersion,
      collectedAt: metadata.generatedAt,
      status: "AVAILABLE"
    },
    reviewState: deriveReviewState(reviewedDimensions),
    reviewedDimensions,
    overrides
  };
}

/** Converte o manifesto no tipo de domínio consumido pelos motores. */
export function toChampionTags(manifest: ChampionTagManifest): ChampionTag[] {
  return manifest.champions.map((entry) => ({
    championId: entry.championId,
    championName: entry.championName,
    roles: [],
    damageProfile: entry.damageProfile,
    tags: entry.tags,
    blindSafety: entry.blindSafety,
    difficulty: entry.difficulty,
    officialDifficulty: entryDifficultyEvidence(entry, manifest.metadata),
    engage: entry.engage,
    peel: entry.peel,
    frontline: entry.frontline,
    pickoff: entry.pickoff,
    waveclear: entry.waveclear,
    scaling: entry.scaling,
    earlyPressure: entry.earlyPressure,
    provenance: entryProvenance(entry, manifest.metadata)
  }));
}

function entryDifficultyEvidence(
  entry: ChampionTagManifestEntry,
  metadata: ChampionTagManifestMetadata | undefined
): ChampionDifficultyEvidence | undefined {
  const originalValue = entry.dataDragonDifficultyOriginal;
  const normalizedValue = entry.dataDragonDifficultyNormalized;
  const algorithmVersion =
    metadata?.difficultyNormalizationAlgorithmVersion;
  if (
    originalValue === undefined ||
    normalizedValue === undefined ||
    algorithmVersion === undefined ||
    !Number.isFinite(originalValue) ||
    originalValue < 0 ||
    originalValue > 10 ||
    !Number.isFinite(normalizedValue) ||
    normalizedValue < 0 ||
    normalizedValue > 100
  ) {
    return undefined;
  }

  return {
    originalValue,
    originalScale: { min: 0, max: 10 },
    normalizedValue,
    normalizationAlgorithmVersion: algorithmVersion,
    provenance: {
      sourceType: "OFFICIAL",
      sourceId: CHAMPION_TAG_SOURCE_ID,
      resource: `${metadata?.sourceResource ?? CHAMPION_TAG_SOURCE_RESOURCE}#info.difficulty`,
      patch: metadata?.dataDragonVersion,
      locale: metadata?.locale,
      collectedAt: metadata?.generatedAt,
      status: "AVAILABLE"
    }
  };
}

export interface ChampionTagValidationIssue {
  championId: number;
  championName: string;
  dimension: ChampionTagDimension;
  problem: string;
}

/** Dimensões numéricas precisam ser finitas e ficar em 0-1. */
export function validateChampionTagEntries(entries: ChampionTagManifestEntry[]): ChampionTagValidationIssue[] {
  const issues: ChampionTagValidationIssue[] = [];
  for (const entry of entries) {
    for (const dimension of NUMERIC_KEYS) {
      const value = entry[dimension];
      if (!Number.isFinite(value)) {
        issues.push({ championId: entry.championId, championName: entry.championName, dimension, problem: "não é um número finito" });
      } else if (value < 0 || value > 1) {
        issues.push({ championId: entry.championId, championName: entry.championName, dimension, problem: `fora da faixa 0-1 (${value})` });
      }
    }
  }
  return issues;
}

export interface ChampionTagBuildReport {
  /** Campeões presentes na fonte e ausentes do arquivo anterior. */
  added: string[];
  /** Campeões que estavam no arquivo e sumiram da fonte. */
  removed: string[];
  /** Dimensões sobrescritas à mão, preservadas nesta geração. */
  preservedOverrides: number;
  championsWithOverrides: number;
  /**
   * Valores editados à mão **sem** registrar o override: a regeneração os
   * devolveria ao valor derivado. Avisados em vez de descartados em
   * silêncio.
   */
  unregisteredEdits: { championName: string; dimension: ChampionTagDimension }[];
  validationIssues: ChampionTagValidationIssue[];
  /** `true` quando nada funcional mudou em relação ao arquivo anterior. */
  unchanged: boolean;
}

function functionalEquals(a: ChampionTagManifestEntry[], b: ChampionTagManifestEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Leitura de uma dimensão pelo nome, sem afrouxar o tipo da entrada. */
function fieldOf(entry: ChampionTagManifestEntry, dimension: ChampionTagDimension): unknown {
  return entry[dimension];
}

/** Escrita de uma dimensão pelo nome. Usada só pra aplicar overrides. */
function assignField(target: ChampionTagManifestEntry, dimension: ChampionTagDimension, value: unknown): void {
  Object.assign(target, { [dimension]: value });
}

/** Ordena as chaves de forma estável, pra o JSON gravado ser determinístico. */
function normalizeEntry(entry: ChampionTagManifestEntry): ChampionTagManifestEntry {
  const normalized: ChampionTagManifestEntry = {
    championId: entry.championId,
    championName: entry.championName,
    roles: [],
    damageProfile: entry.damageProfile,
    tags: entry.tags,
    blindSafety: entry.blindSafety,
    difficulty: entry.difficulty,
    dataDragonDifficultyOriginal: entry.dataDragonDifficultyOriginal,
    dataDragonDifficultyNormalized: entry.dataDragonDifficultyNormalized,
    engage: entry.engage,
    peel: entry.peel,
    frontline: entry.frontline,
    pickoff: entry.pickoff,
    waveclear: entry.waveclear,
    scaling: entry.scaling,
    earlyPressure: entry.earlyPressure
  };

  const overrides = entry.review?.overrides;
  if (overrides) {
    const ordered: Partial<Record<ChampionTagDimension, ChampionTagOverride>> = {};
    for (const dimension of CHAMPION_TAG_DIMENSIONS) {
      const detail = overrides[dimension];
      if (detail === undefined) continue;
      const clean: ChampionTagOverride = {};
      if (detail.reason !== undefined) clean.reason = detail.reason;
      if (detail.reviewedAt !== undefined) clean.reviewedAt = detail.reviewedAt;
      ordered[dimension] = clean;
    }
    if (Object.keys(ordered).length > 0) normalized.review = { overrides: ordered };
  }

  return normalized;
}

export interface BuildChampionTagManifestInput {
  /** Saída de `deriveChampionTag` para cada campeão da fonte. */
  derived: ChampionTag[];
  /** Conteúdo atual do arquivo, pra preservar overrides. */
  previous: ChampionTagManifest;
  dataDragonVersion: string;
  locale: string;
  /** ISO 8601. Só é gravado quando o conteúdo funcional muda. */
  now: string;
}

/**
 * Monta o manifesto novo preservando, **por dimensão**, tudo que foi
 * revisado à mão. Uma dimensão sobrescrita não impede as outras oito de
 * receberem a derivação atualizada - era exatamente o que o formato
 * anterior fazia, ao preservar a entrada inteira por `source: "manual"`.
 */
export function buildChampionTagManifest(
  input: BuildChampionTagManifestInput
): { manifest: ChampionTagManifest; report: ChampionTagBuildReport } {
  const previousById = new Map(input.previous.champions.map((entry) => [entry.championId, entry]));
  const derivedById = new Map<number, ChampionTag>();
  for (const tag of input.derived) {
    if (tag.championId !== undefined) derivedById.set(tag.championId, tag);
  }

  const unregisteredEdits: ChampionTagBuildReport["unregisteredEdits"] = [];
  let preservedOverrides = 0;
  let championsWithOverrides = 0;

  const champions: ChampionTagManifestEntry[] = [];
  for (const tag of input.derived) {
    if (tag.championId === undefined) continue;
    const previous = previousById.get(tag.championId);
    const overrides = previous?.review?.overrides;

    const entry: ChampionTagManifestEntry = {
      championId: tag.championId,
      championName: tag.championName,
      roles: [],
      damageProfile: tag.damageProfile,
      tags: tag.tags,
      blindSafety: tag.blindSafety,
      difficulty: tag.difficulty,
      dataDragonDifficultyOriginal: tag.officialDifficulty?.originalValue,
      dataDragonDifficultyNormalized: tag.officialDifficulty?.normalizedValue,
      engage: tag.engage,
      peel: tag.peel,
      frontline: tag.frontline,
      pickoff: tag.pickoff,
      waveclear: tag.waveclear,
      scaling: tag.scaling,
      earlyPressure: tag.earlyPressure
    };

    if (previous) {
      for (const dimension of CHAMPION_TAG_DIMENSIONS) {
        const overridden = overrides?.[dimension] !== undefined;
        if (overridden) {
          // Valor curado vence a derivação, campo a campo.
          assignField(entry, dimension, fieldOf(previous, dimension));
          preservedOverrides += 1;
          continue;
        }
        // Não sobrescrito: a derivação manda. Se o arquivo tinha outro
        // valor, alguém editou sem registrar - avisa antes de perder.
        const previousValue = JSON.stringify(fieldOf(previous, dimension));
        const derivedValue = JSON.stringify(fieldOf(entry, dimension));
        if (previousValue !== derivedValue) {
          unregisteredEdits.push({ championName: tag.championName, dimension });
        }
      }
      if (overrides && Object.keys(overrides).length > 0) {
        entry.review = { overrides };
        championsWithOverrides += 1;
      }
    }

    champions.push(normalizeEntry(entry));
  }

  champions.sort((a, b) => a.championName.localeCompare(b.championName, "en"));

  const added = champions
    .filter((entry) => !previousById.has(entry.championId))
    .map((entry) => entry.championName)
    .sort();
  const removed = input.previous.champions
    .filter((entry) => !derivedById.has(entry.championId))
    .map((entry) => entry.championName)
    .sort();

  const unchanged =
    functionalEquals(champions, input.previous.champions.map(normalizeEntry)) &&
    input.previous.metadata?.dataDragonVersion === input.dataDragonVersion &&
    input.previous.metadata?.locale === input.locale &&
    input.previous.metadata?.algorithmVersion === CHAMPION_TAG_DERIVATION_VERSION &&
    input.previous.metadata?.difficultyNormalizationAlgorithmVersion ===
      CHAMPION_DIFFICULTY_NORMALIZATION_VERSION;

  return {
    manifest: {
      metadata: {
        dataDragonVersion: input.dataDragonVersion,
        locale: input.locale,
        sourceResource: CHAMPION_TAG_SOURCE_RESOURCE,
        algorithmVersion: CHAMPION_TAG_DERIVATION_VERSION,
        difficultyNormalizationAlgorithmVersion:
          CHAMPION_DIFFICULTY_NORMALIZATION_VERSION,
        // Nada funcional mudou: mantém a data anterior. Sem isso, rodar o
        // gerador de novo produziria um diff só de timestamp.
        generatedAt: unchanged ? (input.previous.metadata?.generatedAt ?? input.now) : input.now
      },
      champions
    },
    report: {
      added,
      removed,
      preservedOverrides,
      championsWithOverrides,
      unregisteredEdits,
      validationIssues: validateChampionTagEntries(champions),
      unchanged
    }
  };
}

/** Serialização estável do manifesto. */
export function serializeChampionTagManifest(manifest: ChampionTagManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
