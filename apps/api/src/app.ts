import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { ZodError } from "zod";
import { ExternalServiceError } from "@sparta/riot";
import { safeExternalErrorLog, sendExternalError } from "./http/external-error-response.js";
import { requestLogSerializer } from "./http/log-redaction.js";
import { authRoutes } from "./modules/auth/routes.js";
import { createRiotIdentityRoutes } from "./modules/auth/riot-identity-routes.js";
import { enforceRouteAuthorization, hasAuthorizationPolicy } from "./modules/auth/authorization-policy.js";
import type { RiotIdentityProvider } from "./modules/auth/riot-identity.js";
import { draftsRoutes } from "./modules/drafts/routes.js";
import { replayBundleRoutes } from "./modules/drafts/replay-bundle-routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import { playersRoutes } from "./modules/players/routes.js";
import { postgameRoutes } from "./modules/postgame/routes.js";
import { recommendationObservabilityRoutes } from "./modules/observability/routes.js";
import { draftReviewRoutes } from "./modules/reviews/routes.js";
import { calibrationRoutes } from "./modules/calibration/routes.js";
import { releaseRoutes } from "./modules/release/routes.js";
import { replaysRoutes } from "./modules/replays/routes.js";
import { matchesRoutes } from "./modules/matches/routes.js";
import { catalogRoutes } from "./modules/catalog/routes.js";
import { patchesRoutes } from "./modules/patches/routes.js";
import { loadEnv, parseAllowedOrigins } from "./config/env.js";

// O app empacotado carrega o renderer via file:// e envia Origin "null";
// localhost:5173 e o Vite em dev. A allowlist vem do ambiente para que uma
// origem web futura seja explícita. CORS nunca substitui autenticação.
export async function buildApp(
  options: {
    riotIdentityProvider?: RiotIdentityProvider;
    enforceCentralAuthorization?: boolean;
  } = {}
) {
  const env = loadEnv();
  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  const app = Fastify({
    trustProxy: env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false,
    requestTimeout: env.REQUEST_TIMEOUT_MS,
    logger: {
      level: env.LOG_LEVEL,
      // `redact` cobre o caso de algum caminho passar a emitir headers; o
      // serializador abaixo já não os coleta, então as duas camadas se
      // reforçam em vez de dependerem uma da outra.
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
        remove: true
      },
      serializers: { req: requestLogSerializer }
    }
  });

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
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
  await app.register(rateLimit, { max: env.GLOBAL_RATE_LIMIT_MAX, timeWindow: "1 minute" });
  // Cabeçalhos de endurecimento aplicados a toda resposta. Escritos à mão em
  // vez de trazer `@fastify/helmet`: a API só é consumida pelo renderer do
  // Electron e uma dependência nova é superfície nova. HSTS fica no edge que
  // realmente termina HTTPS; anunciá-lo na API HTTP local seria incorreto.
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    reply.removeHeader("X-Powered-By");
    return payload;
  });

  // Swagger é ferramenta de desenvolvimento. Fora do desenvolvimento ele
  // publicaria o inventário completo de rotas e schemas, e
  // `@fastify/swagger-ui` arrasta `@fastify/static`, que acumula avisos de
  // path traversal. Sem `/docs`, essa superfície deixa de existir em vez de
  // depender da versão do transitivo estar em dia.
  //
  // A condição tem dois opt-ins: ambiente `development` e flag explícita.
  // Ambiente inválido é recusado pela validação antes do boot; test/produção
  // e desenvolvimento sem a flag permanecem fechados.
  if (env.NODE_ENV === "development" && env.API_DOCS_ENABLED) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "Sparta API",
          version: "0.9.0"
        }
      }
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  // O error handler precisa ser instalado ANTES dos plugins de rota.
  // No Fastify, cada contexto encapsulado herda o handler existente no
  // momento em que e criado — registrado depois, ele nunca chegava as
  // rotas, e a resposta de erro continuava sendo a serializacao padrao
  // (500 com a mensagem crua). Achado real: os testes de seguranca desta
  // etapa reprovaram exatamente por isso.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ExternalServiceError) {
      request.log.warn({ event: "external_request_failed", ...safeExternalErrorLog(error) });
      return sendExternalError(reply, error);
    }

    // Payload inválido é erro do cliente, não do servidor. Antes, o `parse`
    // do zod lançava e caía no caminho genérico abaixo: a resposta saía como
    // **500** com o dump completo do erro do zod no `message` — status errado
    // e descrição do schema interno de graça. Agora vira 400 com a lista de
    // caminhos inválidos, sem a mensagem crua da biblioteca.
    if (error instanceof ZodError) {
      request.log.info({ event: "invalid_payload", issues: error.issues.length });
      return reply.status(400).send({
        error: "invalid_payload",
        message: "Payload inválido.",
        fields: error.issues.map((issue) => issue.path.join("."))
      });
    }

    // Erro não classificado: registra o detalhe no log do servidor e devolve
    // uma mensagem genérica. `error.message` pode carregar detalhe de
    // infraestrutura (nome de tabela, coluna, string de conexão do Prisma) —
    // isso pertence ao log, não à resposta.
    const failure = error as { statusCode?: number; name?: string; message?: string };
    const status = typeof failure.statusCode === "number" ? failure.statusCode : 500;
    if (status >= 500) {
      request.log.error({ event: "unhandled_error", name: failure.name, statusCode: status });
      return reply.status(status).send({
        error: "internal_error",
        message: "Não foi possível concluir a operação."
      });
    }
    return reply.status(status).send({
      error: failure.name ?? "request_error",
      message: failure.message ?? "Requisição inválida."
    });
  });

  // Matriz fail-closed: toda rota registrada precisa declarar uma classe de
  // acesso. O hook roda antes do handler e centraliza identidade, estado do
  // vinculo e compatibilidade dos identificadores legados.
  if (options.enforceCentralAuthorization ?? env.IDENTITY_MODE !== "TEST") {
    app.addHook("preHandler", enforceRouteAuthorization);
  }
  const applicationRoutes: Array<{ method: string; path: string }> = [];
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method !== "HEAD" && method !== "OPTIONS") {
        applicationRoutes.push({ method, path: route.url });
      }
    }
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(createRiotIdentityRoutes(options.riotIdentityProvider));
  await app.register(playersRoutes);
  await app.register(draftsRoutes);
  await app.register(replayBundleRoutes);
  await app.register(postgameRoutes);
  await app.register(recommendationObservabilityRoutes);
  await app.register(draftReviewRoutes);
  await app.register(calibrationRoutes);
  await app.register(releaseRoutes);
  await app.register(matchesRoutes);
  await app.register(catalogRoutes);
  await app.register(patchesRoutes);
  await app.register(replaysRoutes);

  const uncovered = applicationRoutes.filter(
    (route) => !hasAuthorizationPolicy(route.method, route.path)
  );
  if (uncovered.length > 0) {
    throw new Error(
      `Rotas sem politica de autorizacao: ${uncovered.map((route) => `${route.method} ${route.path}`).join(", ")}`
    );
  }

  return app;
}
