import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LiveGameSessionState, LiveGameSnapshot } from "@sparta/riot";
import {
  applyCoachingPolicy,
  buildPatchKnowledge,
  composeCoachingPhrase,
  DEFAULT_COACHING_SETTINGS,
  deriveLiveStateDelta,
  unavailablePersonalCoachingContext,
  type CoachingDecision,
  type CoachingDiagnosticsEntry,
  type CoachingLiveFacts,
  type CoachingModelContext,
  type CoachingRuntimeMetrics,
  type CoachingRuntimeState,
  type CoachingSettings,
  type LocalCoachingModel,
  type PersonalCoachingContext,
  type PersonalCoachingSignal
} from "@sparta/core";
import { assertTrustedIpcSender } from "./security-policy";
import type { VoiceOutput } from "./voice-output";
import { toCoachingLiveFacts } from "./coaching-live-facts";

const MIN_EVALUATION_INTERVAL_MS = 10_000;
const GLOBAL_SPEECH_COOLDOWN_MS = 12_000;
const CATEGORY_COOLDOWN_MS = 30_000;
const DEDUPE_COOLDOWN_MS = 90_000;
const MAX_QUEUE_SIZE = 3;
const MAX_DIAGNOSTICS = 80;

interface QueuedPhrase {
  decision: CoachingDecision;
  phrase: string;
  sessionId: string;
  queuedAt: number;
  expiresAt: number;
}

function percentile(values: number[], value: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * value) - 1)] ?? null;
}

function initialMetrics(): CoachingRuntimeMetrics {
  return {
    inferenceCount: 0,
    inferenceP50Ms: null,
    inferenceP95Ms: null,
    timeouts: 0,
    rejected: 0,
    silence: 0,
    spoken: 0,
    expired: 0,
    dropped: 0
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeCoachingSettings(value: unknown): CoachingSettings | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Partial<CoachingSettings>;
  const categories = input.categories;
  if (
    typeof input.enabled !== "boolean" ||
    typeof input.volume !== "number" ||
    !Number.isFinite(input.volume) ||
    typeof input.rate !== "number" ||
    !Number.isFinite(input.rate) ||
    (input.verbosity !== "BRIEF" && input.verbosity !== "NORMAL") ||
    (input.voiceId !== null && typeof input.voiceId !== "string") ||
    !categories ||
    typeof categories.VISION !== "boolean" ||
    typeof categories.EARLY_SAFETY !== "boolean" ||
    typeof categories.SURVIVABILITY !== "boolean" ||
    typeof categories.FARM_RESOURCES !== "boolean"
  )
    return null;
  return {
    enabled: input.enabled,
    categories: {
      VISION: categories.VISION,
      EARLY_SAFETY: categories.EARLY_SAFETY,
      SURVIVABILITY: categories.SURVIVABILITY,
      FARM_RESOURCES: categories.FARM_RESOURCES
    },
    volume: clamp(Math.round(input.volume), 0, 100),
    rate: clamp(Math.round(input.rate), -10, 10),
    verbosity: input.verbosity,
    voiceId: input.voiceId && input.voiceId.length <= 128 ? input.voiceId : null
  };
}

export function sanitizePersonalCoachingContext(value: unknown): PersonalCoachingContext | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const context = value as PersonalCoachingContext;
  if (
    context.version !== "personal-coaching-context/1.0.0" ||
    typeof context.generatedAt !== "string" ||
    context.generatedAt.length > 64 ||
    !Number.isFinite(Date.parse(context.generatedAt))
  )
    return null;
  const allowed = new Set([
    "RECURRING_CONCERN",
    "NOT_OBSERVED",
    "INSUFFICIENT_DATA",
    "UNAVAILABLE"
  ]);
  for (const signal of [
    context.vision,
    context.survivability,
    context.farming,
    context.objectives
  ]) {
    if (
      !signal ||
      !allowed.has(signal.state) ||
      !Number.isInteger(signal.sampleSize) ||
      signal.sampleSize < 0 ||
      typeof signal.coverage !== "number" ||
      !Number.isFinite(signal.coverage) ||
      signal.coverage < 0 ||
      signal.coverage > 1
    )
      return null;
  }
  const copySignal = (signal: PersonalCoachingSignal): PersonalCoachingSignal => ({
    state: signal.state,
    sampleSize: signal.sampleSize,
    coverage: signal.coverage
  });
  return {
    version: "personal-coaching-context/1.0.0",
    generatedAt: context.generatedAt,
    vision: copySignal(context.vision),
    survivability: copySignal(context.survivability),
    farming: copySignal(context.farming),
    objectives: copySignal(context.objectives)
  };
}

function evidenceRefs(facts: CoachingLiveFacts): string[] {
  const refs: string[] = ["live.sessionId", "live.observedAt"];
  for (const key of [
    "gameTimeSeconds",
    "level",
    "currentGold",
    "kills",
    "deaths",
    "assists",
    "creepScore",
    "wardScore",
    "healthRatio",
    "resourceRatio"
  ] as const) {
    if (facts[key] !== undefined) refs.push(`live.${key}`);
  }
  return [...refs, ...facts.newEventRefs];
}

export interface LocalCoachingController {
  handleLiveObservation(state: LiveGameSessionState, snapshot: LiveGameSnapshot | null): void;
  stop(): void;
  getState(): CoachingRuntimeState;
}

export function registerLocalCoachingRuntime(options: {
  prototypeEnabled: boolean;
  expectedRendererUrl: () => string;
  settingsPath: string;
  model: LocalCoachingModel;
  voice: VoiceOutput;
  now?: () => number;
}): LocalCoachingController {
  const now = options.now ?? Date.now;
  let settings = {
    ...DEFAULT_COACHING_SETTINGS,
    categories: { ...DEFAULT_COACHING_SETTINGS.categories }
  };
  let personal = unavailablePersonalCoachingContext();
  let previousFacts: CoachingLiveFacts | null = null;
  let currentSessionId: string | null = null;
  let lastEvaluationAt: number | null = null;
  let inference: AbortController | null = null;
  let inferenceToken = 0;
  let pendingContext: CoachingModelContext | null = null;
  let latestEvidenceRefs = new Set<string>();
  let queue: QueuedPhrase[] = [];
  let speaking = false;
  let stopped = false;
  let lastGlobalSpeechAt = 0;
  const categorySpeechAt = new Map<string, number>();
  const dedupeSpeechAt = new Map<string, number>();
  const latencies: number[] = [];
  const diagnostics: CoachingDiagnosticsEntry[] = [];
  const metrics = initialMetrics();
  let state: CoachingRuntimeState = {
    prototypeEnabled: options.prototypeEnabled,
    publicRelease: false,
    settings,
    modelStatus: options.prototypeEnabled ? "CHECKING" : "DISABLED",
    modelProvider: options.model.provider,
    modelName: options.model.model,
    queueState: "IDLE",
    activeSessionId: null,
    lastEvent: null,
    metrics
  };

  const trusted = (event: IpcMainInvokeEvent) =>
    assertTrustedIpcSender(event, options.expectedRendererUrl());

  function broadcast() {
    state = { ...state, settings, metrics: { ...metrics } };
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("sparta:local-coach", state);
    }
  }

  function diagnostic(entry: Omit<CoachingDiagnosticsEntry, "at" | "sessionRef">) {
    diagnostics.unshift({
      at: new Date(now()).toISOString(),
      sessionRef: currentSessionId ? `session:${currentSessionId.slice(-8)}` : "session:none",
      ...entry
    });
    diagnostics.splice(MAX_DIAGNOSTICS);
  }

  async function persistSettings() {
    await mkdir(dirname(options.settingsPath), { recursive: true });
    await writeFile(options.settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }

  async function loadSettings() {
    try {
      const loaded = sanitizeCoachingSettings(
        JSON.parse(await readFile(options.settingsPath, "utf8"))
      );
      if (loaded) settings = loaded;
    } catch {
      // Ausencia/corrupcao volta ao default OFF, nunca habilita silenciosamente.
    }
    state.settings = settings;
    if (options.prototypeEnabled && settings.enabled) {
      state.modelStatus =
        (await options.model.health()) === "AVAILABLE" ? "AVAILABLE" : "AI_UNAVAILABLE";
    } else {
      state.modelStatus = options.prototypeEnabled ? "DISABLED" : "DISABLED";
    }
    broadcast();
  }

  function resetSession(nextSessionId: string | null) {
    inferenceToken += 1;
    pendingContext = null;
    inference?.abort();
    if (inference || speaking) {
      state.queueState = "CANCELING";
      broadcast();
    }
    options.voice.cancel();
    queue = [];
    speaking = false;
    previousFacts = null;
    lastEvaluationAt = null;
    latestEvidenceRefs = new Set();
    currentSessionId = nextSessionId;
    state.activeSessionId = nextSessionId;
    state.queueState = "IDLE";
    state.lastEvent = null;
    broadcast();
  }

  async function drainQueue() {
    if (speaking || stopped) return;
    const item = queue.shift();
    if (!item) {
      state.queueState = "IDLE";
      broadcast();
      return;
    }
    const timestamp = now();
    const cooldownActive =
      timestamp - lastGlobalSpeechAt < GLOBAL_SPEECH_COOLDOWN_MS ||
      timestamp - (categorySpeechAt.get(item.decision.category) ?? 0) < CATEGORY_COOLDOWN_MS ||
      timestamp - (dedupeSpeechAt.get(item.decision.cooldownKey) ?? 0) < DEDUPE_COOLDOWN_MS;
    const evidenceStale = item.decision.evidenceRefs.some(
      (reference) => !latestEvidenceRefs.has(reference)
    );
    if (
      item.sessionId !== currentSessionId ||
      timestamp > item.expiresAt ||
      cooldownActive ||
      evidenceStale
    ) {
      metrics.expired += 1;
      state.lastEvent = "expired";
      diagnostic({
        event: "expired",
        category: item.decision.category,
        reason: evidenceStale
          ? "EVIDENCE_STALE_BEFORE_TTS"
          : cooldownActive
            ? "COOLDOWN_BEFORE_TTS"
            : "STALE_BEFORE_TTS"
      });
      void drainQueue();
      return;
    }
    speaking = true;
    state.queueState = "SPEAKING";
    state.lastEvent = "speaking";
    diagnostic({ event: "speaking", category: item.decision.category });
    broadcast();
    try {
      await options.voice.speak(item.phrase, {
        volume: settings.volume,
        rate: settings.rate,
        voiceId: settings.voiceId
      });
      if (item.sessionId !== currentSessionId) return;
      const spokenAt = now();
      lastGlobalSpeechAt = spokenAt;
      categorySpeechAt.set(item.decision.category, spokenAt);
      dedupeSpeechAt.set(item.decision.cooldownKey, spokenAt);
      metrics.spoken += 1;
      state.lastEvent = "spoken";
      diagnostic({ event: "spoken", category: item.decision.category });
    } catch {
      metrics.dropped += 1;
      state.lastEvent = "dropped";
      diagnostic({
        event: "dropped",
        category: item.decision.category,
        reason: "VOICE_UNAVAILABLE"
      });
    } finally {
      speaking = false;
      state.queueState = "IDLE";
      broadcast();
      void drainQueue();
    }
  }

  function enqueue(decision: CoachingDecision, phrase: string, contextGeneratedAt: string) {
    const timestamp = now();
    const blocked =
      timestamp - lastGlobalSpeechAt < GLOBAL_SPEECH_COOLDOWN_MS ||
      timestamp - (categorySpeechAt.get(decision.category) ?? 0) < CATEGORY_COOLDOWN_MS ||
      timestamp - (dedupeSpeechAt.get(decision.cooldownKey) ?? 0) < DEDUPE_COOLDOWN_MS;
    if (blocked || queue.some((item) => item.decision.cooldownKey === decision.cooldownKey)) {
      metrics.dropped += 1;
      state.lastEvent = "dropped";
      diagnostic({ event: "dropped", category: decision.category, reason: "ANTI_SPAM" });
      broadcast();
      return;
    }
    if (queue.length >= MAX_QUEUE_SIZE) {
      metrics.dropped += 1;
      state.lastEvent = "dropped";
      diagnostic({ event: "dropped", category: decision.category, reason: "QUEUE_FULL" });
      broadcast();
      return;
    }
    queue.push({
      decision,
      phrase,
      sessionId: decision.sessionId,
      queuedAt: timestamp,
      expiresAt: Date.parse(contextGeneratedAt) + decision.ttlMs
    });
    const rank = { HIGH: 2, NORMAL: 1, LOW: 0 } as const;
    queue.sort(
      (left, right) =>
        rank[right.decision.priority] - rank[left.decision.priority] ||
        left.queuedAt - right.queuedAt
    );
    state.lastEvent = "queued";
    diagnostic({ event: "queued", category: decision.category });
    broadcast();
    void drainQueue();
  }

  async function pumpEvaluation() {
    if (inference || !pendingContext || stopped) return;
    const context = pendingContext;
    pendingContext = null;
    if (context.sessionId !== currentSessionId) return;
    const controller = new AbortController();
    inference = controller;
    const token = inferenceToken;
    lastEvaluationAt = now();
    try {
      let result = await options.model.evaluate(context, controller.signal);
      // Uma unica tentativa adicional, limitada, para uma resposta sintaticamente invalida.
      if (result.status === "INVALID" && !controller.signal.aborted) {
        result = await options.model.evaluate(context, controller.signal);
      }
      if (
        controller.signal.aborted ||
        token !== inferenceToken ||
        context.sessionId !== currentSessionId
      )
        return;
      metrics.inferenceCount += 1;
      latencies.push(result.latencyMs);
      latencies.splice(0, Math.max(0, latencies.length - 100));
      metrics.inferenceP50Ms = percentile(latencies, 0.5);
      metrics.inferenceP95Ms = percentile(latencies, 0.95);
      diagnostic({ event: "evaluation", latencyMs: result.latencyMs, reason: result.status });

      if (result.status === "SILENCE") {
        metrics.silence += 1;
        state.lastEvent = null;
        diagnostic({ event: "silence", reason: "MODEL_SILENCE" });
        broadcast();
        return;
      }
      if (result.status === "TIMEOUT") metrics.timeouts += 1;
      if (result.status !== "DECISION") {
        if (result.status === "UNAVAILABLE") state.modelStatus = "AI_UNAVAILABLE";
        metrics.rejected += 1;
        diagnostic({ event: "rejected", reason: result.status });
        broadcast();
        return;
      }
      const policy = applyCoachingPolicy(result.value, context, currentSessionId ?? "", now());
      if (!policy.accepted) {
        metrics.rejected += 1;
        diagnostic({ event: "rejected", reason: policy.reason });
        broadcast();
        return;
      }
      enqueue(
        policy.decision,
        composeCoachingPhrase(policy.decision, context.personal, settings.verbosity),
        context.generatedAt
      );
    } finally {
      if (inference === controller) inference = null;
      if (pendingContext && !stopped) void pumpEvaluation();
    }
  }

  function handleLiveObservation(
    stateValue: LiveGameSessionState,
    snapshot: LiveGameSnapshot | null
  ) {
    if (stopped) return;
    if (stateValue === "ENDED" || stateValue === "UNAVAILABLE") {
      if (currentSessionId) resetSession(null);
      return;
    }
    if (!options.prototypeEnabled || !settings.enabled || stateValue !== "LIVE" || !snapshot)
      return;
    if (snapshot.sessionId !== currentSessionId) resetSession(snapshot.sessionId);
    const facts = toCoachingLiveFacts(snapshot);
    latestEvidenceRefs = new Set(evidenceRefs(facts));
    const delta = deriveLiveStateDelta(previousFacts, facts, lastEvaluationAt);
    previousFacts = facts;
    if (!delta.meaningful || state.modelStatus !== "AVAILABLE") return;
    const timestamp = now();
    if (lastEvaluationAt !== null && timestamp - lastEvaluationAt < MIN_EVALUATION_INTERVAL_MS)
      return;
    const allowedCategories = (
      Object.keys(settings.categories) as (keyof CoachingSettings["categories"])[]
    ).filter((category) => settings.categories[category]);
    if (allowedCategories.length === 0) return;
    const context: CoachingModelContext = {
      schemaVersion: "coaching-model-context/1.0.0",
      sessionId: facts.sessionId,
      generatedAt: new Date(timestamp).toISOString(),
      sourceKinds: {
        live: "LIVE_FACT",
        personal: "PERSONAL_HISTORY_FACT",
        patch: "PATCH_KNOWLEDGE",
        generic: "GENERIC_KNOWLEDGE"
      },
      live: facts,
      delta,
      personal,
      knowledge: buildPatchKnowledge(null, undefined, allowedCategories),
      allowedCategories,
      evidenceRefs: [...latestEvidenceRefs]
    };
    inferenceToken += 1;
    pendingContext = context;
    inference?.abort();
    void pumpEvaluation();
  }

  ipcMain.handle("sparta:local-coach:state", (event: IpcMainInvokeEvent) => {
    trusted(event);
    return state;
  });
  ipcMain.handle("sparta:local-coach:diagnostics", (event: IpcMainInvokeEvent) => {
    trusted(event);
    return process.env.NODE_ENV === "production" ? [] : diagnostics;
  });
  ipcMain.handle("sparta:local-coach:voices", async (event: IpcMainInvokeEvent) => {
    trusted(event);
    return options.prototypeEnabled ? options.voice.listVoices() : [];
  });
  ipcMain.handle(
    "sparta:local-coach:settings",
    async (event: IpcMainInvokeEvent, value: unknown) => {
      trusted(event);
      const parsed = sanitizeCoachingSettings(value);
      if (!parsed || (!options.prototypeEnabled && parsed.enabled)) return false;
      settings = parsed;
      await persistSettings();
      if (!settings.enabled) {
        resetSession(null);
        state.modelStatus = "DISABLED";
      } else {
        state.modelStatus = "CHECKING";
        broadcast();
        state.modelStatus =
          (await options.model.health()) === "AVAILABLE" ? "AVAILABLE" : "AI_UNAVAILABLE";
      }
      broadcast();
      return true;
    }
  );
  ipcMain.handle("sparta:local-coach:personal", (event: IpcMainInvokeEvent, value: unknown) => {
    trusted(event);
    const parsed = sanitizePersonalCoachingContext(value);
    if (!parsed) return false;
    personal = parsed;
    return true;
  });
  ipcMain.handle("sparta:local-coach:test-voice", async (event: IpcMainInvokeEvent) => {
    trusted(event);
    if (!options.prototypeEnabled) return false;
    try {
      await options.voice.speak("Teste de voz local do Sparta.", {
        volume: settings.volume,
        rate: settings.rate,
        voiceId: settings.voiceId
      });
      return true;
    } catch {
      return false;
    }
  });

  void loadSettings();

  return {
    handleLiveObservation,
    stop() {
      stopped = true;
      resetSession(null);
    },
    getState: () => state
  };
}

export const LOCAL_COACH_LIMITS = {
  minEvaluationIntervalMs: MIN_EVALUATION_INTERVAL_MS,
  globalSpeechCooldownMs: GLOBAL_SPEECH_COOLDOWN_MS,
  categoryCooldownMs: CATEGORY_COOLDOWN_MS,
  dedupeCooldownMs: DEDUPE_COOLDOWN_MS,
  maxQueueSize: MAX_QUEUE_SIZE
} as const;
