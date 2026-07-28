import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { ExternalServiceError } from "@sparta/riot";
import { safeExternalErrorLog, sendExternalError } from "./http/external-error-response.js";
import { authRoutes } from "./modules/auth/routes.js";
import { draftsRoutes } from "./modules/drafts/routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import { playersRoutes } from "./modules/players/routes.js";
import { postgameRoutes } from "./modules/postgame/routes.js";
import { replaysRoutes } from "./modules/replays/routes.js";
import { matchesRoutes } from "./modules/matches/routes.js";

// Origens permitidas a chamar a API. O app empacotado carrega o renderer via
// file:// e o Chromium envia Origin "null" nesse caso; localhost:5173 e o
// servidor Vite em dev. Qualquer outra origem (ex.: um site malicioso tentando
// usar o navegador da vitima para acessar a API que roda em localhost) e
// rejeitada — CORS aberto (origin: true) numa API que fica de pe em
// localhost:3333 permite esse tipo de ataque "drive-by localhost".
const ALLOWED_ORIGINS = new Set(["http://localhost:5173", "null"]);

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origem nao permitida"), false);
    },
    // A lista e explicita porque o default do plugin nao inclui metodos de
    // mutacao alem de POST. PUT atende settings; PATCH atende a desativacao
    // de entradas manuais do pool pessoal.
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH"]
  });
  // Limite global generoso; rotas sensiveis a forca bruta (login/registro)
  // tem limite proprio, mais restrito, definido em modules/auth/routes.ts.
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
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
  await app.register(matchesRoutes);
  await app.register(replaysRoutes);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ExternalServiceError) {
      request.log.warn({ event: "external_request_failed", ...safeExternalErrorLog(error) });
      return sendExternalError(reply, error);
    }
    return reply.send(error);
  });

  return app;
}
