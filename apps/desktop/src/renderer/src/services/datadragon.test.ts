import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAllChampions,
  fetchLatestDataDragonVersion,
  getLastDataDragonCacheMetadata
} from "./datadragon";

function jsonResponse(status: number, body: unknown): Response {
  return new globalThis.Response(JSON.stringify(body), { status });
}

describe("Data Dragon renderer", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("nao converte falha de rede em versao fixa", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchLatestDataDragonVersion()).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
    expect(getLastDataDragonCacheMetadata()).toMatchObject({ state: "MISS", servedAsFallback: false });
  });

  it("serve somente cache stale ainda valido e o marca como fallback", async () => {
    const now = Date.now();
    localStorage.setItem(
      "sparta:http-cache:versions",
      JSON.stringify({
        payload: ["16.14.1"],
        collectedAt: new Date(now - 8 * 24 * 60 * 60 * 1_000).toISOString(),
        freshUntil: new Date(now - 1_000).toISOString(),
        staleUntil: new Date(now + 1_000).toISOString()
      })
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(fetchLatestDataDragonVersion()).resolves.toBe("16.14.1");
    expect(getLastDataDragonCacheMetadata()).toMatchObject({
      state: "STALE",
      servedAsFallback: true,
      fallbackReason: "NETWORK_UNAVAILABLE"
    });
  });

  it("resposta invalida nao vira lista vazia", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { data: {} })));
    await expect(fetchAllChampions("16.14.1")).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
});
