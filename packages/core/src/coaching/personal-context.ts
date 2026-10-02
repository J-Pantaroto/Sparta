import type {
  PlayerProfileOverview,
  ProfileInsight,
  ProfileMetricKey
} from "../profile/player-profile-overview.js";
import type { PersonalCoachingContext, PersonalCoachingSignal } from "./contracts.js";

const MIN_PERSONAL_SAMPLE = 3;

const CONCERN_CODES: Record<"vision" | "survivability" | "farming" | "objectives", string[]> = {
  vision: ["visao_abaixo"],
  survivability: ["morre_demais", "sobrevivencia_abaixo"],
  farming: ["farm_abaixo"],
  objectives: ["objetivos_abaixo", "baixa_contribuicao_objetivos"]
};

const METRICS: Record<"vision" | "survivability" | "farming" | "objectives", ProfileMetricKey> = {
  vision: "VISION",
  survivability: "SURVIVAL",
  farming: "FARM",
  objectives: "OBJECTIVES"
};

function signal(
  profile: PlayerProfileOverview,
  dimension: keyof typeof CONCERN_CODES
): PersonalCoachingSignal {
  const sampleSize = profile.recentPerformance.sampleSize;
  const metric = profile.recentPerformance.metrics.find((item) => item.key === METRICS[dimension]);
  if (!metric || metric.status === "UNAVAILABLE") {
    return { state: "UNAVAILABLE", sampleSize, coverage: metric?.coverage ?? 0 };
  }
  if (sampleSize < MIN_PERSONAL_SAMPLE) {
    return { state: "INSUFFICIENT_DATA", sampleSize, coverage: metric.coverage };
  }
  const concern = profile.improvementAreas.find((item: ProfileInsight) =>
    CONCERN_CODES[dimension].some((code) => item.code.includes(code))
  );
  return {
    state: concern ? "RECURRING_CONCERN" : "NOT_OBSERVED",
    sampleSize,
    coverage: concern?.coverage ?? metric.coverage
  };
}

/** Reduz o perfil a quatro estados factuais; identidade e historico bruto nao entram. */
export function buildPersonalCoachingContext(
  profile: PlayerProfileOverview,
  generatedAt = new Date().toISOString()
): PersonalCoachingContext {
  return {
    version: "personal-coaching-context/1.0.0",
    generatedAt,
    vision: signal(profile, "vision"),
    survivability: signal(profile, "survivability"),
    farming: signal(profile, "farming"),
    objectives: signal(profile, "objectives")
  };
}

export function unavailablePersonalCoachingContext(
  generatedAt = new Date().toISOString()
): PersonalCoachingContext {
  const unavailable: PersonalCoachingSignal = { state: "UNAVAILABLE", sampleSize: 0, coverage: 0 };
  return {
    version: "personal-coaching-context/1.0.0",
    generatedAt,
    vision: { ...unavailable },
    survivability: { ...unavailable },
    farming: { ...unavailable },
    objectives: { ...unavailable }
  };
}
