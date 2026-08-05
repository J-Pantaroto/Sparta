import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRawMock } = vi.hoisted(() => ({ queryRawMock: vi.fn() }));

vi.mock("../../db/prisma.js", () => ({
  prisma: { $queryRaw: queryRawMock }
}));

import { healthRoutes } from "./routes.js";

beforeEach(() => {
  vi.clearAllMocks();
  queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
});

describe("readiness", () => {
  it("confirma o Postgres sem declarar Redis como dependência atual", async () => {
    const app = Fastify();
    await app.register(healthRoutes);
    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ready",
      dependencies: { database: "available", redis: "not_used" }
    });
    await app.close();
  });

  it("responde 503 sem vazar detalhe quando o Postgres falha", async () => {
    queryRawMock.mockRejectedValue(new Error("connect ECONNREFUSED db.internal:5432"));
    const app = Fastify();
    await app.register(healthRoutes);
    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("db.internal");
    expect(response.json()).toMatchObject({
      status: "not_ready",
      dependencies: { database: "unavailable", redis: "not_used" }
    });
    await app.close();
  });
});
