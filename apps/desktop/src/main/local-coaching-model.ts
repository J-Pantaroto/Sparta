import {
  buildLocalCoachPrompt,
  parseCoachingSilenceDecision,
  type CoachingModelContext,
  type LocalCoachingModel,
  type LocalCoachingModelResult
} from "@sparta/core";

const OLLAMA_ORIGIN = "http://127.0.0.1:11434";
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const MODEL_TIMEOUT_MS = 6_000;
const HEALTH_TIMEOUT_MS = 2_000;

type FetchLike = typeof fetch;

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function combineAbort(parent: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(parent.reason);
  if (parent.aborted) onAbort();
  else parent.addEventListener("abort", onAbort, { once: true });
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("LOCAL_MODEL_TIMEOUT"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      globalThis.clearTimeout(timer);
      parent.removeEventListener("abort", onAbort);
    }
  };
}

/**
 * Provider local fixo. Nem renderer nem configuracao persistida escolhem
 * host/porta: a unica origem aceita e o loopback do Ollama.
 */
export class OllamaLocalCoachingModel implements LocalCoachingModel {
  readonly provider = "ollama-loopback";
  readonly model: string | null;

  constructor(
    modelName: string | undefined = process.env.SPARTA_LOCAL_AI_MODEL,
    private readonly request: FetchLike = fetch
  ) {
    this.model = modelName && MODEL_NAME.test(modelName) ? modelName : null;
  }

  async health(signal?: AbortSignal): Promise<"AVAILABLE" | "UNAVAILABLE"> {
    if (!this.model) return "UNAVAILABLE";
    const abort = combineAbort(signal ?? new AbortController().signal, HEALTH_TIMEOUT_MS);
    try {
      const response = await this.request(`${OLLAMA_ORIGIN}/api/tags`, {
        method: "GET",
        signal: abort.signal
      });
      if (!response.ok) return "UNAVAILABLE";
      const payload = (await response.json()) as { models?: { name?: string }[] };
      return payload.models?.some((entry) => entry.name === this.model)
        ? "AVAILABLE"
        : "UNAVAILABLE";
    } catch {
      return "UNAVAILABLE";
    } finally {
      abort.dispose();
    }
  }

  async evaluate(
    context: CoachingModelContext,
    signal: AbortSignal
  ): Promise<LocalCoachingModelResult> {
    const startedAt = Date.now();
    if (!this.model) return { status: "UNAVAILABLE", latencyMs: elapsed(startedAt) };
    const abort = combineAbort(signal, MODEL_TIMEOUT_MS);
    try {
      const response = await this.request(`${OLLAMA_ORIGIN}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          prompt: buildLocalCoachPrompt(context),
          options: { temperature: 0, seed: 31, num_predict: 220 }
        })
      });
      if (!response.ok) return { status: "UNAVAILABLE", latencyMs: elapsed(startedAt) };
      const payload = (await response.json()) as { response?: unknown };
      if (typeof payload.response !== "string")
        return { status: "INVALID", latencyMs: elapsed(startedAt) };
      try {
        const value: unknown = JSON.parse(payload.response);
        if (parseCoachingSilenceDecision(value)) {
          return { status: "SILENCE", latencyMs: elapsed(startedAt) };
        }
        return { status: "DECISION", value, latencyMs: elapsed(startedAt) };
      } catch {
        return { status: "INVALID", latencyMs: elapsed(startedAt) };
      }
    } catch {
      if (signal.aborted) return { status: "CANCELED", latencyMs: elapsed(startedAt) };
      return {
        status: abort.timedOut() ? "TIMEOUT" : "UNAVAILABLE",
        latencyMs: elapsed(startedAt)
      };
    } finally {
      abort.dispose();
    }
  }
}

export const LOCAL_MODEL_LOOPBACK_ORIGIN = OLLAMA_ORIGIN;
export const LOCAL_MODEL_TIMEOUT_MS = MODEL_TIMEOUT_MS;
