import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { draftsRoutes } from "./modules/drafts/routes";
import { healthRoutes } from "./modules/health/routes";
import { playersRoutes } from "./modules/players/routes";
import { postgameRoutes } from "./modules/postgame/routes";
import { replaysRoutes } from "./modules/replays/routes";

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
  await app.register(playersRoutes);
  await app.register(draftsRoutes);
  await app.register(postgameRoutes);
  await app.register(replaysRoutes);

  return app;
}
