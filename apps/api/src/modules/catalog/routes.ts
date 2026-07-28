import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { findChampionCapabilityProfile } from "./champion-capability-repository.js";

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/catalog/champions/:championId/capabilities",
    async (request, reply) => {
      const { championId } = z
        .object({ championId: z.coerce.number().int().positive() })
        .parse(request.params);
      const profile = await findChampionCapabilityProfile(championId);
      if (!profile) {
        reply.code(404);
        return {
          status: "UNAVAILABLE",
          unavailableReason:
            "Perfil de capacidades indisponível no catálogo local."
        };
      }
      return profile;
    }
  );
};
