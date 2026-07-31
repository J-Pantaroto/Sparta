import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedUserIdMock,
  riotAccountFindFirstMock,
  createCandidateMock,
  createCandidateRevisionMock,
  listCandidatesMock,
  findCandidateMock,
  createAndRunExperimentMock,
  listExperimentsMock,
  findExperimentMock,
  listExperimentCasesMock,
  decideCandidateMock
} = vi.hoisted(() => ({
  getAuthenticatedUserIdMock: vi.fn(),
  riotAccountFindFirstMock: vi.fn(),
  createCandidateMock: vi.fn(),
  createCandidateRevisionMock: vi.fn(),
  listCandidatesMock: vi.fn(),
  findCandidateMock: vi.fn(),
  createAndRunExperimentMock: vi.fn(),
  listExperimentsMock: vi.fn(),
  findExperimentMock: vi.fn(),
  listExperimentCasesMock: vi.fn(),
  decideCandidateMock: vi.fn()
}));

vi.mock("../auth/routes.js", () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
  authRoutes: async () => {}
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: { riotAccount: { findFirst: riotAccountFindFirstMock } }
}));

vi.mock("./calibration-repository.js", () => ({
  createCandidate: createCandidateMock,
  createCandidateRevision: createCandidateRevisionMock,
  listCandidates: listCandidatesMock,
  findCandidate: findCandidateMock,
  createAndRunExperiment: createAndRunExperimentMock,
  listExperiments: listExperimentsMock,
  findExperiment: findExperimentMock,
  listExperimentCases: listExperimentCasesMock,
  decideCandidate: decideCandidateMock
}));

import Fastify from "fastify";
import { calibrationRoutes } from "./routes.js";

async function buildApp() {
  const app = Fastify();
  await app.register(calibrationRoutes);
  await app.ready();
  return app;
}

const validBody = {
  name: "só composição",
  baselineAggregationVersion: "1.0.0",
  candidateVersion: "1.0.0",
  metricWeights: { TEAM_COMPOSITION: 1 },
  status: "READY" as const
};

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUserIdMock.mockResolvedValue("user-1");
  riotAccountFindFirstMock.mockResolvedValue({ id: "account-1", userId: "user-1" });
});

describe("isolamento por conta", () => {
  it("recusa sem autenticação", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/calibration/candidates" });

    expect(response.statusCode).toBe(401);
    expect(listCandidatesMock).not.toHaveBeenCalled();
  });

  it("recusa sem conta Riot vinculada", async () => {
    riotAccountFindFirstMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/calibration/candidates" });

    expect(response.statusCode).toBe(422);
  });

  it("sempre consulta com a conta resolvida no servidor, nunca com id do cliente", async () => {
    listExperimentsMock.mockResolvedValue([]);
    const app = await buildApp();

    await app.inject({ method: "GET", url: "/calibration/experiments?playerId=outra-conta" });

    expect(listExperimentsMock).toHaveBeenCalledWith("account-1", undefined);
  });
});

describe("configurações candidatas", () => {
  it("cria configuração válida", async () => {
    createCandidateMock.mockResolvedValue({ ok: true, row: { id: "cand-1", revision: 1 } });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/candidates",
      payload: validBody
    });

    expect(response.statusCode).toBe(201);
    expect(createCandidateMock).toHaveBeenCalledWith(
      expect.objectContaining({ riotAccountId: "account-1" })
    );
  });

  it("devolve 422 com as rejeições estruturadas quando a configuração não é reproduzível", async () => {
    createCandidateMock.mockResolvedValue({
      ok: false,
      failure: {
        code: "CANDIDATE_INVALID",
        message: "não reproduzível",
        details: [{ code: "DERIVATION_PARAMETER", parameter: "minGamesForRanking" }]
      }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/candidates",
      payload: { ...validBody, postAggregationThresholds: { minGamesForRanking: 3 } }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().details[0].parameter).toBe("minGamesForRanking");
  });

  it("valida sem persistir", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/candidates/validate",
      payload: { ...validBody, postAggregationThresholds: { maxFamiliarityRiskRelief: 0.5 } }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().valid).toBe(false);
    expect(createCandidateMock).not.toHaveBeenCalled();
  });

  it("recusa corpo malformado antes de chegar ao repositório", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/candidates",
      payload: { name: "" }
    });

    expect(response.statusCode).toBe(400);
    expect(createCandidateMock).not.toHaveBeenCalled();
  });

  it("cria revisão preservando a anterior", async () => {
    createCandidateRevisionMock.mockResolvedValue({ ok: true, row: { id: "cand-2", revision: 2 } });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/candidates/cand-1/revisions",
      payload: validBody
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().revision).toBe(2);
  });
});

describe("experimentos", () => {
  it("cria e executa, devolvendo 201 quando é novo", async () => {
    createAndRunExperimentMock.mockResolvedValue({
      ok: true,
      result: { experiment: { id: "exp-1", status: "COMPLETED" }, reused: false }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/experiments",
      payload: { candidateId: "cand-1", filters: { roles: ["JUNGLE"] } }
    });

    expect(response.statusCode).toBe(201);
  });

  it("devolve 200 e reused quando o mesmo input já tinha experimento", async () => {
    createAndRunExperimentMock.mockResolvedValue({
      ok: true,
      result: { experiment: { id: "exp-1", status: "COMPLETED" }, reused: true }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/experiments",
      payload: { candidateId: "cand-1", filters: {} }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().reused).toBe(true);
  });

  it("devolve 409 quando o experimento já está em execução", async () => {
    createAndRunExperimentMock.mockResolvedValue({
      ok: false,
      failure: { code: "EXPERIMENT_ALREADY_RUNNING", message: "em execução" }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/experiments",
      payload: { candidateId: "cand-1", filters: {} }
    });

    expect(response.statusCode).toBe(409);
  });

  it("não inicia experimento com configuração inválida", async () => {
    createAndRunExperimentMock.mockResolvedValue({
      ok: false,
      failure: { code: "CANDIDATE_INVALID", message: "não reproduzível", details: [] }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/experiments",
      payload: { candidateId: "cand-1", filters: {} }
    });

    expect(response.statusCode).toBe(422);
  });

  it("pagina os casos e aceita filtro por status de replay", async () => {
    listExperimentCasesMock.mockResolvedValue({ total: 30, limit: 5, offset: 10, cases: [] });
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/calibration/experiments/exp-1/cases?limit=5&offset=10&replayStatus=EXACT_REPLAY"
    });

    expect(response.statusCode).toBe(200);
    expect(listExperimentCasesMock).toHaveBeenCalledWith({
      riotAccountId: "account-1",
      experimentId: "exp-1",
      limit: 5,
      offset: 10,
      replayStatus: "EXACT_REPLAY"
    });
  });

  it("devolve 404 para experimento de outra conta", async () => {
    listExperimentCasesMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/calibration/experiments/exp-de-outro/cases"
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("decisão humana", () => {
  it("aprova apenas para versão futura, declarando que nada foi ativado", async () => {
    decideCandidateMock.mockResolvedValue({
      ok: true,
      row: { id: "cand-1", status: "APPROVED_FOR_FUTURE_RELEASE" }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/candidates/cand-1/approve-for-future-release",
      payload: { experimentId: "exp-1", note: "revisado" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("APPROVED_FOR_FUTURE_RELEASE");
    expect(response.json().activation).toBe("NOT_ACTIVATED");
    expect(decideCandidateMock).toHaveBeenCalledWith(
      expect.objectContaining({ decidedBy: "user-1", experimentId: "exp-1" })
    );
  });

  it("recusa aprovação sem experimento concluído", async () => {
    decideCandidateMock.mockResolvedValue({
      ok: false,
      failure: {
        code: "DECISION_REQUIRES_COMPLETED_EXPERIMENT",
        message: "exige experimento concluído"
      }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/candidates/cand-1/approve-for-future-release",
      payload: {}
    });

    expect(response.statusCode).toBe(422);
  });

  it("rejeita sem exigir experimento", async () => {
    decideCandidateMock.mockResolvedValue({ ok: true, row: { id: "cand-1", status: "REJECTED" } });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/candidates/cand-1/reject",
      payload: { note: "desloca demais" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("REJECTED");
  });
});

describe("vocabulário publicado", () => {
  it("expõe o registro de capacidade e o teto de promoção", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/calibration/parameters" });
    const body = response.json();

    expect(body.maxPromotionStatus).toBe("APPROVED_FOR_FUTURE_RELEASE");
    expect(body.weightableMetrics).toContain("TEAM_COMPOSITION");
    expect(
      body.registry.some(
        (entry: { parameter: string; capability: string }) =>
          entry.parameter === "maxFamiliarityRiskRelief" &&
          entry.capability === "REQUIRES_HISTORICAL_DERIVATION_INPUT"
      )
    ).toBe(true);
  });
});
