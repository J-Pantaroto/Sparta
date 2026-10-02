import { afterEach, describe, expect, it, vi } from "vitest";
import { unavailablePersonalCoachingContext, type CoachingModelContext } from "@sparta/core";
import { LOCAL_MODEL_LOOPBACK_ORIGIN, OllamaLocalCoachingModel } from "./local-coaching-model";

function context(): CoachingModelContext {
  const at = "2026-10-02T12:00:00.000Z";
  return {
    schemaVersion: "coaching-model-context/1.0.0",
    sessionId: "s",
    generatedAt: at,
    sourceKinds: {
      live: "LIVE_FACT",
      personal: "PERSONAL_HISTORY_FACT",
      patch: "PATCH_KNOWLEDGE",
      generic: "GENERIC_KNOWLEDGE"
    },
    live: { sessionId: "s", observedAt: at, wardScore: 0, newEventRefs: [] },
    delta: {
      sessionId: "s",
      observedAt: at,
      meaningful: true,
      changedEvidenceRefs: ["live.wardScore"],
      reason: "MEANINGFUL_CHANGE"
    },
    personal: unavailablePersonalCoachingContext(at),
    knowledge: { version: "test", currentPatch: null, patchMatch: true, entries: [] },
    allowedCategories: ["VISION"],
    evidenceRefs: ["live.wardScore"]
  };
}

describe("OllamaLocalCoachingModel", () => {
  afterEach(() => vi.useRealTimers());
  it("nao faz rede sem nome de modelo explicitamente configurado", async () => {
    const request = vi.fn();
    const model = new OllamaLocalCoachingModel(undefined, request as typeof fetch);
    expect(await model.health()).toBe("UNAVAILABLE");
    expect((await model.evaluate(context(), new AbortController().signal)).status).toBe(
      "UNAVAILABLE"
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("usa somente a origem loopback fixa para health e inferencia", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [{ name: "local:test" }] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: JSON.stringify({
              schemaVersion: "coaching-decision/1.0.0",
              shouldSpeak: false,
              sessionId: "s",
              reason: "INSUFFICIENT_CONTEXT"
            })
          }),
          { status: 200 }
        )
      );
    const model = new OllamaLocalCoachingModel("local:test", request as typeof fetch);
    expect(await model.health()).toBe("AVAILABLE");
    expect((await model.evaluate(context(), new AbortController().signal)).status).toBe("SILENCE");
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      `${LOCAL_MODEL_LOOPBACK_ORIGIN}/api/tags`,
      `${LOCAL_MODEL_LOOPBACK_ORIGIN}/api/generate`
    ]);
  });

  it("mantem resposta invalida fora da politica", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ response: "ordene ao jogador atacar" }), { status: 200 })
      );
    const model = new OllamaLocalCoachingModel("local:test", request as typeof fetch);
    expect((await model.evaluate(context(), new AbortController().signal)).status).toBe("INVALID");
  });

  it("limita health e inferencia lenta por timeout sem travar o desktop", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_url: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true
          })
        )
    );
    const model = new OllamaLocalCoachingModel("local:test", request as typeof fetch);
    const health = model.health();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await health).toBe("UNAVAILABLE");

    const evaluation = model.evaluate(context(), new AbortController().signal);
    await vi.advanceTimersByTimeAsync(6_000);
    expect((await evaluation).status).toBe("TIMEOUT");
  });

  it("distingue cancelamento da sessao de timeout", async () => {
    const request = vi.fn(
      (_url: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true
          })
        )
    );
    const model = new OllamaLocalCoachingModel("local:test", request as typeof fetch);
    const controller = new AbortController();
    const evaluation = model.evaluate(context(), controller.signal);
    controller.abort();
    expect((await evaluation).status).toBe("CANCELED");
  });
});
