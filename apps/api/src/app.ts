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

// Origens permitidas a chamar a API. O app empacotado carrega o renderer via
// file:// e o Chromium envia Origin "null" nesse caso; localhost:5173 e o
// servidor Vite em dev. Qualquer outra origem (ex.: um site malicioso tentando
// usar o navegador da vitima para acessar a API que roda em localhost) e
// rejeitada — CORS aberto (origin: true) numa API que fica de pe em
// localhost:3333 permite esse tipo de ataque "drive-by localhost".
const ALLOWED_ORIGINS = new Set(["http://localhost:5173", "null"]);

export async function buildApp() {
  const app = Fastify({
    logger: {
      // `redact` cobre o caso de algum caminho passar a emitir headers; o
      // serializador abaixo já não os coleta, então as duas camadas se
      // reforçam em vez de dependerem uma da outra.
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers['set-cookie']"
        ],
        remove: true
      },
      serializers: { req: requestLogSerializer }
    }
  });

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
  // Cabeçalhos de endurecimento aplicados a toda resposta. Escritos à mão em
  // vez de trazer `@fastify/helmet`: a API só é consumida pelo renderer do
  // Electron em localhost, e uma dependência nova é superfície nova. HSTS
  // fica de fora de propósito — o serviço é HTTP em localhost, e anunciar
  // HSTS ali só criaria um pin inútil no navegador do usuário.
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
  // A condição é **opt-in** (`=== "development"`), não `!== "production"`:
  // um ambiente com `NODE_ENV` ausente, vazio ou "staging" não deve ganhar a
  // documentação por omissão. Errar aqui para o lado fechado é barato — quem
  // quer `/docs` declara que está em desenvolvimento.
  if (process.env.NODE_ENV === "development") {
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
    return reply
      .status(status)
      .send({ error: failure.name ?? "request_error", message: failure.message ?? "Requisição inválida." });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
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

  return app;
}
