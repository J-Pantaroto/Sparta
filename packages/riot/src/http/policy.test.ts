import { describe, expect, it, vi } from "vitest";
import { ExternalServiceError } from "./external-service-error.js";
import { fetchWithPolicy, requestJson, type RetryPolicy } from "./policy.js";

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new globalThis.Response(JSON.stringify(body), { status, headers });
}

const retryPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 1_000,
  maxTotalDurationMs: 10_000,
  jitterRatio: 0.2,
  retryTimeouts: true,
  retryStatuses: new Set([429, 502, 503, 504])
};

describe("HTTP policy", () => {
  it("aborta no timeout e devolve codigo estavel sem expor a causa", async () => {
    const fetchImpl = vi.fn((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("https://secret/?token=x"), { code: "ABORT_ERR" })));
      })
    );

    await expect(
      fetchWithPolicy("https://secret.invalid/?token=x", {
        integration: "DATA_DRAGON",
        timeoutMs: 1,
        fetchImpl,
        retryPolicy: { ...retryPolicy, maxAttempts: 1 }
      })
    ).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      integration: "DATA_DRAGON",
      sanitizedCause: { name: "Error", code: "ABORT_ERR" }
    });
    const error = await fetchWithPolicy("x", {
      integration: "DATA_DRAGON",
      timeoutMs: 1,
      fetchImpl,
      retryPolicy: { ...retryPolicy, maxAttempts: 1 }
    }).catch((cause) => cause as ExternalServiceError);
    expect(JSON.stringify(error)).not.toContain("secret");
    expect(JSON.stringify(error)).not.toContain("token=x");
  });

  it("respeita Retry-After e permite jitter deterministico", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(429, {}, { "retry-after": "2" }))
      .mockResolvedValueOnce(response(503, {}))
      .mockResolvedValueOnce(response(200, { ok: true }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await requestJson<{ ok: boolean }>("https://example.invalid", {
      integration: "RIOT_API",
      timeoutMs: 100,
      retryPolicy,
      fetchImpl,
      sleep,
      random: () => 1,
      validate: (payload): payload is { ok: boolean } =>
        typeof payload === "object" && payload !== null && (payload as { ok?: unknown }).ok === true
    });

    expect(result).toEqual({ ok: true });
    expect(sleep).toHaveBeenNthCalledWith(1, 2_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 240);
  });

  it("nao deixa Retry-After ultrapassar a duracao total", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(429, {}, { "retry-after": "60" }));
    const sleep = vi.fn();
    await expect(
      fetchWithPolicy("https://example.invalid", {
        integration: "RIOT_API",
        timeoutMs: 100,
        retryPolicy,
        fetchImpl,
        sleep
      })
    ).rejects.toMatchObject({ code: "RIOT_RATE_LIMITED", retryAfterMs: 60_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("limpa o timer quando a resposta chega antes do timeout", async () => {
    vi.useFakeTimers();
    try {
      await fetchWithPolicy("https://example.invalid", {
        integration: "DATA_DRAGON",
        timeoutMs: 100,
        fetchImpl: vi.fn().mockResolvedValue(response(200, {}))
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [401, "RIOT_CREDENTIAL_INVALID"],
    [403, "RIOT_CREDENTIAL_INVALID"],
    [404, "UPSTREAM_NOT_FOUND"]
  ])("nao retenta status %s", async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(status, {}));
    await expect(
      fetchWithPolicy("https://example.invalid", {
        integration: "RIOT_API",
        timeoutMs: 100,
        retryPolicy,
        fetchImpl
      })
    ).rejects.toMatchObject({ code });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("nao retenta resposta JSON invalida nem POST nao idempotente", async () => {
    const invalidFetch = vi.fn().mockResolvedValue(response(200, { wrong: true }));
    await expect(
      requestJson("https://example.invalid", {
        integration: "DATA_DRAGON",
        timeoutMs: 100,
        retryPolicy,
        fetchImpl: invalidFetch,
        validate: (payload): payload is { ok: true } =>
          typeof payload === "object" && payload !== null && (payload as { ok?: unknown }).ok === true
      })
    ).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(invalidFetch).toHaveBeenCalledTimes(1);

    const postFetch = vi.fn().mockResolvedValue(response(503, {}));
    await expect(
      fetchWithPolicy("https://example.invalid", {
        integration: "SPARTA_API",
        timeoutMs: 100,
        retryPolicy,
        idempotent: false,
        request: { method: "POST" },
        fetchImpl: postFetch
      })
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(postFetch).toHaveBeenCalledTimes(1);
  });
});
