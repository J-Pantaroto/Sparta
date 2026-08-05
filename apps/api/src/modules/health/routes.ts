import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../db/prisma.js";
import { loadEnv } from "../../config/env.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    status: "ok",
    service: "sparta-api",
    timestamp: new Date().toISOString()
  }));

  app.get("/ready", async (_request, reply) => {
    const { READINESS_TIMEOUT_MS } = loadEnv();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_resolve, reject) => {
          timeout = globalThis.setTimeout(
            () => reject(new Error("readiness_timeout")),
            READINESS_TIMEOUT_MS
          );
        })
      ]);
      return {
        status: "ready",
        service: "sparta-api",
        dependencies: { database: "available", redis: "not_used" }
      };
    } catch {
      reply.code(503);
      return {
        status: "not_ready",
        service: "sparta-api",
        dependencies: { database: "unavailable", redis: "not_used" }
      };
    } finally {
      if (timeout) globalThis.clearTimeout(timeout);
    }
  });
};
