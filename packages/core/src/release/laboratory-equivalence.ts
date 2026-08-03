import type { ReplayInputBundle } from "../calibration/replay-input-bundle.js";
import { replayRecommendationEngineV1 } from "../calibration/replay-verifier.js";
import type { CalibrationRanking } from "../calibration/ranking-comparison.js";
import type { EffectiveRecommendationConfiguration } from "./effective-configuration.js";

/**
 * Equivalência entre o laboratório e o motor operacional (Etapa 27a).
 *
 * O laboratório de calibração (Etapa 25) reponderou a candidata a partir de
 * **métricas já congeladas** no snapshot — nunca reexecutou o motor com
 * `championStats`/`ChampionTag`/capacidades reais. Antes de uma release
 * poder ficar pronta pra ativação, é preciso provar que o motor de verdade,
 * alimentado pelo `ReplayInputBundle` (Etapa 26 — os inputs históricos reais
 * daquele draft), reproduz o mesmo resultado que o laboratório calculou pela
 * via aproximada. Concordância entre os dois caminhos é a evidência de que a
 * reponderação por métrica congelada foi um proxy válido para a candidata.
 *
 * Só compara casos cujo bundle está disponível — sem bundle não há como
 * reexecutar o motor com dado histórico real, e por isso o caso não entra
 * na amostra (nunca é contado como divergência).
 */

/** Mesma magnitude de tolerância usada em `calibration/replay-verifier.ts`. */
export const RELEASE_SCORE_TOLERANCE = 0.05;
export const RELEASE_COVERAGE_TOLERANCE = 1e-6;

export interface LaboratoryEquivalenceCase {
  snapshotId: string;
  /** Inputs históricos reais deste caso, capturados pela Etapa 26. */
  bundle: ReplayInputBundle;
  /** Ranking que o laboratório persistiu para a candidata, neste caso. */
  laboratoryCandidateRanking: CalibrationRanking;
}

export interface LaboratoryEquivalenceDivergence {
  snapshotId: string;
  championId?: number;
  field: string;
  expected: number | string | null;
  reconstructed: number | string | null;
  delta?: number;
}

export type LaboratoryEquivalenceCaseStatus = "MATCH" | "MISMATCH" | "NOT_REPLAYABLE";

export interface LaboratoryEquivalenceCaseResult {
  snapshotId: string;
  status: LaboratoryEquivalenceCaseStatus;
  divergences: LaboratoryEquivalenceDivergence[];
}

export type LaboratoryEquivalenceStatus = "MATCH" | "MISMATCH" | "NO_EXACT_REPLAY_CASES";

export interface LaboratoryEquivalenceResult {
  status: LaboratoryEquivalenceStatus;
  caseResults: LaboratoryEquivalenceCaseResult[];
}

/**
 * Roda o motor operacional puro com a configuração da release, alimentado
 * só pelo bundle de cada caso, e compara com o resultado persistido pelo
 * laboratório. Não corrige nenhuma divergência — só relata.
 */
export function evaluateLaboratoryEquivalence(input: {
  configuration: EffectiveRecommendationConfiguration;
  cases: readonly LaboratoryEquivalenceCase[];
}): LaboratoryEquivalenceResult {
  const caseResults = input.cases.map((testCase) => evaluateCase(testCase, input.configuration));
  const comparable = caseResults.filter((result) => result.status !== "NOT_REPLAYABLE");

  if (comparable.length === 0) {
    return { status: "NO_EXACT_REPLAY_CASES", caseResults };
  }
  const status: LaboratoryEquivalenceStatus = comparable.every(
    (result) => result.status === "MATCH"
  )
    ? "MATCH"
    : "MISMATCH";
  return { status, caseResults };
}

function evaluateCase(
  testCase: LaboratoryEquivalenceCase,
  configuration: EffectiveRecommendationConfiguration
): LaboratoryEquivalenceCaseResult {
  const { bundle, laboratoryCandidateRanking, snapshotId } = testCase;
  if (bundle.snapshotId !== snapshotId) {
    return {
      snapshotId,
      status: "NOT_REPLAYABLE",
      divergences: [
        {
          snapshotId,
          field: "bundle.snapshotId",
          expected: snapshotId,
          reconstructed: bundle.snapshotId
        }
      ]
    };
  }

  const reconstructed = replayRecommendationEngineV1(bundle, configuration);
  const byChampion = new Map(reconstructed.map((entry) => [entry.championId, entry]));
  const divergences: LaboratoryEquivalenceDivergence[] = [];

  // O motor operacional nunca devolve "NOT_RECOMMENDED" (nem o snapshot
  // persistido, nem `replayRecommendationEngineV1`) — só o laboratório
  // computa esse grupo pra diagnóstico próprio. Comparar contra ele
  // produziria divergência de presença em candidato que nunca deveria
  // aparecer no motor de verdade.
  const relevantEntries = laboratoryCandidateRanking.entries.filter(
    (entry) => entry.group !== "NOT_RECOMMENDED"
  );

  for (const expectedEntry of relevantEntries) {
    const actual = byChampion.get(expectedEntry.championId);
    if (!actual) {
      divergences.push({
        snapshotId,
        championId: expectedEntry.championId,
        field: "presenca",
        expected: expectedEntry.championName,
        reconstructed: null
      });
      continue;
    }

    const scoreDelta = Math.abs(actual.totalScore - expectedEntry.score);
    if (scoreDelta > RELEASE_SCORE_TOLERANCE) {
      divergences.push({
        snapshotId,
        championId: expectedEntry.championId,
        field: "score",
        expected: expectedEntry.score,
        reconstructed: actual.totalScore,
        delta: scoreDelta
      });
    }

    const coverageDelta = Math.abs(actual.dataCoverage - expectedEntry.dataCoverage);
    if (coverageDelta > RELEASE_COVERAGE_TOLERANCE) {
      divergences.push({
        snapshotId,
        championId: expectedEntry.championId,
        field: "dataCoverage",
        expected: expectedEntry.dataCoverage,
        reconstructed: actual.dataCoverage,
        delta: coverageDelta
      });
    }

    if (actual.rank !== expectedEntry.rank) {
      divergences.push({
        snapshotId,
        championId: expectedEntry.championId,
        field: "rank",
        expected: expectedEntry.rank,
        reconstructed: actual.rank
      });
    }

    if (actual.group !== expectedEntry.group) {
      divergences.push({
        snapshotId,
        championId: expectedEntry.championId,
        field: "group",
        expected: expectedEntry.group,
        reconstructed: actual.group
      });
    }
  }

  return {
    snapshotId,
    status: divergences.length === 0 ? "MATCH" : "MISMATCH",
    divergences
  };
}
