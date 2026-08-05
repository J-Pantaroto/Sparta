import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Controles de segurança da API (Etapa 28a).
 *
 * Cobre o que a auditoria corrigiu: erro sanitizado, payload inválido virando
 * 400 em vez de 500, cabeçalhos de endurecimento, `/docs` fechado em produção
 * e POST sem corpo sendo aceito. Os testes exercitam a instância real do
 * Fastify (`buildApp`), não uma simulação — o objetivo é que uma regressão
 * nesses pontos quebre aqui, não em produção.
 */

const { getAuthenticatedUserIdMock, riotAccountFindFirstMock } = vi.hoisted(() => ({
  getAuthenticatedUserIdMock: vi.fn(),
  riotAccountFindFirstMock: vi.fn()
}));

vi.mock("./modules/auth/routes.js", () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
  authRoutes: async () => {}
}));

vi.mock("./db/prisma.js", () => ({
  prisma: { riotAccount: { findFirst: riotAccountFindFirstMock } }
}));

import { buildApp } from "./app.js";

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUserIdMock.mockResolvedValue(null);
  riotAccountFindFirstMock.mockResolvedValue(null);
});

describe("cabeçalhos de endurecimento", () => {
  it("toda resposta carrega os cabeçalhos de segurança", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    await app.close();
  });

  it("não anuncia a tecnologia do servidor", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.headers["x-powered-by"]).toBeUndefined();
    await app.close();
  });
});

describe("payload inválido", () => {
  it("erro de schema vira 400, não 500", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: { draft: { playerRole: "NAO_EXISTE" } }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_payload");
    await app.close();
  });

  it("a resposta não devolve a mensagem crua da biblioteca de validação", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: { draft: { playerRole: "NAO_EXISTE" } }
    });
    const body = response.body;

    // Antes desta etapa a resposta trazia o dump do zod inteiro, com
    // `invalid_enum_value`, as opções aceitas e o texto interno.
    expect(body).not.toContain("invalid_enum_value");
    expect(body).not.toContain("Invalid enum value");
    expect(body).not.toContain("received");
    // O nome do campo permanece, porque é o que o cliente precisa corrigir.
    expect(response.json().fields).toContain("draft.playerRole");
    await app.close();
  });

  it("erro interno não vaza mensagem nem stack", async () => {
    getAuthenticatedUserIdMock.mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.5:5432 database=sparta user=postgres")
    );
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/calibration/releases" });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("ECONNREFUSED");
    expect(response.body).not.toContain("postgres");
    expect(response.body).not.toMatch(/at .*:\d+:\d+/);
    expect(response.json()).toEqual({
      error: "internal_error",
      message: "Não foi possível concluir a operação."
    });
    await app.close();
  });
});

describe("POST sem corpo", () => {
  it("é aceito quando o cliente não anuncia JSON", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue({ id: "account-1", userId: "user-1" });
    const app = await buildApp();

    // Sem `content-type`: é o que o cliente passa a fazer desde a Etapa 28a.
    const response = await app.inject({
      method: "POST",
      url: "/calibration/releases/inexistente/validate"
    });

    // O que importa é NÃO ser 400 de corpo vazio — a rota roda e responde o
    // seu próprio erro de domínio (release inexistente).
    expect(response.statusCode).not.toBe(400);
    expect(response.body).not.toContain("FST_ERR_CTP_EMPTY_JSON_BODY");
    await app.close();
  });

  it("anunciar JSON sem corpo continua sendo recusado pelo servidor", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/releases/inexistente/validate",
      headers: { "content-type": "application/json" }
    });

    // Comportamento do Fastify, mantido de propósito: é o servidor recusando
    // uma requisição malformada. A correção foi no cliente, que parou de
    // anunciar JSON quando não manda nada.
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("superfície de documentação", () => {
  it("/docs não existe em test", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/docs" });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("/docs não existe em desenvolvimento sem opt-in", async () => {
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const app = await buildApp();
      const response = await app.inject({ method: "GET", url: "/docs" });
      expect(response.statusCode).toBe(404);
      await app.close();
    } finally {
      if (anterior === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = anterior;
    }
  });

  it("/docs existe em desenvolvimento", async () => {
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    process.env.API_DOCS_ENABLED = "true";
    try {
      const app = await buildApp();
      const response = await app.inject({ method: "GET", url: "/docs" });
      expect(response.statusCode).not.toBe(404);
      await app.close();
    } finally {
      if (anterior === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = anterior;
      delete process.env.API_DOCS_ENABLED;
    }
  });
});

describe("autenticação e isolamento", () => {
  it("rotas de release exigem autenticação", async () => {
    const app = await buildApp();
    for (const url of ["/calibration/releases", "/recommendation-engine/active-release"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(401);
    }
    await app.close();
  });

  it("ativação e rollback exigem autenticação", async () => {
    const app = await buildApp();
    for (const url of [
      "/calibration/releases/qualquer/activate",
      "/calibration/releases/qualquer/rollback"
    ]) {
      const response = await app.inject({ method: "POST", url, payload: {} });
      expect(response.statusCode).toBe(401);
    }
    await app.close();
  });

  it("usuário autenticado sem conta Riot não alcança as rotas de release", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/releases/qualquer/activate",
      payload: {}
    });

    expect(response.statusCode).toBe(422);
    await app.close();
  });
});
