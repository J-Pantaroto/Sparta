import type {
  CoachingCategory,
  CoachingDecision,
  CoachingModelContext,
  CoachingObservation,
  CoachingOption,
  CoachingPriority,
  CoachingSilenceDecision
} from "./contracts.js";

const CATEGORIES = new Set<CoachingCategory>([
  "VISION",
  "EARLY_SAFETY",
  "SURVIVABILITY",
  "FARM_RESOURCES"
]);
const PRIORITIES = new Set<CoachingPriority>(["LOW", "NORMAL", "HIGH"]);
const OBSERVATIONS = new Set<CoachingObservation>([
  "VISION_WINDOW",
  "EARLY_SAFETY_WINDOW",
  "LOW_SURVIVABILITY_MARGIN",
  "FARM_WINDOW",
  "LOW_RESOURCE_MARGIN"
]);
const OPTIONS = new Set<CoachingOption>([
  "ESTABLISH_VISION_WHEN_SAFE",
  "PLAY_WITH_SAFETY_MARGIN",
  "MAINTAIN_FARM",
  "PRESERVE_RESOURCES",
  "REDUCE_PRESSURE"
]);
const PRIORITY_CAP: Record<CoachingCategory, CoachingPriority> = {
  VISION: "NORMAL",
  EARLY_SAFETY: "NORMAL",
  SURVIVABILITY: "HIGH",
  FARM_RESOURCES: "NORMAL"
};
const PRIORITY_RANK: Record<CoachingPriority, number> = { LOW: 0, NORMAL: 1, HIGH: 2 };
const COOLDOWN_KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const DECISION_KEYS = new Set([
  "schemaVersion",
  "shouldSpeak",
  "sessionId",
  "category",
  "priority",
  "confidence",
  "observation",
  "options",
  "evidenceRefs",
  "knowledgeRefs",
  "cooldownKey",
  "ttlMs"
]);
const OBSERVATION_CATEGORY: Record<CoachingObservation, CoachingCategory> = {
  VISION_WINDOW: "VISION",
  EARLY_SAFETY_WINDOW: "EARLY_SAFETY",
  LOW_SURVIVABILITY_MARGIN: "SURVIVABILITY",
  FARM_WINDOW: "FARM_RESOURCES",
  LOW_RESOURCE_MARGIN: "FARM_RESOURCES"
};
const SILENCE_REASONS = new Set<CoachingSilenceDecision["reason"]>([
  "INSUFFICIENT_CONTEXT",
  "LOW_CONFIDENCE",
  "NO_ACTIONABLE_BENEFIT",
  "KNOWLEDGE_INSUFFICIENT",
  "REPETITION"
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string"))
    return null;
  return value as string[];
}

export function parseCoachingSilenceDecision(value: unknown): CoachingSilenceDecision | null {
  const source = record(value);
  if (
    !source ||
    source.schemaVersion !== "coaching-decision/1.0.0" ||
    source.shouldSpeak !== false ||
    typeof source.sessionId !== "string" ||
    source.sessionId.length === 0 ||
    source.sessionId.length > 128 ||
    !SILENCE_REASONS.has(source.reason as CoachingSilenceDecision["reason"]) ||
    Object.keys(source).some(
      (key) => !["schemaVersion", "shouldSpeak", "sessionId", "reason"].includes(key)
    )
  )
    return null;
  return {
    schemaVersion: "coaching-decision/1.0.0",
    shouldSpeak: false,
    sessionId: source.sessionId,
    reason: source.reason as CoachingSilenceDecision["reason"]
  };
}

export function parseCoachingDecision(value: unknown): CoachingDecision | null {
  const source = record(value);
  if (!source || source.schemaVersion !== "coaching-decision/1.0.0") return null;
  if (source.shouldSpeak !== true) return null;
  if (Object.keys(source).some((key) => !DECISION_KEYS.has(key))) return null;
  if (
    typeof source.sessionId !== "string" ||
    source.sessionId.length === 0 ||
    source.sessionId.length > 128
  )
    return null;
  if (!CATEGORIES.has(source.category as CoachingCategory)) return null;
  if (!PRIORITIES.has(source.priority as CoachingPriority)) return null;
  if (
    typeof source.confidence !== "number" ||
    !Number.isFinite(source.confidence) ||
    source.confidence < 0 ||
    source.confidence > 1
  )
    return null;
  if (!OBSERVATIONS.has(source.observation as CoachingObservation)) return null;
  const options = stringArray(source.options, 2);
  const evidenceRefs = stringArray(source.evidenceRefs, 8);
  const knowledgeRefs = stringArray(source.knowledgeRefs, 4);
  if (
    !options ||
    options.length === 0 ||
    options.some((item) => !OPTIONS.has(item as CoachingOption))
  )
    return null;
  if (!evidenceRefs || evidenceRefs.length === 0 || !knowledgeRefs) return null;
  if (typeof source.cooldownKey !== "string" || !COOLDOWN_KEY.test(source.cooldownKey)) return null;
  if (
    typeof source.ttlMs !== "number" ||
    !Number.isInteger(source.ttlMs) ||
    source.ttlMs < 1_000 ||
    source.ttlMs > 15_000
  )
    return null;
  return {
    schemaVersion: "coaching-decision/1.0.0",
    shouldSpeak: true,
    sessionId: source.sessionId,
    category: source.category as CoachingCategory,
    priority: source.priority as CoachingPriority,
    confidence: source.confidence,
    observation: source.observation as CoachingObservation,
    options: options as CoachingOption[],
    evidenceRefs,
    knowledgeRefs,
    cooldownKey: source.cooldownKey,
    ttlMs: source.ttlMs
  };
}

export type PolicyResult =
  { accepted: true; decision: CoachingDecision } | { accepted: false; reason: string };

export function applyCoachingPolicy(
  raw: unknown,
  context: CoachingModelContext,
  currentSessionId: string,
  nowMs = Date.now()
): PolicyResult {
  const decision = parseCoachingDecision(raw);
  if (!decision) return { accepted: false, reason: "INVALID_SCHEMA" };
  if (decision.sessionId !== context.sessionId || decision.sessionId !== currentSessionId) {
    return { accepted: false, reason: "STALE_SESSION" };
  }
  if (!context.allowedCategories.includes(decision.category)) {
    return { accepted: false, reason: "CATEGORY_DISABLED" };
  }
  if (PRIORITY_RANK[decision.priority] > PRIORITY_RANK[PRIORITY_CAP[decision.category]]) {
    return { accepted: false, reason: "PRIORITY_ABOVE_CAP" };
  }
  if (decision.confidence < 0.65) {
    return { accepted: false, reason: "LOW_CONFIDENCE" };
  }
  if (OBSERVATION_CATEGORY[decision.observation] !== decision.category) {
    return { accepted: false, reason: "CATEGORY_OBSERVATION_MISMATCH" };
  }
  if (decision.evidenceRefs.some((ref) => !context.evidenceRefs.includes(ref))) {
    return { accepted: false, reason: "UNKNOWN_EVIDENCE_REF" };
  }
  const knowledgeIds = new Set(context.knowledge.entries.map((entry) => entry.id));
  if (decision.knowledgeRefs.some((ref) => !knowledgeIds.has(ref))) {
    return { accepted: false, reason: "UNKNOWN_KNOWLEDGE_REF" };
  }
  const generatedAt = Date.parse(context.generatedAt);
  if (!Number.isFinite(generatedAt) || nowMs - generatedAt > decision.ttlMs) {
    return { accepted: false, reason: "EXPIRED_CONTEXT" };
  }
  return { accepted: true, decision };
}
