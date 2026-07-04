import { describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { playerSyncSchema } from "./modules/players/routes";

describe("api", () => {
  it("responds to healthcheck", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
    await app.close();
  });

  it("validates player sync payloads", () => {
    expect(() =>
      playerSyncSchema.parse({ riotId: "Sparta#BR1", platformRegion: "br1", regionalRouting: "americas" })
    ).not.toThrow();
    expect(() => playerSyncSchema.parse({ riotId: "invalid", platformRegion: "br1", regionalRouting: "americas" })).toThrow();
  });
});
