import {
  aggregatePersonalLoadoutEvidence,
  type PersonalLoadoutEvidence
} from "../aggregation/personal-loadout-evidence.js";
import type { KnownDraftState } from "../draft/draft-session.js";
import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";
import type { MatchLoadoutObservation } from "../types/match-observation.js";
import type { AvailabilityStatus, DataProvenance } from "../types/provenance.js";
import type { RecommendationMetric } from "../types/recommendation-metric.js";
import type { PlayerRoleSource, Role } from "../types/domain.js";
import type { PatchChange } from "../patch/patch-intelligence.js";
import type { TheoreticalPatchImpact } from "../patch/theoretical-patch-impact.js";

export const DRAFT_POSTGAME_COMPARISON_VERSION = "draft-postgame-comparison/1.0.0";

export type DraftPostGameChoiceGroup = "PRIMARY" | "ALTERNATIVE" | "NOT_IN_SNAPSHOT";

export type DraftPostGameSignalKey =
  | "POSITION_ALIGNMENT"
  | "CHAMPION_ALIGNMENT"
  | "EXECUTION_RISK_AND_EARLY_DEATHS"
  | "PERSONAL_MATCHUP_AND_RESULT"
  | "OBJECTIVE_PARTICIPATION"
  | "FINAL_INVENTORY_HISTORY"
  | "RUNE_PAGE_HISTORY"
  | "SUMMONER_SPELL_HISTORY"
  | "PATCH_CONTEXT"
  | "GLOBAL_MATCHUP"
  | "GLOBAL_PATCH_IMPACT";

export interface PostGameComparisonSignal {
  id: string;
  key: DraftPostGameSignalKey;
  status: AvailabilityStatus;
  statement: string;
  beforeMatch?: {
    label: string;
    value: unknown;
    provenance?: DataProvenance;
  };
  afterMatch?: {
    label: string;
    value: unknown;
    provenance?: DataProvenance;
  };
  limitation: string;
  unavailableReason?: string;
}

export interface DraftDecisionContext {
  snapshotId?: string;
  snapshotInputHash?: string;
  snapshotCreatedAt?: string;
  analysisRole: Role;
  roleSource: PlayerRoleSource;
  patch?: string;
  queueId?: number;
  knownDraft: KnownDraftState;
  snapshotCoverage?: number;
  snapshotAlgorithmVersions: Record<string, string>;
  patchContext?: DraftPostGamePatchContext;
}

export interface SelectedChoiceComparison {
  championId: number;
  championName: string;
  group: DraftPostGameChoiceGroup;
  rank?: number;
  score?: number;
  coverage?: number;
  poolSource?: string;
  personalGames?: number;
  difficulty?: RecommendationMetric;
  personalExperience?: RecommendationMetric;
  executionRisk?: RecommendationMetric;
  strategicSignals: string[];
  knownLimitations: string[];
  unavailableMetricKeys: string[];
}

export interface ObservedMatchSummary {
  championId: number;
  championName: string;
  won: boolean;
  observedRole?: Role;
  assignedRole?: Role;
  positionStatus: AvailabilityStatus;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  totalCs?: number;
  goldEarned?: number;
  damageToChampions?: number;
  visionScore?: number;
  csPerMinute: number;
  goldPerMinute: number;
  damagePerMinute: number;
  visionScorePerMinute: number;
  killParticipation?: number;
  objectiveParticipation?: number;
  objectiveTakedowns?: number;
  teamObjectiveKills?: number;
  deathsBefore10?: number;
  deathsBefore15?: number;
  csAt10?: number;
  csAt15?: number;
  goldDiffAt15?: number;
  durationSeconds?: number;
  queueId?: number;
  patch?: string;
  gameVersion?: string;
  finalItems: number[];
  runeIds: number[];
  summonerSpellIds: number[];
}

export interface DraftPostGameCoverage {
  snapshotAvailable: boolean;
  selectedChampionInSnapshot: boolean;
  positionCompatible: boolean;
  directOpponentConfirmed: boolean;
  timelineAvailable: boolean;
  observedStatsAvailable: boolean;
  loadoutAvailable: boolean;
  objectiveParticipationAvailable: boolean;
}

export interface DraftPostGamePatchContext {
  changes: PatchChange[];
  theoreticalImpact?: TheoreticalPatchImpact;
  /** Se a revisão persistida já existia quando o snapshot foi criado. */
  availableAtDraft: boolean;
}

export interface DraftPostGameComparison {
  draftSessionId: string;
  snapshotId?: string;
  matchId: string;
  revision?: number;
  status: AvailabilityStatus;
  coverage: number;
  coverageDimensions: DraftPostGameCoverage;
  draftContext: DraftDecisionContext;
  selectedChoice: SelectedChoiceComparison;
  observedMatch: ObservedMatchSummary;
  comparableSignals: PostGameComparisonSignal[];
  unavailableSignals: PostGameComparisonSignal[];
  algorithmVersion: string;
  sourceAlgorithmVersions: Record<string, string>;
  snapshotSignalIds: string[];
  inputHash?: string;
  generatedAt: string;
  provenance: DataProvenance;
}

export interface DraftPostGameComparisonInput {
  draftSessionId: string;
  matchId: string;
  generatedAt: string;
  session: {
    role: Role;
    roleSource: PlayerRoleSource;
    patch?: string;
    queueId?: number;
    selectedChampionId: number;
    knownDraft: KnownDraftState;
  };
  snapshot?: {
    id: string;
    inputHash: string;
    createdAt: string;
    dataCoverage: number;
    algorithmVersions: Record<string, string>;
    recommendations: PersistedRecommendation[];
  };
  selectedChampionName: string;
  observed: {
    championId: number;
    championName: string;
    won: boolean;
    observedRole?: Role;
    assignedRole?: Role;
    positionStatus: AvailabilityStatus;
    kills: number;
    deaths: number;
    assists: number;
    totalCs?: number;
    goldEarned?: number;
    damageToChampions?: number;
    visionScore?: number;
    csPerMinute: number;
    goldPerMinute: number;
    damagePerMinute: number;
    visionScorePerMinute: number;
    killParticipation?: number;
    objectiveParticipation?: number;
    objectiveTakedowns?: number;
    teamObjectiveKills?: number;
    durationSeconds?: number;
    queueId?: number;
    patch?: string;
    gameVersion?: string;
  };
  timeline?: {
    deathsBefore10: number;
    deathsBefore15: number;
    csAt10?: number;
    csAt15?: number;
    goldDiffAt15?: number;
  };
  currentLoadout?: MatchLoadoutObservation;
  historicalLoadout?: PersonalLoadoutEvidence;
  directOpponent?: {
    championId: number;
    championName: string;
    confirmed: boolean;
  };
  patchContext?: DraftPostGamePatchContext;
}

const SIGNAL_LIMITATION =
  "A correspondência é descritiva; não demonstra causalidade e não valida nem invalida a recomendação.";

function metric(
  recommendation: PersistedRecommendation | undefined,
  key: RecommendationMetric["key"]
): RecommendationMetric | undefined {
  return recommendation?.metricDetails.find((entry) => entry.key === key);
}

function unavailable(
  key: DraftPostGameSignalKey,
  reason: string,
  statement = "Esta comparação não está disponível com os dados persistidos."
): PostGameComparisonSignal {
  return {
    id: `postgame:${key.toLowerCase()}`,
    key,
    status: "UNAVAILABLE",
    statement,
    limitation: SIGNAL_LIMITATION,
    unavailableReason: reason
  };
}

function available(
  input: Omit<PostGameComparisonSignal, "status" | "limitation">
): PostGameComparisonSignal {
  return { ...input, status: "AVAILABLE", limitation: SIGNAL_LIMITATION };
}

function patternSignal(input: {
  key: "FINAL_INVENTORY_HISTORY" | "RUNE_PAGE_HISTORY" | "SUMMONER_SPELL_HISTORY";
  label: string;
  currentSignature?: string;
  historicalSignatures: string[];
  historicalSampleSize: number;
  historicalAvailable: boolean;
  blockedReason?: string;
}): PostGameComparisonSignal {
  if (!input.historicalAvailable) {
    return unavailable(
      input.key,
      input.blockedReason ??
        "O snapshot histórico não está disponível; o histórico anterior não foi comparado."
    );
  }
  if (!input.currentSignature) {
    return unavailable(input.key, `${input.label} não disponível na observação desta partida.`);
  }
  const seen = input.historicalSignatures.includes(input.currentSignature);
  const mostFrequent = input.historicalSignatures[0];
  const statement =
    input.historicalSampleSize === 0
      ? `Esta é a primeira observação de ${input.label.toLowerCase()} no histórico disponível antes do draft.`
      : seen
        ? mostFrequent === input.currentSignature
          ? `${input.label} já observado anteriormente e igual ao padrão pessoal mais frequente naquele momento.`
          : `${input.label} já observado anteriormente, mas diferente do padrão pessoal mais frequente naquele momento.`
        : `${input.label} ainda não havia sido observado no histórico disponível antes do draft.`;
  return available({
    id: `postgame:${input.key.toLowerCase()}`,
    key: input.key,
    statement,
    beforeMatch: {
      label: "Amostra histórica anterior ao draft",
      value: input.historicalSampleSize,
      provenance: {
        sourceType: "CALCULATED",
        sourceId: "sparta",
        resource: "MatchObservation anteriores ao snapshot",
        algorithmVersion: "personal-loadout-evidence/1.0.0",
        sampleSize: input.historicalSampleSize
      }
    },
    afterMatch: {
      label: input.label,
      value: input.currentSignature,
      provenance: { sourceType: "OBSERVED", sourceId: "riot-match-v5" }
    }
  });
}

function currentLoadoutEvidence(
  input: DraftPostGameComparisonInput
): PersonalLoadoutEvidence | undefined {
  if (!input.currentLoadout) return undefined;
  return aggregatePersonalLoadoutEvidence([input.currentLoadout], {
    championId: input.observed.championId,
    role: input.observed.observedRole ?? input.session.role
  });
}

export function buildDraftPostGameComparison(
  input: DraftPostGameComparisonInput
): DraftPostGameComparison {
  const recommendation = input.snapshot?.recommendations.find(
    (entry) => entry.championId === input.session.selectedChampionId
  );
  const executionRisk = metric(recommendation, "EXECUTION_RISK");
  const personalExperience = metric(recommendation, "PERSONAL_EXPERIENCE");
  const personalMatchup = metric(recommendation, "PERSONAL_MATCHUP");
  const difficulty = metric(recommendation, "CHAMPION_DIFFICULTY");
  const observedRole = input.observed.observedRole;
  const positionCompatible = observedRole === input.session.role;
  const currentEvidence = currentLoadoutEvidence(input);

  const finalItems =
    input.currentLoadout?.items
      .filter((slot) => slot.state === "PRESENT" && slot.itemId !== undefined)
      .map((slot) => slot.itemId as number) ?? [];
  const runeIds = input.currentLoadout?.runes.selections.map((entry) => entry.perkId) ?? [];
  const summonerSpellIds =
    input.currentLoadout?.summonerSpells
      .filter((slot) => slot.state === "PRESENT" && slot.spellId !== undefined)
      .map((slot) => slot.spellId as number) ?? [];

  const coverageDimensions: DraftPostGameCoverage = {
    snapshotAvailable: input.snapshot !== undefined,
    selectedChampionInSnapshot: recommendation !== undefined,
    positionCompatible,
    directOpponentConfirmed: input.directOpponent?.confirmed === true,
    timelineAvailable: input.timeline !== undefined,
    observedStatsAvailable: true,
    loadoutAvailable: currentEvidence !== undefined && currentEvidence.status !== "UNAVAILABLE",
    objectiveParticipationAvailable: input.observed.objectiveParticipation !== undefined
  };
  const coverage =
    Object.values(coverageDimensions).filter(Boolean).length /
    Object.keys(coverageDimensions).length;

  const comparableSignals: PostGameComparisonSignal[] = [];
  const unavailableSignals: PostGameComparisonSignal[] = [];
  const add = (signal: PostGameComparisonSignal) =>
    signal.status === "UNAVAILABLE"
      ? unavailableSignals.push(signal)
      : comparableSignals.push(signal);

  add(
    observedRole
      ? available({
          id: "postgame:position_alignment",
          key: "POSITION_ALIGNMENT",
          statement: positionCompatible
            ? `A posição observada na partida (${observedRole}) corresponde à posição usada na análise do draft.`
            : `A posição observada na partida (${observedRole}) foi diferente da posição usada na análise do draft (${input.session.role}); comparações dependentes de posição foram reduzidas.`,
          beforeMatch: {
            label: "Posição da análise",
            value: input.session.role,
            provenance: {
              sourceType: input.session.roleSource === "USER" ? "USER_PROVIDED" : "OBSERVED",
              sourceId: input.session.roleSource.toLowerCase()
            }
          },
          afterMatch: {
            label: "Posição observada",
            value: observedRole,
            provenance: { sourceType: "CALCULATED", sourceId: "match-observation" }
          }
        })
      : unavailable("POSITION_ALIGNMENT", "A posição observada na partida não está disponível.")
  );

  add(
    available({
      id: "postgame:champion_alignment",
      key: "CHAMPION_ALIGNMENT",
      statement:
        input.observed.championId === input.session.selectedChampionId
          ? "O campeão registrado como escolha no draft corresponde ao campeão observado na partida."
          : `O campeão observado na partida (${input.observed.championName}) difere da escolha registrada no draft (${input.selectedChampionName}).`,
      beforeMatch: { label: "Escolha registrada", value: input.session.selectedChampionId },
      afterMatch: { label: "Campeão observado", value: input.observed.championId }
    })
  );

  add(
    executionRisk && executionRisk.status !== "UNAVAILABLE" && input.timeline
      ? available({
          id: "postgame:execution_risk_and_early_deaths",
          key: "EXECUTION_RISK_AND_EARLY_DEATHS",
          statement: `O draft registrava risco de execução ${executionRisk.value ?? "disponível"}; a partida teve ${input.timeline.deathsBefore10} morte(s) antes dos 10 minutos e ${input.timeline.deathsBefore15} antes dos 15.`,
          beforeMatch: {
            label: "Risco de execução registrado",
            value: executionRisk,
            provenance: executionRisk.provenance
          },
          afterMatch: {
            label: "Mortes precoces observadas",
            value: {
              before10: input.timeline.deathsBefore10,
              before15: input.timeline.deathsBefore15
            },
            provenance: { sourceType: "OBSERVED", sourceId: "riot-match-v5-timeline" }
          }
        })
      : unavailable(
          "EXECUTION_RISK_AND_EARLY_DEATHS",
          !executionRisk || executionRisk.status === "UNAVAILABLE"
            ? "O snapshot não registrou risco de execução disponível para a escolha."
            : "A timeline da partida não está disponível."
        )
  );

  add(
    personalMatchup &&
      personalMatchup.status !== "UNAVAILABLE" &&
      personalMatchup.provenance?.sampleSize !== undefined &&
      input.directOpponent?.confirmed &&
      positionCompatible
      ? available({
          id: "postgame:personal_matchup_and_result",
          key: "PERSONAL_MATCHUP_AND_RESULT",
          statement: `O confronto possuía amostra pessoal de ${personalMatchup.provenance.sampleSize} partida(s); esta partida acrescenta uma nova observação posterior ao snapshot, com resultado ${input.observed.won ? "vitória" : "derrota"}.`,
          beforeMatch: {
            label: "Matchup pessoal registrado",
            value: personalMatchup,
            provenance: personalMatchup.provenance
          },
          afterMatch: {
            label: "Nova observação",
            value: {
              opponentChampionId: input.directOpponent.championId,
              won: input.observed.won
            },
            provenance: { sourceType: "OBSERVED", sourceId: "riot-match-v5" }
          }
        })
      : unavailable(
          "PERSONAL_MATCHUP_AND_RESULT",
          !positionCompatible
            ? "A posição observada diverge da posição do snapshot."
            : !input.directOpponent?.confirmed
              ? "O adversário direto registrado no draft não pôde ser confirmado na partida."
              : "O snapshot não registrou matchup pessoal disponível com tamanho de amostra rastreável."
        )
  );

  add(
    unavailable(
      "OBJECTIVE_PARTICIPATION",
      input.observed.objectiveParticipation === undefined
        ? "A participação em objetivos não pôde ser calculada para esta partida."
        : "A participação observada está no resumo da partida, mas o snapshot não persistiu uma expectativa independente de objetivos para comparação."
    )
  );

  const historical = input.historicalLoadout;
  add(
    patternSignal({
      key: "FINAL_INVENTORY_HISTORY",
      label: "Inventário final",
      currentSignature: currentEvidence?.finalInventories[0]?.signature,
      historicalSignatures: historical?.finalInventories.map((entry) => entry.signature) ?? [],
      historicalSampleSize: historical?.parts.finalInventories.availableSampleSize ?? 0,
      historicalAvailable: input.snapshot !== undefined && positionCompatible,
      blockedReason: !positionCompatible
        ? "A posição observada diverge da posição do snapshot; inventários de outra posição não foram tratados como equivalentes."
        : undefined
    })
  );
  add(
    patternSignal({
      key: "RUNE_PAGE_HISTORY",
      label: "Página de runas",
      currentSignature: currentEvidence?.runePages[0]?.signature,
      historicalSignatures: historical?.runePages.map((entry) => entry.signature) ?? [],
      historicalSampleSize: historical?.parts.runePages.availableSampleSize ?? 0,
      historicalAvailable: input.snapshot !== undefined && positionCompatible,
      blockedReason: !positionCompatible
        ? "A posição observada diverge da posição do snapshot; runas de outra posição não foram tratadas como equivalentes."
        : undefined
    })
  );
  add(
    patternSignal({
      key: "SUMMONER_SPELL_HISTORY",
      label: "Conjunto de feitiços",
      currentSignature: currentEvidence?.summonerSpellSets[0]?.signature,
      historicalSignatures: historical?.summonerSpellSets.map((entry) => entry.signature) ?? [],
      historicalSampleSize: historical?.parts.summonerSpellSets.availableSampleSize ?? 0,
      historicalAvailable: input.snapshot !== undefined && positionCompatible,
      blockedReason: !positionCompatible
        ? "A posição observada diverge da posição do snapshot; feitiços de outra posição não foram tratados como equivalentes."
        : undefined
    })
  );

  const patchChanges = input.patchContext?.changes ?? [];
  add(
    patchChanges.length > 0
      ? available({
          id: "postgame:patch_context",
          key: "PATCH_CONTEXT",
          statement: input.patchContext?.availableAtDraft
            ? `O campeão possuía ${patchChanges.length} mudança(s) oficial(is) já persistida(s) no momento do draft. O impacto teórico permanece separado e não existe impacto global observado integrado.`
            : `O campeão possuía ${patchChanges.length} mudança(s) oficial(is) no patch, mas esse contexto foi persistido após o snapshot e não é apresentado como conhecido no draft.`,
          ...(input.patchContext?.availableAtDraft
            ? {
                beforeMatch: {
                  label: "Mudanças oficiais persistidas",
                  value: patchChanges,
                  provenance: patchChanges[0]?.provenance
                }
              }
            : {}),
          afterMatch: {
            label: input.patchContext?.availableAtDraft
              ? "Resultado isolado"
              : "Contexto oficial incorporado posteriormente",
            value: input.patchContext?.availableAtDraft
              ? input.observed.won
                ? "WIN"
                : "LOSS"
              : patchChanges,
            provenance: input.patchContext?.availableAtDraft
              ? { sourceType: "OBSERVED", sourceId: "riot-match-v5" }
              : patchChanges[0]?.provenance
          }
        })
      : unavailable(
          "PATCH_CONTEXT",
          "Nenhuma mudança oficial persistida para este campeão no patch da partida."
        )
  );
  add(
    unavailable(
      "GLOBAL_MATCHUP",
      "Matchup global continua indisponível porque nenhuma fonte global observada está integrada."
    )
  );
  add(
    unavailable(
      "GLOBAL_PATCH_IMPACT",
      "Impacto global observado do patch continua indisponível; mudança oficial e impacto teórico não medem desempenho no meta."
    )
  );

  const strategicSignals = recommendation?.strategicAnalysis
    ? [
        ...recommendation.strategicAnalysis.strengths.map((entry) => entry.description),
        ...recommendation.strategicAnalysis.gaps.map((entry) => entry.description),
        ...recommendation.strategicAnalysis.risks.map((entry) => entry.description)
      ]
    : [];
  const unavailableMetricKeys =
    recommendation?.metricDetails
      .filter((entry) => entry.status === "UNAVAILABLE")
      .map((entry) => entry.key) ?? [];
  const snapshotSignalIds = [
    ...(recommendation?.metricDetails.map((entry) => `metric:${entry.key}`) ?? []),
    ...(recommendation?.reasons.map((entry) => `reason:${entry.code}`) ?? []),
    ...(recommendation?.warnings.map((entry) => `warning:${entry.code}`) ?? []),
    ...(recommendation?.strategicAnalysis
      ? [
          ...recommendation.strategicAnalysis.strengths,
          ...recommendation.strategicAnalysis.gaps,
          ...recommendation.strategicAnalysis.risks,
          ...recommendation.strategicAnalysis.unavailableSignals
        ].map((entry) => `strategy:${entry.key}`)
      : [])
  ].filter((entry, index, all) => all.indexOf(entry) === index);

  return {
    draftSessionId: input.draftSessionId,
    ...(input.snapshot ? { snapshotId: input.snapshot.id } : {}),
    matchId: input.matchId,
    status: coverage === 1 ? "AVAILABLE" : coverage === 0 ? "UNAVAILABLE" : "PARTIAL",
    coverage,
    coverageDimensions,
    draftContext: {
      ...(input.snapshot
        ? {
            snapshotId: input.snapshot.id,
            snapshotInputHash: input.snapshot.inputHash,
            snapshotCreatedAt: input.snapshot.createdAt,
            snapshotCoverage: input.snapshot.dataCoverage
          }
        : {}),
      analysisRole: input.session.role,
      roleSource: input.session.roleSource,
      ...(input.session.patch ? { patch: input.session.patch } : {}),
      ...(input.session.queueId !== undefined ? { queueId: input.session.queueId } : {}),
      knownDraft: input.session.knownDraft,
      snapshotAlgorithmVersions: input.snapshot?.algorithmVersions ?? {},
      ...(input.patchContext ? { patchContext: input.patchContext } : {})
    },
    selectedChoice: {
      championId: input.session.selectedChampionId,
      championName: input.selectedChampionName,
      group: recommendation?.group ?? "NOT_IN_SNAPSHOT",
      ...(recommendation
        ? {
            rank: recommendation.rank,
            score: recommendation.totalScore,
            coverage: recommendation.dataCoverage,
            poolSource: recommendation.poolSource,
            personalGames: recommendation.personalGames,
            difficulty,
            personalExperience,
            executionRisk
          }
        : {}),
      strategicSignals,
      knownLimitations: recommendation?.limitations ?? [],
      unavailableMetricKeys
    },
    observedMatch: {
      championId: input.observed.championId,
      championName: input.observed.championName,
      won: input.observed.won,
      ...(observedRole ? { observedRole } : {}),
      ...(input.observed.assignedRole ? { assignedRole: input.observed.assignedRole } : {}),
      positionStatus: input.observed.positionStatus,
      kills: input.observed.kills,
      deaths: input.observed.deaths,
      assists: input.observed.assists,
      kda: (input.observed.kills + input.observed.assists) / Math.max(1, input.observed.deaths),
      ...(input.observed.totalCs !== undefined ? { totalCs: input.observed.totalCs } : {}),
      ...(input.observed.goldEarned !== undefined ? { goldEarned: input.observed.goldEarned } : {}),
      ...(input.observed.damageToChampions !== undefined
        ? { damageToChampions: input.observed.damageToChampions }
        : {}),
      ...(input.observed.visionScore !== undefined
        ? { visionScore: input.observed.visionScore }
        : {}),
      csPerMinute: input.observed.csPerMinute,
      goldPerMinute: input.observed.goldPerMinute,
      damagePerMinute: input.observed.damagePerMinute,
      visionScorePerMinute: input.observed.visionScorePerMinute,
      ...(input.observed.killParticipation !== undefined
        ? { killParticipation: input.observed.killParticipation }
        : {}),
      ...(input.observed.objectiveParticipation !== undefined
        ? { objectiveParticipation: input.observed.objectiveParticipation }
        : {}),
      ...(input.observed.objectiveTakedowns !== undefined
        ? { objectiveTakedowns: input.observed.objectiveTakedowns }
        : {}),
      ...(input.observed.teamObjectiveKills !== undefined
        ? { teamObjectiveKills: input.observed.teamObjectiveKills }
        : {}),
      ...(input.timeline
        ? {
            deathsBefore10: input.timeline.deathsBefore10,
            deathsBefore15: input.timeline.deathsBefore15,
            ...(input.timeline.csAt10 !== undefined ? { csAt10: input.timeline.csAt10 } : {}),
            ...(input.timeline.csAt15 !== undefined ? { csAt15: input.timeline.csAt15 } : {}),
            ...(input.timeline.goldDiffAt15 !== undefined
              ? { goldDiffAt15: input.timeline.goldDiffAt15 }
              : {})
          }
        : {}),
      ...(input.observed.durationSeconds !== undefined
        ? { durationSeconds: input.observed.durationSeconds }
        : {}),
      ...(input.observed.queueId !== undefined ? { queueId: input.observed.queueId } : {}),
      ...(input.observed.patch ? { patch: input.observed.patch } : {}),
      ...(input.observed.gameVersion ? { gameVersion: input.observed.gameVersion } : {}),
      finalItems,
      runeIds,
      summonerSpellIds
    },
    comparableSignals,
    unavailableSignals,
    algorithmVersion: DRAFT_POSTGAME_COMPARISON_VERSION,
    sourceAlgorithmVersions: {
      ...(input.snapshot?.algorithmVersions ?? {}),
      ...(input.currentLoadout ? { matchObservation: input.currentLoadout.extractorVersion } : {}),
      ...(historical ? { personalLoadoutEvidence: historical.algorithmVersion } : {}),
      ...(input.patchContext?.theoreticalImpact
        ? { theoreticalPatchImpact: input.patchContext.theoreticalImpact.algorithmVersion }
        : {})
    },
    snapshotSignalIds,
    generatedAt: input.generatedAt,
    provenance: {
      sourceType: "CALCULATED",
      sourceId: "sparta",
      resource: "DraftSession+RecommendationSnapshot+Match-V5",
      algorithmVersion: DRAFT_POSTGAME_COMPARISON_VERSION,
      patch: input.observed.patch,
      status: coverage === 1 ? "AVAILABLE" : coverage === 0 ? "UNAVAILABLE" : "PARTIAL"
    }
  };
}
