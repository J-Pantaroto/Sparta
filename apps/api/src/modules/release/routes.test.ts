import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedUserIdMock,
  riotAccountFindFirstMock,
  createReleaseMock,
  listReleasesMock,
  findReleaseMock,
  listReleaseEventsMock,
  validateReleaseMock,
  activateReleaseMock,
  rollbackReleaseMock,
  findActiveReleaseForAccountMock,
  invalidateActiveConfigurationCacheMock
} = vi.hoisted(() => ({
  getAuthenticatedUserIdMock: vi.fn(),
  riotAccountFindFirstMock: vi.fn(),
  createReleaseMock: vi.fn(),
  listReleasesMock: vi.fn(),
  findReleaseMock: vi.fn(),
  listReleaseEventsMock: vi.fn(),
  validateReleaseMock: vi.fn(),
  activateReleaseMock: vi.fn(),
  rollbackReleaseMock: vi.fn(),
  findActiveReleaseForAccountMock: vi.fn(),
  invalidateActiveConfigurationCacheMock: vi.fn()
}));

vi.mock("../auth/routes.js", () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
  authRoutes: async () => {}
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: { riotAccount: { findFirst: riotAccountFindFirstMock } }
}));

vi.mock("./release-repository.js", () => ({
  createRelease: createReleaseMock,
  listReleases: listReleasesMock,
  findRelease: findReleaseMock,
  listReleaseEvents: listReleaseEventsMock,
  validateRelease: validateReleaseMock,
  activateRelease: activateReleaseMock,
  rollbackRelease: rollbackReleaseMock,
  findActiveReleaseForAccount: findActiveReleaseForAccountMock
}));

vi.mock("./active-configuration-provider.js", () => ({
  invalidateActiveConfigurationCache: invalidateActiveConfigurationCacheMock
}));

import Fastify from "fastify";
import { releaseRoutes } from "./routes.js";

async function buildApp() {
  const app = Fastify();
  await app.register(releaseRoutes);
  await app.ready();
  return app;
}

const releaseRow = {
  id: "release-1",
  status: "READY_FOR_ACTIVATION",
  configHash: "hash-1"
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

    const response = await app.inject({ method: "GET", url: "/calibration/releases" });

    expect(response.statusCode).toBe(401);
    expect(listReleasesMock).not.toHaveBeenCalled();
  });

  it("recusa sem conta Riot vinculada", async () => {
    riotAccountFindFirstMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/calibration/releases" });

    expect(response.statusCode).toBe(422);
  });

  it("toda consulta é filtrada pela conta do usuário autenticado, nunca por id solto", async () => {
    listReleasesMock.mockResolvedValue([]);
    const app = await buildApp();

    await app.inject({ method: "GET", url: "/calibration/releases" });

    expect(listReleasesMock).toHaveBeenCalledWith("account-1");
  });
});

describe("POST /calibration/candidates/:candidateId/releases", () => {
  it("cria a release com o autor resolvido do token, não do corpo", async () => {
    createReleaseMock.mockResolvedValue({ ok: true, row: releaseRow });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/candidates/candidate-1/releases",
      payload: { releaseVersion: "release-1" }
    });

    expect(response.statusCode).toBe(201);
    expect(createReleaseMock).toHaveBeenCalledWith({
      riotAccountId: "account-1",
      candidateId: "candidate-1",
      releaseVersion: "release-1",
      createdBy: "user-1"
    });
  });

  it("rejeita corpo sem releaseVersion", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/candidates/candidate-1/releases",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(createReleaseMock).not.toHaveBeenCalled();
  });

  it("candidata não aprovada devolve 422", async () => {
    createReleaseMock.mockResolvedValue({
      ok: false,
      failure: { code: "CANDIDATE_NOT_APPROVED", message: "não aprovada" }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/candidates/candidate-1/releases",
      payload: { releaseVersion: "release-1" }
    });

    expect(response.statusCode).toBe(422);
  });
});

describe("POST /calibration/releases/:releaseId/activate", () => {
  it("não aceita peso nem configuração no corpo — só releaseId e motivo opcional", async () => {
    activateReleaseMock.mockResolvedValue({ ok: true, row: { ...releaseRow, status: "ACTIVE" } });
    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/calibration/releases/release-1/activate",
      payload: { reason: "primeira release calibrada", metricWeights: { TEAM_COMPOSITION: 1 } }
    });

    // O peso enviado no corpo é ignorado: activateRelease só recebe releaseId/actor/reason.
    expect(activateReleaseMock).toHaveBeenCalledWith({
      riotAccountId: "account-1",
      releaseId: "release-1",
      actor: "user-1",
      reason: "primeira release calibrada"
    });
  });

  it("sucesso invalida o cache da conta", async () => {
    activateReleaseMock.mockResolvedValue({ ok: true, row: { ...releaseRow, status: "ACTIVE" } });
    const app = await buildApp();

    await app.inject({ method: "POST", url: "/calibration/releases/release-1/activate", payload: {} });

    expect(invalidateActiveConfigurationCacheMock).toHaveBeenCalledWith("account-1");
  });

  it("falha não invalida o cache", async () => {
    activateReleaseMock.mockResolvedValue({
      ok: false,
      failure: { code: "INVALID_TRANSITION", message: "não pronta" }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/releases/release-1/activate",
      payload: {}
    });

    expect(response.statusCode).toBe(409);
    expect(invalidateActiveConfigurationCacheMock).not.toHaveBeenCalled();
  });
});

describe("POST /calibration/releases/:releaseId/rollback", () => {
  it("sucesso invalida o cache da conta", async () => {
    rollbackReleaseMock.mockResolvedValue({ ok: true, row: { ...releaseRow, status: "ROLLED_BACK" } });
    const app = await buildApp();

    await app.inject({ method: "POST", url: "/calibration/releases/release-1/rollback", payload: {} });

    expect(invalidateActiveConfigurationCacheMock).toHaveBeenCalledWith("account-1");
  });

  it("release que não é a atualmente ativa devolve 409", async () => {
    rollbackReleaseMock.mockResolvedValue({
      ok: false,
      failure: { code: "NOT_CURRENTLY_ACTIVE", message: "não é a ativa" }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/calibration/releases/release-1/rollback",
      payload: {}
    });

    expect(response.statusCode).toBe(409);
  });
});

describe("GET /recommendation-engine/active-release", () => {
  it("com release ativa, devolve a release e não fabrica cenário de baseline", async () => {
    findActiveReleaseForAccountMock.mockResolvedValue(releaseRow);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/recommendation-engine/active-release" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ source: "RELEASE", release: releaseRow });
  });

  it("sem release ativa, devolve as três tabelas reais da baseline por cenário", async () => {
    findActiveReleaseForAccountMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/recommendation-engine/active-release" });
    const body = response.json();

    expect(body.source).toBe("BUILT_IN_BASELINE");
    expect(body.scenarios).toHaveLength(3);
    expect(body.scenarios.map((entry: { label: string }) => entry.label)).toEqual([
      "BLIND_PICK",
      "ENEMY_LANE_REVEALED",
      "MID_DRAFT"
    ]);
  });
});
