import type {
  CapabilityEvidence,
  ChampionCapability,
  ChampionCapabilityKey,
  ChampionCapabilityProfile
} from "../types/champion-capability.js";
import type { ChampionTag, DraftPick, DraftState } from "../types/domain.js";
import type { AvailabilityStatus, DataProvenance } from "../types/provenance.js";
import {
  availableMetric,
  unavailableMetric,
  type RecommendationMetric
} from "../types/recommendation-metric.js";

export const DRAFT_STRATEGIC_ANALYSIS_VERSION = "draft-strategy/1.0.0";
export const THREAT_RESPONSE_MODEL_VERSION = "threat-response/1.0.0";

export const STRATEGIC_CAPABILITY_KEYS = [
  "ENGAGE",
  "DISENGAGE",
  "PEEL",
  "PROTECTION",
  "FRONTLINE",
  "HARD_CC",
  "AREA_CC",
  "TARGETED_CC",
  "DISPLACEMENT",
  "MOBILITY",
  "DASH",
  "ANTI_MOBILITY",
  "PICKOFF",
  "WAVECLEAR",
  "POKE",
  "BURST",
  "SUSTAINED_DAMAGE",
  "SCALING",
  "RANGE_PROFILE"
] as const satisfies readonly ChampionCapabilityKey[];

export type StrategicCapabilityKey = (typeof STRATEGIC_CAPABILITY_KEYS)[number];

export const STRATEGIC_CAPABILITY_LABELS: Record<StrategicCapabilityKey, string> = {
  ENGAGE: "engage",
  DISENGAGE: "disengage",
  PEEL: "peel",
  PROTECTION: "proteção",
  FRONTLINE: "frontline",
  HARD_CC: "controle de grupo forte",
  AREA_CC: "controle de grupo em área",
  TARGETED_CC: "controle de grupo direcionado",
  DISPLACEMENT: "deslocamento forçado",
  MOBILITY: "mobilidade",
  DASH: "dash",
  ANTI_MOBILITY: "anti-mobilidade",
  PICKOFF: "pickoff",
  WAVECLEAR: "wave clear",
  POKE: "poke",
  BURST: "burst",
  SUSTAINED_DAMAGE: "dano sustentado",
  SCALING: "scaling",
  RANGE_PROFILE: "alcance"
};

export interface StrategicChampionReference {
  championId: number;
  championName: string;
}

export interface StrategicEvidence {
  champion: StrategicChampionReference;
  capability: StrategicCapabilityKey;
  source: "CAPABILITY_PROFILE" | "CHAMPION_TAG";
  value: number | boolean;
  evidence: CapabilityEvidence[];
  provenance: DataProvenance;
  /** Explica a regra de leitura, inclusive limiar de fallback. */
  interpretation: string;
}

export interface StrategicSignal {
  key: string;
  dimension: StrategicCapabilityKey;
  status: AvailabilityStatus;
  description: string;
  champions: StrategicChampionReference[];
  capabilities: StrategicCapabilityKey[];
  evidence: StrategicEvidence[];
  provenance: DataProvenance[];
  unavailableReason?: string;
}

export interface TeamCapabilityDimensionAnalysis {
  dimension: StrategicCapabilityKey;
  status: AvailabilityStatus;
  championsWithEvidence: StrategicChampionReference[];
  championsWithNegativeFallback: StrategicChampionReference[];
  evidenceCount: number;
  evaluatedChampionCount: number;
  unavailableChampionCount: number;
  unknownPicks: number;
  coverage: number;
  sourceQuality: "SPECIFIC" | "GENERIC_FALLBACK" | "MIXED" | "UNAVAILABLE";
  evidence: StrategicEvidence[];
  negativeEvidence: StrategicEvidence[];
}

export interface TeamCapabilityAnalysis {
  status: AvailabilityStatus;
  coverage: number;
  knownChampions: StrategicChampionReference[];
  expectedPicks: number;
  unknownPicks: number;
  availableProfileCount: number;
  dimensions: TeamCapabilityDimensionAnalysis[];
}

export interface CandidateContributionAnalysis {
  status: AvailabilityStatus;
  coverage: number;
  candidate: StrategicChampionReference;
  addedCapabilities: StrategicCapabilityKey[];
  reinforcedCapabilities: StrategicCapabilityKey[];
  filledKnownGaps: StrategicCapabilityKey[];
  remainingKnownGaps: StrategicCapabilityKey[];
  newlyEnabledResponses: StrategicCapabilityKey[];
}

export interface ThreatResponseAnalysis {
  key: string;
  status: AvailabilityStatus;
  threat: StrategicCapabilityKey;
  responses: StrategicCapabilityKey[];
  threatChampions: StrategicChampionReference[];
  responseChampions: StrategicChampionReference[];
  candidateEnabled: boolean;
  coverage: number;
  score: number | null;
  description: string;
  rationale: string;
  evidence: StrategicEvidence[];
  unavailableReason?: string;
}

export interface DraftStrategicAnalysis {
  status: AvailabilityStatus;
  /** Cobertura de dados e revelações; não é confiança nem chance de vitória. */
  coverage: number;
  alliedProfile: TeamCapabilityAnalysis;
  enemyProfile: TeamCapabilityAnalysis;
  candidateContribution: CandidateContributionAnalysis;
  threatResponses: ThreatResponseAnalysis[];
  teamCompositionScore: RecommendationMetric;
  enemyResponseScore: RecommendationMetric;
  strengths: StrategicSignal[];
  gaps: StrategicSignal[];
  risks: StrategicSignal[];
  unavailableSignals: StrategicSignal[];
  directOpponent?: StrategicChampionReference;
  algorithmVersion: string;
  threatResponseModelVersion: string;
}

export interface DraftStrategicAnalysisInput {
  draft: DraftState;
  candidate: StrategicChampionReference;
  capabilityProfiles: readonly ChampionCapabilityProfile[];
  championTags: readonly ChampionTag[];
}

interface CapabilityObservation {
  state: "PRESENT" | "ABSENT" | "UNAVAILABLE";
  evidence?: StrategicEvidence;
  conflict?: StrategicEvidence;
}

interface TeamBuild {
  analysis: TeamCapabilityAnalysis;
  observations: Map<number, Map<StrategicCapabilityKey, CapabilityObservation>>;
}

interface ThreatResponseRule {
  key: string;
  threat: StrategicCapabilityKey;
  responses: StrategicCapabilityKey[];
  rationale: string;
  /** Alcance só é resposta quando o ataque base é realmente à distância. */
  responseMinimums?: Partial<Record<StrategicCapabilityKey, number>>;
}

const RANGED_ATTACK_RANGE_MINIMUM = 450;

/**
 * Relações gerais entre recursos, nunca entre campeões. Elas não significam
 * "counter completo": só registram que uma resposta conhecida ajuda a lidar
 * com uma ameaça conhecida.
 */
export const THREAT_RESPONSE_RULES: readonly ThreatResponseRule[] = [
  {
    key: "engage_vs_stabilization",
    threat: "ENGAGE",
    responses: ["DISENGAGE", "PEEL", "FRONTLINE"],
    rationale:
      "Disengage, peel e frontline podem absorver ou interromper uma iniciação, sempre como resposta parcial."
  },
  {
    key: "burst_vs_protection",
    threat: "BURST",
    responses: ["PROTECTION", "PEEL"],
    rationale:
      "Proteção e peel podem reduzir a janela de execução de burst, sem anulá-la por completo."
  },
  {
    key: "mobility_vs_control",
    threat: "MOBILITY",
    responses: ["ANTI_MOBILITY", "TARGETED_CC", "HARD_CC"],
    rationale: "Anti-mobilidade e controle conhecido ajudam a limitar alvos móveis."
  },
  {
    key: "dash_vs_control",
    threat: "DASH",
    responses: ["ANTI_MOBILITY", "TARGETED_CC", "HARD_CC"],
    rationale:
      "Controle conhecido pode limitar campeões com dash; a relação não presume interação específica de habilidades."
  },
  {
    key: "pickoff_vs_protection",
    threat: "PICKOFF",
    responses: ["PEEL", "PROTECTION"],
    rationale:
      "Peel e proteção ajudam um aliado isolado, sem garantir que toda tentativa de pickoff seja negada."
  },
  {
    key: "poke_vs_access",
    threat: "POKE",
    responses: ["ENGAGE", "PROTECTION"],
    rationale:
      "Engage pode reduzir o tempo de exposição ao poke e proteção pode amortecer parte dele."
  },
  {
    key: "frontline_vs_sustained_damage",
    threat: "FRONTLINE",
    responses: ["SUSTAINED_DAMAGE"],
    rationale:
      "Dano sustentado é uma resposta geral a alvos duráveis, sem modelar tipo de dano ou resistência."
  },
  {
    key: "hard_cc_vs_spacing",
    threat: "HARD_CC",
    responses: ["RANGE_PROFILE", "PROTECTION"],
    responseMinimums: { RANGE_PROFILE: RANGED_ATTACK_RANGE_MINIMUM },
    rationale:
      "Alcance à distância pode reduzir exposição e proteção pode amortecer consequências do controle; nenhuma das duas remove o controle."
  }
] as const;

const TAG_FALLBACKS = {
  ENGAGE: "engage",
  PEEL: "peel",
  FRONTLINE: "frontline",
  PICKOFF: "pickoff",
  WAVECLEAR: "waveclear",
  SCALING: "scaling"
} as const satisfies Partial<Record<StrategicCapabilityKey, keyof ChampionTag>>;

const TAG_PRESENT = 0.55;
const TAG_ABSENT = 0.35;
const TEAM_SIZE = 5;

export function analyzeDraftStrategy(input: DraftStrategicAnalysisInput): DraftStrategicAnalysis {
  const profiles = new Map(
    input.capabilityProfiles.map((profile) => [profile.championId, profile])
  );
  const tags = new Map(
    input.championTags
      .filter((tag) => tag.championId !== undefined)
      .map((tag) => [tag.championId!, tag])
  );
  for (const tag of input.championTags) {
    if (tag.championId === undefined) continue;
    tags.set(tag.championId, tag);
  }

  const knownAllies = uniquePicks(input.draft.allies).filter(
    (pick) => !pick.isPlayer && pick.championId !== input.candidate.championId
  );
  const candidatePick: DraftPick = {
    ...input.candidate,
    team: "ally",
    isPlayer: true
  };
  const alliedWithoutCandidate = buildTeam(knownAllies, TEAM_SIZE - 1, profiles, tags);
  const allied = buildTeam([...knownAllies, candidatePick], TEAM_SIZE, profiles, tags);
  const enemies = buildTeam(uniquePicks(input.draft.enemies), TEAM_SIZE, profiles, tags);
  const candidateObservations = allied.observations.get(input.candidate.championId) ?? new Map();

  const contribution = buildContribution(
    input.candidate,
    candidateObservations,
    alliedWithoutCandidate
  );
  const teamResult = scoreTeamComposition(
    input.candidate,
    candidateObservations,
    alliedWithoutCandidate,
    contribution
  );
  const threatResponses = buildThreatResponses(
    input.candidate,
    allied,
    alliedWithoutCandidate,
    enemies
  );
  contribution.newlyEnabledResponses = uniqueCapabilities(
    threatResponses
      .filter((response) => response.candidateEnabled)
      .flatMap((response) => response.responses)
  );
  const enemyResult = scoreEnemyResponses(threatResponses, allied.analysis, enemies.analysis);

  const conflicts = collectConflicts(
    [...knownAllies, candidatePick, ...uniquePicks(input.draft.enemies)],
    allied,
    enemies
  );
  const unavailableSignals = buildUnavailableSignals(
    allied.analysis,
    enemies.analysis,
    candidateObservations
  );
  const coverage = round4((allied.analysis.coverage + enemies.analysis.coverage) / 2);
  const hasKnownDraft =
    allied.analysis.knownChampions.length > 0 || enemies.analysis.knownChampions.length > 0;

  return {
    status: !hasKnownDraft ? "UNAVAILABLE" : coverage >= 1 ? "AVAILABLE" : "PARTIAL",
    coverage,
    alliedProfile: allied.analysis,
    enemyProfile: enemies.analysis,
    candidateContribution: contribution,
    threatResponses,
    teamCompositionScore: teamResult.metric,
    enemyResponseScore: enemyResult.metric,
    strengths: [...teamResult.strengths, ...enemyResult.strengths],
    gaps: teamResult.gaps,
    risks: [...teamResult.risks, ...enemyResult.risks, ...conflicts],
    unavailableSignals,
    ...(input.draft.enemyLaneChampionId !== undefined
      ? {
          directOpponent: findChampionReference(
            input.draft.enemyLaneChampionId,
            input.draft.enemies,
            profiles,
            tags
          )
        }
      : {}),
    algorithmVersion: DRAFT_STRATEGIC_ANALYSIS_VERSION,
    threatResponseModelVersion: THREAT_RESPONSE_MODEL_VERSION
  };
}

function uniquePicks(picks: readonly DraftPick[]): DraftPick[] {
  const byId = new Map<number, DraftPick>();
  for (const pick of picks) {
    if (!Number.isFinite(pick.championId) || pick.championId <= 0) continue;
    if (!byId.has(pick.championId)) byId.set(pick.championId, pick);
  }
  return [...byId.values()].sort((left, right) => left.championId - right.championId);
}

function buildTeam(
  picks: readonly DraftPick[],
  expectedPicks: number,
  profiles: ReadonlyMap<number, ChampionCapabilityProfile>,
  tags: ReadonlyMap<number, ChampionTag>
): TeamBuild {
  const observations = new Map<number, Map<StrategicCapabilityKey, CapabilityObservation>>();
  const knownChampions = picks.map(toChampionReference);
  let availableProfileCount = 0;

  for (const pick of picks) {
    const profile = profiles.get(pick.championId);
    if (profile) availableProfileCount += 1;
    const championObservations = new Map<StrategicCapabilityKey, CapabilityObservation>();
    for (const dimension of STRATEGIC_CAPABILITY_KEYS) {
      championObservations.set(
        dimension,
        observeCapability(pick, dimension, profile, tags.get(pick.championId))
      );
    }
    observations.set(pick.championId, championObservations);
  }

  const unknownPicks = Math.max(0, expectedPicks - knownChampions.length);
  const dimensions = STRATEGIC_CAPABILITY_KEYS.map((dimension) => {
    const observed = knownChampions.map((champion) => ({
      champion,
      observation: observations.get(champion.championId)!.get(dimension)!
    }));
    const positive = observed.filter(({ observation }) => observation.state === "PRESENT");
    const negative = observed.filter(({ observation }) => observation.state === "ABSENT");
    const evaluated = positive.length + negative.length;
    const evidence = positive.flatMap(({ observation }) =>
      observation.evidence ? [observation.evidence] : []
    );
    const negativeEvidence = negative.flatMap(({ observation }) =>
      observation.evidence ? [observation.evidence] : []
    );
    const sources = new Set([...evidence, ...negativeEvidence].map((entry) => entry.source));
    const coverage = expectedPicks === 0 ? 0 : round4(evaluated / expectedPicks);
    return {
      dimension,
      status:
        evaluated === 0
          ? "UNAVAILABLE"
          : unknownPicks === 0 && evaluated === knownChampions.length
            ? "AVAILABLE"
            : "PARTIAL",
      championsWithEvidence: positive.map(({ champion }) => champion),
      championsWithNegativeFallback: negative.map(({ champion }) => champion),
      evidenceCount: [...evidence, ...negativeEvidence].reduce(
        (sum, entry) => sum + Math.max(1, entry.evidence.length),
        0
      ),
      evaluatedChampionCount: evaluated,
      unavailableChampionCount: knownChampions.length - evaluated,
      unknownPicks,
      coverage,
      sourceQuality:
        sources.size === 0
          ? "UNAVAILABLE"
          : sources.size > 1
            ? "MIXED"
            : sources.has("CAPABILITY_PROFILE")
              ? "SPECIFIC"
              : "GENERIC_FALLBACK",
      evidence,
      negativeEvidence
    } satisfies TeamCapabilityDimensionAnalysis;
  });

  const evaluatedSlots = dimensions.reduce(
    (sum, dimension) => sum + dimension.evaluatedChampionCount,
    0
  );
  const expectedSlots = expectedPicks * STRATEGIC_CAPABILITY_KEYS.length;
  const pickCoverage = expectedPicks === 0 ? 0 : Math.min(1, knownChampions.length / expectedPicks);
  const evidenceCoverage = expectedSlots === 0 ? 0 : Math.min(1, evaluatedSlots / expectedSlots);
  const coverage = round4(pickCoverage * 0.6 + evidenceCoverage * 0.4);

  return {
    analysis: {
      status: knownChampions.length === 0 ? "UNAVAILABLE" : coverage >= 1 ? "AVAILABLE" : "PARTIAL",
      coverage,
      knownChampions,
      expectedPicks,
      unknownPicks,
      availableProfileCount,
      dimensions
    },
    observations
  };
}

function observeCapability(
  pick: DraftPick,
  dimension: StrategicCapabilityKey,
  profile: ChampionCapabilityProfile | undefined,
  tag: ChampionTag | undefined
): CapabilityObservation {
  const capability = profile?.capabilities.find((entry) => entry.key === dimension);
  const specificUsable =
    capability !== undefined &&
    (capability.status === "AVAILABLE" || capability.status === "PARTIAL") &&
    capability.value !== null;
  const fallbackKey = (TAG_FALLBACKS as Partial<Record<StrategicCapabilityKey, keyof ChampionTag>>)[
    dimension
  ];
  const fallbackValue =
    fallbackKey && tag && typeof tag[fallbackKey] === "number"
      ? Number(tag[fallbackKey])
      : undefined;

  if (specificUsable) {
    const evidence = capabilityEvidence(pick, dimension, capability);
    if (
      dimension === "RANGE_PROFILE" &&
      typeof capability.value === "number" &&
      capability.value < RANGED_ATTACK_RANGE_MINIMUM
    ) {
      return { state: "ABSENT", evidence };
    }
    const conflict =
      fallbackValue !== undefined && fallbackValue <= TAG_ABSENT
        ? tagEvidence(
            pick,
            dimension,
            fallbackValue,
            tag!,
            "O fallback genérico indica baixa presença, mas a capacidade específica tem evidência; o score usa somente a específica."
          )
        : undefined;
    return { state: "PRESENT", evidence, conflict };
  }

  if (fallbackValue === undefined) return { state: "UNAVAILABLE" };
  if (fallbackValue >= TAG_PRESENT) {
    return {
      state: "PRESENT",
      evidence: tagEvidence(
        pick,
        dimension,
        fallbackValue,
        tag!,
        `Fallback genérico usado porque a capacidade específica está indisponível; valor ≥ ${TAG_PRESENT}.`
      )
    };
  }
  if (fallbackValue <= TAG_ABSENT) {
    return {
      state: "ABSENT",
      evidence: tagEvidence(
        pick,
        dimension,
        fallbackValue,
        tag!,
        `Fallback genérico usado porque a capacidade específica está indisponível; valor ≤ ${TAG_ABSENT}.`
      )
    };
  }
  return { state: "UNAVAILABLE" };
}

function capabilityEvidence(
  pick: DraftPick,
  dimension: StrategicCapabilityKey,
  capability: ChampionCapability
): StrategicEvidence {
  return {
    champion: toChampionReference(pick),
    capability: dimension,
    source: "CAPABILITY_PROFILE",
    value: capability.value!,
    evidence: capability.evidence,
    provenance: capability.provenance,
    interpretation:
      dimension === "RANGE_PROFILE"
        ? `Valor numérico oficial preservado; alcance ≥ ${RANGED_ATTACK_RANGE_MINIMUM} é classificado como perfil à distância pelo algoritmo versionado.`
        : "Presença explícita extraída do recurso oficial do campeão."
  };
}

function tagEvidence(
  pick: DraftPick,
  dimension: StrategicCapabilityKey,
  value: number,
  tag: ChampionTag,
  interpretation: string
): StrategicEvidence {
  return {
    champion: toChampionReference(pick),
    capability: dimension,
    source: "CHAMPION_TAG",
    value,
    evidence: [],
    provenance: tag.provenance?.source ?? {
      sourceType: "DERIVED",
      sourceId: "sparta",
      resource: "ChampionTag"
    },
    interpretation
  };
}

function buildContribution(
  candidate: StrategicChampionReference,
  candidateObservations: ReadonlyMap<StrategicCapabilityKey, CapabilityObservation>,
  previous: TeamBuild
): CandidateContributionAnalysis {
  const added: StrategicCapabilityKey[] = [];
  const reinforced: StrategicCapabilityKey[] = [];
  const filled: StrategicCapabilityKey[] = [];
  const remaining: StrategicCapabilityKey[] = [];
  let evaluated = 0;

  for (const dimension of STRATEGIC_CAPABILITY_KEYS) {
    const candidateObservation = candidateObservations.get(dimension);
    if (!candidateObservation || candidateObservation.state === "UNAVAILABLE") continue;
    evaluated += 1;
    const before = dimensionOf(previous.analysis, dimension);
    if (candidateObservation.state === "PRESENT") {
      if (before.championsWithEvidence.length > 0) {
        reinforced.push(dimension);
      } else if (
        previous.analysis.knownChampions.length > 0 &&
        before.evaluatedChampionCount === previous.analysis.knownChampions.length
      ) {
        filled.push(dimension);
      } else {
        added.push(dimension);
      }
    } else if (
      previous.analysis.knownChampions.length > 0 &&
      before.evaluatedChampionCount === previous.analysis.knownChampions.length &&
      before.championsWithEvidence.length === 0
    ) {
      remaining.push(dimension);
    }
  }

  const coverage = round4(evaluated / STRATEGIC_CAPABILITY_KEYS.length);
  return {
    status: evaluated === 0 ? "UNAVAILABLE" : "PARTIAL",
    coverage,
    candidate,
    addedCapabilities: added,
    reinforcedCapabilities: reinforced,
    filledKnownGaps: filled,
    remainingKnownGaps: remaining,
    newlyEnabledResponses: []
  };
}

function scoreTeamComposition(
  candidate: StrategicChampionReference,
  candidateObservations: ReadonlyMap<StrategicCapabilityKey, CapabilityObservation>,
  previous: TeamBuild,
  contribution: CandidateContributionAnalysis
): {
  metric: RecommendationMetric;
  strengths: StrategicSignal[];
  gaps: StrategicSignal[];
  risks: StrategicSignal[];
} {
  if (previous.analysis.knownChampions.length === 0) {
    return {
      metric: unavailableMetric(
        "TEAM_COMPOSITION",
        "Nenhum aliado foi revelado; não há encaixe de equipe para avaliar."
      ),
      strengths: [],
      gaps: [],
      risks: []
    };
  }

  const values: number[] = [];
  const strengths: StrategicSignal[] = [];
  const gaps: StrategicSignal[] = [];
  const risks: StrategicSignal[] = [];

  for (const dimension of STRATEGIC_CAPABILITY_KEYS) {
    const observation = candidateObservations.get(dimension);
    if (!observation || observation.state === "UNAVAILABLE") continue;
    const previousDimension = dimensionOf(previous.analysis, dimension);
    if (observation.state === "PRESENT" && observation.evidence) {
      const filled = contribution.filledKnownGaps.includes(dimension);
      const reinforced = contribution.reinforcedCapabilities.includes(dimension);
      const value = filled ? 90 : reinforced ? 60 : 75;
      values.push(value);
      strengths.push(
        signal(
          `${filled ? "filled" : reinforced ? "reinforced" : "added"}_${dimension}`,
          dimension,
          filled
            ? `${candidate.championName} acrescenta ${label(dimension)} a uma lacuna conhecida entre os aliados revelados.`
            : reinforced
              ? `${candidate.championName} reforça ${label(dimension)} já sustentado por ${joinChampionNames(previousDimension.championsWithEvidence)}.`
              : `${candidate.championName} adiciona evidência de ${label(dimension)}; parte dos aliados ainda não permite avaliar uma lacuna completa.`,
          [observation.evidence],
          previous.analysis.unknownPicks > 0 ? "PARTIAL" : "AVAILABLE"
        )
      );
    } else if (contribution.remainingKnownGaps.includes(dimension)) {
      values.push(35);
      const evidence = [
        ...previousDimension.negativeEvidence,
        ...(observation.evidence ? [observation.evidence] : [])
      ];
      gaps.push(
        signal(
          `remaining_${dimension}`,
          dimension,
          `Entre os aliados conhecidos e avaliados, a lacuna de ${label(dimension)} permanece após incluir ${candidate.championName}.`,
          evidence,
          previous.analysis.unknownPicks > 0 ? "PARTIAL" : "AVAILABLE"
        )
      );
    }
  }

  if (values.length === 0) {
    return {
      metric: unavailableMetric(
        "TEAM_COMPOSITION",
        "As capacidades disponíveis não sustentam uma avaliação de contribuição para os aliados revelados."
      ),
      strengths,
      gaps,
      risks
    };
  }

  const score = round1(average(values));
  const coverage = round4(
    (values.length / STRATEGIC_CAPABILITY_KEYS.length) *
      Math.min(1, previous.analysis.knownChampions.length / (TEAM_SIZE - 1))
  );
  return {
    metric: availableMetric({
      key: "TEAM_COMPOSITION",
      value: score,
      partial: coverage < 1,
      provenance: strategicProvenance(
        "candidate-contribution",
        previous.analysis.knownChampions.length
      ),
      explanation: `${values.length} dimensão(ões) disponível(is) comparadas sem e com o candidato; cobertura ${Math.round(coverage * 100)}%.`
    }),
    strengths,
    gaps,
    risks
  };
}

function buildThreatResponses(
  candidate: StrategicChampionReference,
  allied: TeamBuild,
  previous: TeamBuild,
  enemies: TeamBuild
): ThreatResponseAnalysis[] {
  const result: ThreatResponseAnalysis[] = [];
  for (const rule of THREAT_RESPONSE_RULES) {
    const threatDimension = dimensionOf(enemies.analysis, rule.threat);
    if (threatDimension.championsWithEvidence.length === 0) continue;

    const responseEvidence = rule.responses.flatMap((dimension) =>
      matchingResponseEvidence(
        dimensionOf(allied.analysis, dimension).evidence,
        rule.responseMinimums?.[dimension]
      )
    );
    const previousEvidence = rule.responses.flatMap((dimension) =>
      matchingResponseEvidence(
        dimensionOf(previous.analysis, dimension).evidence,
        rule.responseMinimums?.[dimension]
      )
    );
    const responseChampions = uniqueChampions(responseEvidence.map((entry) => entry.champion));
    const candidateEnabled =
      previousEvidence.length === 0 &&
      responseEvidence.some((entry) => entry.champion.championId === candidate.championId);
    const evaluatedSlots = rule.responses.reduce(
      (sum, dimension) => sum + dimensionOf(allied.analysis, dimension).evaluatedChampionCount,
      0
    );
    const expectedSlots = Math.max(1, allied.analysis.expectedPicks * rule.responses.length);
    const responseCoverage = Math.min(1, evaluatedSlots / expectedSlots);
    const coverage = round4((threatDimension.coverage + responseCoverage) / 2);

    if (responseEvidence.length > 0) {
      const score = round1(
        Math.min(95, 70 + Math.min(15, responseChampions.length * 5) + (candidateEnabled ? 10 : 0))
      );
      result.push({
        key: rule.key,
        status: coverage >= 1 ? "AVAILABLE" : "PARTIAL",
        threat: rule.threat,
        responses: rule.responses,
        threatChampions: threatDimension.championsWithEvidence,
        responseChampions,
        candidateEnabled,
        coverage,
        score,
        description: candidateEnabled
          ? `${candidate.championName} habilita uma resposta conhecida de ${rule.responses.map(label).join(" ou ")} contra ${label(rule.threat)} revelado.`
          : `A equipe conhecida possui evidência de ${rule.responses.map(label).join(" ou ")} para responder parcialmente a ${label(rule.threat)}.`,
        rationale: rule.rationale,
        evidence: [...threatDimension.evidence, ...responseEvidence]
      });
      continue;
    }

    const fullyEvaluated =
      allied.analysis.knownChampions.length > 0 &&
      rule.responses.every((dimension) => {
        const response = dimensionOf(allied.analysis, dimension);
        return response.evaluatedChampionCount === allied.analysis.knownChampions.length;
      });
    result.push({
      key: rule.key,
      status: fullyEvaluated ? "PARTIAL" : "UNAVAILABLE",
      threat: rule.threat,
      responses: rule.responses,
      threatChampions: threatDimension.championsWithEvidence,
      responseChampions: [],
      candidateEnabled: false,
      coverage,
      score: fullyEvaluated ? 30 : null,
      description: fullyEvaluated
        ? `Não há evidência conhecida de ${rule.responses.map(label).join(" ou ")} entre os campeões avaliados para responder a ${label(rule.threat)}; picks desconhecidos ainda podem mudar a leitura.`
        : `A ameaça de ${label(rule.threat)} é conhecida, mas as respostas possíveis ainda não têm dados suficientes.`,
      rationale: rule.rationale,
      evidence: threatDimension.evidence,
      ...(!fullyEvaluated
        ? {
            unavailableReason:
              "Uma ou mais capacidades de resposta estão indisponíveis nos perfis conhecidos."
          }
        : {})
    });
  }
  return result;
}

function scoreEnemyResponses(
  responses: readonly ThreatResponseAnalysis[],
  allies: TeamCapabilityAnalysis,
  enemies: TeamCapabilityAnalysis
): {
  metric: RecommendationMetric;
  strengths: StrategicSignal[];
  risks: StrategicSignal[];
} {
  if (enemies.knownChampions.length === 0) {
    return {
      metric: unavailableMetric(
        "ENEMY_COMPOSITION_ANSWER",
        "Nenhum inimigo foi revelado; não há ameaça conhecida para responder."
      ),
      strengths: [],
      risks: []
    };
  }
  const scored = responses.filter(
    (response): response is ThreatResponseAnalysis & { score: number } => response.score !== null
  );
  if (scored.length === 0) {
    return {
      metric: unavailableMetric(
        "ENEMY_COMPOSITION_ANSWER",
        responses.length === 0
          ? "Os perfis inimigos revelados não sustentam nenhuma ameaça do modelo versionado."
          : "Existem ameaças conhecidas, mas as capacidades de resposta estão indisponíveis."
      ),
      strengths: [],
      risks: []
    };
  }

  const strengths = scored
    .filter((response) => response.responseChampions.length > 0)
    .map((response) =>
      signal(
        `response_${response.key}`,
        response.threat,
        response.description,
        response.evidence,
        response.status
      )
    );
  const risks = scored
    .filter((response) => response.responseChampions.length === 0)
    .map((response) =>
      signal(
        `unanswered_${response.key}`,
        response.threat,
        response.description,
        response.evidence,
        "PARTIAL"
      )
    );
  const score = round1(average(scored.map((response) => response.score)));
  const coverage = round4(
    average(scored.map((response) => response.coverage)) *
      Math.min(1, enemies.knownChampions.length / TEAM_SIZE) *
      Math.min(1, allies.knownChampions.length / TEAM_SIZE)
  );
  return {
    metric: availableMetric({
      key: "ENEMY_COMPOSITION_ANSWER",
      value: score,
      partial: coverage < 1,
      provenance: strategicProvenance(
        "threat-response",
        allies.knownChampions.length + enemies.knownChampions.length
      ),
      explanation: `${scored.length} relação(ões) ameaça–resposta disponível(is); cobertura ${Math.round(coverage * 100)}%.`
    }),
    strengths,
    risks
  };
}

function buildUnavailableSignals(
  allies: TeamCapabilityAnalysis,
  enemies: TeamCapabilityAnalysis,
  candidate: ReadonlyMap<StrategicCapabilityKey, CapabilityObservation>
): StrategicSignal[] {
  return STRATEGIC_CAPABILITY_KEYS.flatMap((dimension) => {
    const ally = dimensionOf(allies, dimension);
    const enemy = dimensionOf(enemies, dimension);
    const candidateObservation = candidate.get(dimension);
    if (
      ally.evaluatedChampionCount > 0 ||
      enemy.evaluatedChampionCount > 0 ||
      (candidateObservation && candidateObservation.state !== "UNAVAILABLE")
    ) {
      return [];
    }
    return [
      {
        key: `unavailable_${dimension}`,
        dimension,
        status: "UNAVAILABLE",
        description: `${label(dimension)} não pôde ser avaliado nos campeões conhecidos.`,
        champions: [],
        capabilities: [dimension],
        evidence: [],
        provenance: [],
        unavailableReason:
          "O catálogo específico não traz evidência utilizável e não existe fallback genérico suportado para esta dimensão."
      } satisfies StrategicSignal
    ];
  });
}

function collectConflicts(
  picks: readonly DraftPick[],
  allies: TeamBuild,
  enemies: TeamBuild
): StrategicSignal[] {
  const result: StrategicSignal[] = [];
  for (const pick of uniquePicks(picks)) {
    const observations =
      allies.observations.get(pick.championId) ?? enemies.observations.get(pick.championId);
    if (!observations) continue;
    for (const dimension of STRATEGIC_CAPABILITY_KEYS) {
      const observation = observations.get(dimension);
      if (!observation?.conflict || !observation.evidence) continue;
      result.push({
        key: `conflict_${pick.championId}_${dimension}`,
        dimension,
        status: "PARTIAL",
        description: `O perfil específico de ${pick.championName} sustenta ${label(dimension)}, enquanto a ChampionTag genérica indica baixa presença. A análise usa somente a evidência específica e preserva o conflito.`,
        champions: [toChampionReference(pick)],
        capabilities: [dimension],
        evidence: [observation.evidence, observation.conflict],
        provenance: [observation.evidence.provenance, observation.conflict.provenance]
      });
    }
  }
  return result;
}

function signal(
  key: string,
  dimension: StrategicCapabilityKey,
  description: string,
  evidence: StrategicEvidence[],
  status: AvailabilityStatus
): StrategicSignal {
  return {
    key,
    dimension,
    status,
    description,
    champions: uniqueChampions(evidence.map((entry) => entry.champion)),
    capabilities: uniqueCapabilities(evidence.map((entry) => entry.capability)),
    evidence,
    provenance: uniqueProvenance(evidence.map((entry) => entry.provenance))
  };
}

function matchingResponseEvidence(
  evidence: readonly StrategicEvidence[],
  minimum?: number
): StrategicEvidence[] {
  if (minimum === undefined) return [...evidence];
  return evidence.filter((entry) => typeof entry.value === "number" && entry.value >= minimum);
}

function strategicProvenance(resource: string, sampleSize: number): DataProvenance {
  return {
    sourceType: "DERIVED",
    sourceId: "sparta",
    resource,
    sampleSize,
    algorithmVersion: DRAFT_STRATEGIC_ANALYSIS_VERSION
  };
}

function findChampionReference(
  championId: number,
  picks: readonly DraftPick[],
  profiles: ReadonlyMap<number, ChampionCapabilityProfile>,
  tags: ReadonlyMap<number, ChampionTag>
): StrategicChampionReference {
  const pick = picks.find((entry) => entry.championId === championId);
  return {
    championId,
    championName:
      pick?.championName ??
      profiles.get(championId)?.championName ??
      tags.get(championId)?.championName ??
      `Campeão ${championId}`
  };
}

function dimensionOf(
  team: TeamCapabilityAnalysis,
  dimension: StrategicCapabilityKey
): TeamCapabilityDimensionAnalysis {
  return team.dimensions.find((entry) => entry.dimension === dimension)!;
}

function toChampionReference(
  pick: Pick<DraftPick, "championId" | "championName">
): StrategicChampionReference {
  return {
    championId: pick.championId,
    championName: pick.championName
  };
}

function uniqueChampions(
  champions: readonly StrategicChampionReference[]
): StrategicChampionReference[] {
  return [...new Map(champions.map((champion) => [champion.championId, champion])).values()].sort(
    (left, right) => left.championId - right.championId
  );
}

function uniqueCapabilities(
  capabilities: readonly StrategicCapabilityKey[]
): StrategicCapabilityKey[] {
  const values = new Set(capabilities);
  return STRATEGIC_CAPABILITY_KEYS.filter((key) => values.has(key));
}

function uniqueProvenance(provenance: readonly DataProvenance[]): DataProvenance[] {
  const unique = new Map<string, DataProvenance>();
  for (const entry of provenance) {
    const key = JSON.stringify(entry);
    if (!unique.has(key)) unique.set(key, entry);
  }
  return [...unique.values()];
}

function joinChampionNames(champions: readonly StrategicChampionReference[]): string {
  return champions.map((champion) => champion.championName).join(", ");
}

function label(dimension: StrategicCapabilityKey): string {
  return STRATEGIC_CAPABILITY_LABELS[dimension];
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
