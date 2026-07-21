import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

describe("api", () => {
  it("responds to healthcheck", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
    await app.close();
  });

  it("recusa sincronizar partidas sem autenticacao", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/players/sync" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
