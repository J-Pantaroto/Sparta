import { afterEach, describe, expect, it, vi } from "vitest";
import { RiotApiError } from "../errors/riot-api-error";
import { requestWithRiotRateLimit } from "./riot-request";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body
  } as Response;
}

describe("requestWithRiotRateLimit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna o corpo da resposta quando o request e bem sucedido", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { puuid: "abc" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestWithRiotRateLimit<{ puuid: string }>("https://example.com", "key");

    expect(result).toEqual({ puuid: "abc" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("nao retenta em erro nao-retentavel (404) - propaga imediatamente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { status: { message: "Not found" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestWithRiotRateLimit("https://example.com", "key")).rejects.toMatchObject({
      status: 404
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retenta em 429 respeitando Retry-After e sucede na segunda tentativa", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestWithRiotRateLimit<{ ok: boolean }>("https://example.com", "key", { baseDelayMs: 1 });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("desiste apos esgotar as tentativas em 429 continuo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, {}, { "retry-after": "0" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestWithRiotRateLimit("https://example.com", "key", { retries: 1, baseDelayMs: 1 })
    ).rejects.toBeInstanceOf(RiotApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
