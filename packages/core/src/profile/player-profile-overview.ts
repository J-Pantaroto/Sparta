import {
  aggregatePlayerChampionStats,
  type MatchParticipationRecord
} from "../aggregation/player-champion-stats.js";
import { derivePlayerStrengthsWeaknesses } from "../aggregation/player-insights.js";
import {
  calculateKda,
  calculateRecentForm,
  DEATHS_BAD_VALUE,
  MIN_GAMES_FOR_RANKING,
  normalizeInverse,
  roleBaselines
} from "../scoring/champion-performance.js";
import type { AvailabilityStatus, DataProvenance } from "../types/provenance.js";
import type { Role } from "../types/domain.js";

export const PLAYER_PROFILE_OVERVIEW_ALGORITHM_VERSION = "player-profile-overview/1.0.0";
export const PLAYER_PROFILE_FRESHNESS_DAYS = 7;

export interface ProfileCoverageItem {
  status: AvailabilityStatus;
  sampleSize: number;
  availableSampleSize: number | null;
  coverage: number;
  updatedAt: string | null;
  reason?: string;
}

export interface ProfileCoverage {
  identity: ProfileCoverageItem;
  ranked: ProfileCoverageItem;
  roles: ProfileCoverageItem;
  recentPerformance: ProfileCoverageItem;
  trend: ProfileCoverageItem;
  champions: ProfileCoverageItem;
  matches: ProfileCoverageItem;
  objectives: ProfileCoverageItem;
  loadout: ProfileCoverageItem;
}

export type ProfileMetricKey =
  | "CONSISTENCY"
  | "OBJECTIVES"
  | "VISION"
  | "TEAM_IMPACT"
  | "RECENT_PERFORMANCE"
  | "SURVIVAL"
  | "FARM"
  | "EXECUTION";

export interface ProfileMetric {
  key: ProfileMetricKey;
  label: string;
  value: number | null;
  unit: "INDEX" | "PERCENT";
  status: AvailabilityStatus;
  sampleSize: number;
  availableSampleSize: number;
  coverage: number;
  formula: string;
  algorithmVersion: string;
  unavailableReason?: string;
}

export interface ProfileRoleEvidence {
  role: Role;
  games: number;
  share: number;
  lastObservedAt: string | null;
}

export interface PerformanceTrendPoint {
  matchId: string;
  observedAt: string;
  performanceIndex: number;
  kda: number;
  objectiveParticipation: number | null;
  csPerMinute: number;
  visionScorePerMinute: number;
  won: boolean;
}

export interface ProfileChampionSummary {
  championId: number;
  championName: string;
  role: Role;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  recentForm: "improving" | "stable" | "declining";
  sampleStatus: "SMALL" | "SUFFICIENT";
  lastPlayedAt: string | null;
}

export interface ProfileItemSummary {
  slot: number;
  state: string;
  itemId: number | null;
  itemName: string | null;
}

export interface ProfileRuneSummary {
  tree: string;
  slotOrder: number;
  perkId: number;
  perkName: string | null;
  isKeystone: boolean;
}

export interface ProfileSpellSummary {
  slot: number;
  state: string;
  spellId: number | null;
  spellName: string | null;
}

export interface ProfileRecentMatch {
  matchId: string;
  championId: number;
  championName: string;
  role: Role;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  csPerMinute: number;
  damagePerMinute: number;
  visionScorePerMinute: number;
  killParticipation: number | null;
  objectiveParticipation: number | null;
  objectiveTakedowns: number | null;
  teamObjectiveKills: number | null;
  durationSeconds: number | null;
  queueId: number | null;
  queueLabel: string;
  patch: string | null;
  observedAt: string | null;
  items: ProfileItemSummary[];
  runes: ProfileRuneSummary[];
  spells: ProfileSpellSummary[];
  timelineAvailable: boolean;
  postGameAvailable: boolean;
  draftComparisonAvailable: boolean;
  positionStatus: string | null;
}

export interface ProfileInsight {
  code: string;
  title: string;
  detail: string;
  evidence: string;
  sampleSize: number;
  periodStart: string | null;
  periodEnd: string | null;
  coverage: number;
  status: AvailabilityStatus;
  ruleVersion: string;
}

export interface PlayerProfileOverview {
  status: AvailabilityStatus;
  identity: {
    riotId: string;
    platform: string;
    regionLabel: string;
    profileIconId: number | null;
    summonerLevel: number | null;
    updatedAt: string | null;
  };
  ranked: {
    status: AvailabilityStatus;
    queue: string | null;
    tier: string | null;
    division: string | null;
    leaguePoints: number | null;
    wins: number | null;
    losses: number | null;
    winRate: number | null;
    updatedAt: string | null;
    unavailableReason?: string;
  };
  roleProfile: {
    primaryRole: Role | null;
    secondaryRole: Role | null;
    roleEvidence: ProfileRoleEvidence[];
  };
  recentPerformance: {
    sampleSize: number;
    wins: number;
    losses: number;
    winRate: number | null;
    periodStart: string | null;
    periodEnd: string | null;
    metrics: ProfileMetric[];
  };
  performanceTrend: PerformanceTrendPoint[];
  topChampions: ProfileChampionSummary[];
  recentMatches: ProfileRecentMatch[];
  strengths: ProfileInsight[];
  improvementAreas: ProfileInsight[];
  coverage: ProfileCoverage;
  provenance: DataProvenance[];
  algorithmVersion: string;
  generatedAt: string;
}

export interface PlayerProfileAnalytics {
  roleProfile: PlayerProfileOverview["roleProfile"];
  recentPerformance: PlayerProfileOverview["recentPerformance"];
  performanceTrend: PerformanceTrendPoint[];
  topChampions: ProfileChampionSummary[];
  strengths: ProfileInsight[];
  improvementAreas: ProfileInsight[];
}

export interface PlayerProfileMatchInput extends MatchParticipationRecord {
  championName: string;
}

const round = (value: number, digits = 1): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

function metric(input: {
  key: ProfileMetricKey;
  label: string;
  value: number | null;
  sampleSize: number;
  availableSampleSize: number;
  formula: string;
  unavailableReason?: string;
  unit?: ProfileMetric["unit"];
}): ProfileMetric {
  const coverage = input.sampleSize === 0 ? 0 : input.availableSampleSize / input.sampleSize;
  const status: AvailabilityStatus =
    input.value === null ? "UNAVAILABLE" : coverage < 1 ? "PARTIAL" : "AVAILABLE";
  return {
    key: input.key,
    label: input.label,
    value: input.value === null ? null : round(clamp(input.value)),
    unit: input.unit ?? "INDEX",
    status,
    sampleSize: input.sampleSize,
    availableSampleSize: input.availableSampleSize,
    coverage,
    formula: input.formula,
    algorithmVersion: PLAYER_PROFILE_OVERVIEW_ALGORITHM_VERSION,
    ...(input.unavailableReason ? { unavailableReason: input.unavailableReason } : {})
  };
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratioIndex(
  matches: PlayerProfileMatchInput[],
  selector: (match: PlayerProfileMatchInput) => number,
  baselineKey: string
) {
  if (matches.length === 0) return null;
  return average(
    matches.map((match) => (selector(match) / roleBaselines[match.role][baselineKey]) * 75)
  );
}

function insightCoverage(code: string, matches: PlayerProfileMatchInput[]): number {
  if (matches.length === 0) return 0;
  if (code.includes("objetiv")) {
    return matches.filter((match) => match.objectiveParticipation !== null).length / matches.length;
  }
  if (code.includes("participacao_abates")) {
    return matches.filter((match) => match.killParticipation !== null).length / matches.length;
  }
  return 1;
}

function buildInsight(
  signal: { code: string; label: string; detail: string },
  matches: PlayerProfileMatchInput[]
): ProfileInsight {
  const dates = matches.flatMap((match) => (match.observedAt ? [match.observedAt] : [])).sort();
  const coverage = insightCoverage(signal.code, matches);
  return {
    code: signal.code,
    title: signal.label,
    detail: signal.detail,
    evidence: `Sinal calculado sobre ${matches.length} partida${matches.length === 1 ? "" : "s"} observada${matches.length === 1 ? "" : "s"}.`,
    sampleSize: matches.length,
    periodStart: dates[0] ?? null,
    periodEnd: dates.at(-1) ?? null,
    coverage,
    status: coverage < 1 ? "PARTIAL" : "AVAILABLE",
    ruleVersion: PLAYER_PROFILE_OVERVIEW_ALGORITHM_VERSION
  };
}

export function buildPlayerProfileAnalytics(
  matches: PlayerProfileMatchInput[]
): PlayerProfileAnalytics {
  const ordered = [...matches].sort((left, right) =>
    (right.observedAt ?? "").localeCompare(left.observedAt ?? "")
  );
  const sampleSize = ordered.length;
  const dated = ordered.filter((match): match is PlayerProfileMatchInput & { observedAt: string } =>
    Boolean(match.observedAt)
  );
  const periodDates = dated.map((match) => match.observedAt).sort();
  const performanceValues = ordered.map((match) => calculateRecentForm([match]));
  const performanceAverage = average(performanceValues);
  const recentPerformanceValue = sampleSize === 0 ? null : calculateRecentForm(ordered);
  const performanceDeviation =
    performanceAverage === null
      ? null
      : Math.sqrt(
          performanceValues.reduce((sum, value) => sum + (value - performanceAverage) ** 2, 0) /
            performanceValues.length
        );
  const objectiveValues = ordered.flatMap((match) =>
    match.objectiveParticipation === null ? [] : [match.objectiveParticipation * 100]
  );
  const killParticipationValues = ordered.flatMap((match) =>
    match.killParticipation === null ? [] : [match.killParticipation * 100]
  );
  const deathsAverage = average(ordered.map((match) => match.deaths));
  const kdaIndex = ratioIndex(
    ordered,
    (match) => calculateKda(match.kills, match.deaths, match.assists),
    "kda"
  );

  const metrics: ProfileMetric[] = [
    metric({
      key: "CONSISTENCY",
      label: "Consistência",
      value:
        performanceDeviation === null || sampleSize < 2 ? null : 100 - performanceDeviation * 4,
      sampleSize,
      availableSampleSize: sampleSize < 2 ? 0 : sampleSize,
      formula: "100 − 4 × desvio-padrão do índice de desempenho por partida.",
      unavailableReason:
        sampleSize < 2 ? "São necessárias ao menos duas partidas observadas." : undefined
    }),
    metric({
      key: "OBJECTIVES",
      label: "Objetivos",
      value: average(objectiveValues),
      sampleSize,
      availableSampleSize: objectiveValues.length,
      formula: "Média da participação observada em objetivos × 100.",
      unavailableReason:
        objectiveValues.length === 0
          ? "Participação em objetivos não está disponível na amostra."
          : undefined,
      unit: "PERCENT"
    }),
    metric({
      key: "VISION",
      label: "Visão",
      value: ratioIndex(ordered, (match) => match.visionScorePerMinute, "vision"),
      sampleSize,
      availableSampleSize: sampleSize,
      formula: "Média de visão/min ÷ referência da posição × 75."
    }),
    metric({
      key: "TEAM_IMPACT",
      label: "Impacto em equipe",
      value: average(killParticipationValues),
      sampleSize,
      availableSampleSize: killParticipationValues.length,
      formula: "Média da participação observada em abates × 100.",
      unavailableReason:
        killParticipationValues.length === 0
          ? "Participação em abates não está disponível na amostra."
          : undefined,
      unit: "PERCENT"
    }),
    metric({
      key: "RECENT_PERFORMANCE",
      label: "Desempenho recente",
      value: recentPerformanceValue,
      sampleSize,
      availableSampleSize: sampleSize,
      formula:
        "Índice Sparta ponderado por recência, com KDA, resultado, farm, dano, ouro, mortes e visão."
    }),
    metric({
      key: "SURVIVAL",
      label: "Sobrevivência",
      value: deathsAverage === null ? null : normalizeInverse(deathsAverage, DEATHS_BAD_VALUE),
      sampleSize,
      availableSampleSize: sampleSize,
      formula: `100 − mortes médias ÷ ${DEATHS_BAD_VALUE} × 100.`
    }),
    metric({
      key: "FARM",
      label: "Farm",
      value: ratioIndex(ordered, (match) => match.csPerMinute, "cs"),
      sampleSize,
      availableSampleSize: sampleSize,
      formula: "Média de CS/min ÷ referência da posição × 75."
    }),
    metric({
      key: "EXECUTION",
      label: "Execução",
      value: kdaIndex,
      sampleSize,
      availableSampleSize: sampleSize,
      formula: "Média de KDA ÷ referência da posição × 75."
    })
  ];

  const roleMap = new Map<Role, { games: number; lastObservedAt: string | null }>();
  for (const match of ordered) {
    const current = roleMap.get(match.role) ?? { games: 0, lastObservedAt: null };
    roleMap.set(match.role, {
      games: current.games + 1,
      lastObservedAt: current.lastObservedAt ?? match.observedAt ?? null
    });
  }
  const roleEvidence = Array.from(roleMap.entries())
    .map(([role, evidence]) => ({
      role,
      games: evidence.games,
      share: sampleSize === 0 ? 0 : evidence.games / sampleSize,
      lastObservedAt: evidence.lastObservedAt
    }))
    .sort((left, right) => right.games - left.games || left.role.localeCompare(right.role));

  const groups = new Map<string, PlayerProfileMatchInput[]>();
  for (const match of ordered) {
    const key = `${match.championId}:${match.role}`;
    groups.set(key, [...(groups.get(key) ?? []), match]);
  }
  const aggregated = Array.from(groups.values()).flatMap((group) => {
    const first = group[0];
    const stats = aggregatePlayerChampionStats(
      first.championId,
      first.championName,
      first.role,
      group
    );
    return stats ? [{ stats, matches: group }] : [];
  });
  const topChampions = aggregated
    .map(({ stats, matches: championMatches }) => ({
      championId: stats.championId,
      championName: stats.championName,
      role: stats.role,
      games: stats.games,
      wins: stats.wins,
      losses: stats.games - stats.wins,
      winRate: round((stats.wins / stats.games) * 100),
      kda: round(calculateKda(stats.kills, stats.deaths, stats.assists), 2),
      recentForm: ((): "improving" | "stable" | "declining" => {
        const scores = championMatches.map((match) => calculateRecentForm([match]));
        if (scores.length < 4) return "stable" as const;
        const half = Math.floor(scores.length / 2);
        const recent = average(scores.slice(0, half)) ?? 0;
        const previous = average(scores.slice(half)) ?? 0;
        return recent - previous >= 5
          ? "improving"
          : previous - recent >= 5
            ? "declining"
            : "stable";
      })(),
      sampleStatus:
        stats.games < MIN_GAMES_FOR_RANKING ? ("SMALL" as const) : ("SUFFICIENT" as const),
      lastPlayedAt: championMatches[0]?.observedAt ?? null
    }))
    .sort(
      (left, right) =>
        right.games - left.games ||
        (right.lastPlayedAt ?? "").localeCompare(left.lastPlayedAt ?? "") ||
        left.championName.localeCompare(right.championName)
    );

  const stats = aggregated.map((entry) => entry.stats);
  const signals = derivePlayerStrengthsWeaknesses(stats);

  return {
    roleProfile: {
      primaryRole: roleEvidence[0]?.role ?? null,
      secondaryRole: roleEvidence[1]?.role ?? null,
      roleEvidence
    },
    recentPerformance: {
      sampleSize,
      wins: ordered.filter((match) => match.won).length,
      losses: ordered.filter((match) => !match.won).length,
      winRate:
        sampleSize === 0
          ? null
          : round((ordered.filter((match) => match.won).length / sampleSize) * 100),
      periodStart: periodDates[0] ?? null,
      periodEnd: periodDates.at(-1) ?? null,
      metrics
    },
    performanceTrend: dated
      .map((match) => ({
        matchId: match.matchId,
        observedAt: match.observedAt,
        performanceIndex: round(calculateRecentForm([match])),
        kda: round(calculateKda(match.kills, match.deaths, match.assists), 2),
        objectiveParticipation: match.objectiveParticipation,
        csPerMinute: round(match.csPerMinute, 2),
        visionScorePerMinute: round(match.visionScorePerMinute, 2),
        won: match.won
      }))
      .sort((left, right) => left.observedAt.localeCompare(right.observedAt)),
    topChampions,
    strengths: signals.strengths.map((signal) => buildInsight(signal, ordered)),
    improvementAreas: signals.weaknesses.map((signal) => buildInsight(signal, ordered))
  };
}
