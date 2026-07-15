import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { authRoutes } from "./modules/auth/routes.js";
import { draftsRoutes } from "./modules/drafts/routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import { playersRoutes } from "./modules/players/routes.js";
import { postgameRoutes } from "./modules/postgame/routes.js";
import { replaysRoutes } from "./modules/replays/routes.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Sparta API",
        version: "0.1.0"
      }
    }
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(playersRoutes);
  await app.register(draftsRoutes);
  await app.register(postgameRoutes);
  await app.register(replaysRoutes);

  return app;
}
