import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

export const replaysRoutes: FastifyPluginAsync = async (app) => {
  app.post("/replays/import", async (request, reply) => {
    const payload = z.object({ fileName: z.string().endsWith(".rofl") }).parse(request.body);
    reply.code(202);
    return {
      id: crypto.randomUUID(),
      fileName: payload.fileName,
      status: "not_implemented",
      message: "Replay registrado como recurso experimental; parser .rofl não faz parte do MVP."
    };
  });

  app.get("/replays/:jobId", async (request) => ({
    jobId: z.object({ jobId: z.string() }).parse(request.params).jobId,
    status: "not_implemented"
  }));
};
