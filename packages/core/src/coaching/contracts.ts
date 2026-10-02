export const LOCAL_AI_COACH_ALGORITHM_VERSION = "local-ai-coach/1.0.0";
export const LOCAL_AI_COACH_PROMPT_VERSION = "local-ai-coach-prompt/1.0.0";

export type CoachingCategory = "VISION" | "EARLY_SAFETY" | "SURVIVABILITY" | "FARM_RESOURCES";
export type CoachingPriority = "LOW" | "NORMAL" | "HIGH";
export type CoachingVerbosity = "BRIEF" | "NORMAL";
export type PersonalSignalState =
  "RECURRING_CONCERN" | "NOT_OBSERVED" | "INSUFFICIENT_DATA" | "UNAVAILABLE";

export type CoachingObservation =
  | "VISION_WINDOW"
  | "EARLY_SAFETY_WINDOW"
  | "LOW_SURVIVABILITY_MARGIN"
  | "FARM_WINDOW"
  | "LOW_RESOURCE_MARGIN";

export type CoachingOption =
  | "ESTABLISH_VISION_WHEN_SAFE"
  | "PLAY_WITH_SAFETY_MARGIN"
  | "MAINTAIN_FARM"
  | "PRESERVE_RESOURCES"
  | "REDUCE_PRESSURE";

export interface PersonalCoachingSignal {
  state: PersonalSignalState;
  sampleSize: number;
  coverage: number;
}

export interface PersonalCoachingContext {
  version: "personal-coaching-context/1.0.0";
  generatedAt: string;
  vision: PersonalCoachingSignal;
  survivability: PersonalCoachingSignal;
  farming: PersonalCoachingSignal;
  objectives: PersonalCoachingSignal;
}

export interface CoachingLiveFacts {
  sessionId: string;
  observedAt: string;
  gameTimeSeconds?: number;
  level?: number;
  currentGold?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  creepScore?: number;
  wardScore?: number;
  healthRatio?: number;
  resourceRatio?: number;
  newEventRefs: string[];
}

export interface LiveStateDelta {
  sessionId: string;
  observedAt: string;
  changedEvidenceRefs: string[];
  meaningful: boolean;
  reason:
    "SESSION_STARTED" | "MEANINGFUL_CHANGE" | "CONSERVATIVE_HEARTBEAT" | "NO_MEANINGFUL_CHANGE";
}

export interface PatchKnowledgeEntry {
  id: string;
  kind: "PATCH_KNOWLEDGE" | "GENERIC_KNOWLEDGE";
  source: "SPARTA_REVIEWED_GUIDANCE" | "RIOT_PATCH_NOTES";
  sourceRef: string;
  reviewedAt: string;
  patchVersion: string;
  patchSensitive: boolean;
  categories: CoachingCategory[];
  statement: string;
}

export interface PatchKnowledge {
  version: string;
  currentPatch: string | null;
  patchMatch: boolean;
  entries: PatchKnowledgeEntry[];
}

export interface CoachingModelContext {
  schemaVersion: "coaching-model-context/1.0.0";
  sessionId: string;
  generatedAt: string;
  sourceKinds: {
    live: "LIVE_FACT";
    personal: "PERSONAL_HISTORY_FACT";
    patch: "PATCH_KNOWLEDGE";
    generic: "GENERIC_KNOWLEDGE";
  };
  live: CoachingLiveFacts;
  delta: LiveStateDelta;
  personal: PersonalCoachingContext;
  knowledge: PatchKnowledge;
  allowedCategories: CoachingCategory[];
  evidenceRefs: string[];
}

/**
 * Saida sem texto livre. O modelo escolhe O QUE merece atencao; a frase em
 * PT-BR e composta depois, deterministicamente, fora do modelo.
 */
export interface CoachingDecision {
  schemaVersion: "coaching-decision/1.0.0";
  shouldSpeak: true;
  sessionId: string;
  category: CoachingCategory;
  priority: CoachingPriority;
  confidence: number;
  observation: CoachingObservation;
  options: CoachingOption[];
  evidenceRefs: string[];
  knowledgeRefs: string[];
  cooldownKey: string;
  ttlMs: number;
}

export interface CoachingSilenceDecision {
  schemaVersion: "coaching-decision/1.0.0";
  shouldSpeak: false;
  sessionId: string;
  reason:
    | "INSUFFICIENT_CONTEXT"
    | "LOW_CONFIDENCE"
    | "NO_ACTIONABLE_BENEFIT"
    | "KNOWLEDGE_INSUFFICIENT"
    | "REPETITION";
}

export interface LocalCoachingModelResult {
  status: "DECISION" | "SILENCE" | "UNAVAILABLE" | "TIMEOUT" | "INVALID" | "CANCELED";
  value?: unknown;
  latencyMs: number;
}

export interface LocalCoachingModel {
  readonly provider: string;
  readonly model: string | null;
  health(signal?: AbortSignal): Promise<"AVAILABLE" | "UNAVAILABLE">;
  evaluate(context: CoachingModelContext, signal: AbortSignal): Promise<LocalCoachingModelResult>;
}

export interface CoachingSettings {
  enabled: boolean;
  categories: Record<CoachingCategory, boolean>;
  volume: number;
  rate: number;
  verbosity: CoachingVerbosity;
  voiceId: string | null;
}

export const DEFAULT_COACHING_SETTINGS: CoachingSettings = {
  enabled: false,
  categories: {
    VISION: true,
    EARLY_SAFETY: true,
    SURVIVABILITY: true,
    FARM_RESOURCES: true
  },
  volume: 70,
  rate: 0,
  verbosity: "BRIEF",
  voiceId: null
};

export interface VoiceDescriptor {
  id: string;
  name: string;
  language: string;
}

export interface CoachingRuntimeMetrics {
  inferenceCount: number;
  inferenceP50Ms: number | null;
  inferenceP95Ms: number | null;
  timeouts: number;
  rejected: number;
  silence: number;
  spoken: number;
  expired: number;
  dropped: number;
}

export interface CoachingRuntimeState {
  prototypeEnabled: boolean;
  publicRelease: false;
  settings: CoachingSettings;
  modelStatus: "DISABLED" | "CHECKING" | "AVAILABLE" | "AI_UNAVAILABLE";
  modelProvider: string;
  modelName: string | null;
  queueState: "IDLE" | "SPEAKING" | "CANCELING";
  activeSessionId: string | null;
  lastEvent: "queued" | "speaking" | "spoken" | "expired" | "dropped" | null;
  metrics: CoachingRuntimeMetrics;
}

export interface CoachingDiagnosticsEntry {
  at: string;
  sessionRef: string;
  event:
    | "evaluation"
    | "rejected"
    | "silence"
    | "queued"
    | "speaking"
    | "spoken"
    | "expired"
    | "dropped";
  category?: CoachingCategory;
  reason?: string;
  latencyMs?: number;
}
