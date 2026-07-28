import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

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

  it("libera PATCH no preflight do desktop para gerenciar o pool", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/players/pool/61",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "PATCH"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
    await app.close();
  });
});
