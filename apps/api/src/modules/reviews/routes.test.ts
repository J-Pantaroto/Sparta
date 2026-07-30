import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedUserIdMock,
  riotAccountFindFirstMock,
  createDraftReviewMock,
  listDraftReviewsMock,
  submitPreMatchAssessmentMock,
  revealMatchResultMock,
  submitPostMatchAssessmentMock,
  summarizeReviewsMock
} = vi.hoisted(() => ({
  getAuthenticatedUserIdMock: vi.fn(),
  riotAccountFindFirstMock: vi.fn(),
  createDraftReviewMock: vi.fn(),
  listDraftReviewsMock: vi.fn(),
  submitPreMatchAssessmentMock: vi.fn(),
  revealMatchResultMock: vi.fn(),
  submitPostMatchAssessmentMock: vi.fn(),
  summarizeReviewsMock: vi.fn()
}));

vi.mock("../auth/routes.js", () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
  authRoutes: async () => {}
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: { riotAccount: { findFirst: riotAccountFindFirstMock } }
}));

vi.mock("./draft-review-repository.js", () => ({
  createDraftReview: createDraftReviewMock,
  listDraftReviews: listDraftReviewsMock,
  submitPreMatchAssessment: submitPreMatchAssessmentMock,
  revealMatchResult: revealMatchResultMock,
  submitPostMatchAssessment: submitPostMatchAssessmentMock,
  summarizeReviews: summarizeReviewsMock
}));

import Fastify from "fastify";
import { draftReviewRoutes } from "./routes.js";

async function buildReviewApp() {
  const app = Fastify();
  await app.register(draftReviewRoutes);
  return app;
}

const contextoCego = {
  draftSessionId: "sessao-1",
  snapshotId: "snap-1",
  role: "JUNGLE",
  roleSource: "LCU",
  source: "LCU",
  lockedInAt: "2026-07-30T09:00:00.000Z",
  selectedChampionId: 234,
  knownDraft: { allies: [], enemies: [] },
  snapshot: { id: "snap-1", recommendations: [] },
  algorithmVersions: { recommendationEngine: "1.0.0" },
  hasLinkedMatch: true
};

const revisaoCega = {
  id: "rev-1",
  playerId: "conta-1",
  draftSessionId: "sessao-1",
  snapshotId: "snap-1",
  matchId: null,
  status: "IN_PROGRESS",
  preMatchAssessment: null,
  postMatchAssessment: null,
  resultRevealedAt: null,
  createdAt: "2026-07-30T09:00:00.000Z",
  completedAt: null,
  reviewVersion: "draft-review/1.0.0",
  supersedesReviewId: null
};

const avaliacaoCega = {
  rankingCoherence: "ADEQUATE",
  strategicExplanation: "ADEQUATE",
  personalContextRepresentation: "STRONG",
  executionRiskRepresentation: "ADEQUATE",
  uncertaintyHonesty: "STRONG",
  practicalUsefulness: "ADEQUATE",
  issueTags: ["RANKING_SURPRISE"]
};

describe("rotas de revisão - autenticação e isolamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue({ id: "conta-1", puuid: "puuid-1" });
  });

  it("todas as rotas exigem autenticação", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue(null);
    const app = await buildReviewApp();

    const respostas = await Promise.all([
      app.inject({ method: "GET", url: "/draft-sessions/s1/reviews" }),
      app.inject({ method: "POST", url: "/draft-sessions/s1/reviews", payload: {} }),
      app.inject({ method: "POST", url: "/draft-reviews/r1/reveal-result" }),
      app.inject({ method: "GET", url: "/players/draft-review-summary" })
    ]);

    for (const resposta of respostas) expect(resposta.statusCode).toBe(401);
    await app.close();
  });

  it("a conta do próprio jogador é sempre quem filtra a consulta", async () => {
    listDraftReviewsMock.mockResolvedValue([]);
    const app = await buildReviewApp();

    await app.inject({ method: "GET", url: "/draft-sessions/sessao-de-outro/reviews" });

    expect(listDraftReviewsMock).toHaveBeenCalledWith("conta-1", "sessao-de-outro");
    await app.close();
  });

  it("sessão de outra conta responde 404 sem devolver conteúdo", async () => {
    listDraftReviewsMock.mockResolvedValue(null);
    const app = await buildReviewApp();

    const resposta = await app.inject({ method: "GET", url: "/draft-sessions/sessao-de-outro/reviews" });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().reviews).toBeUndefined();
    await app.close();
  });
});

describe("modo cego garantido pelo backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue({ id: "conta-1", puuid: "puuid-1" });
  });

  it("abrir a revisão devolve o contexto SEM nenhum dado da partida", async () => {
    createDraftReviewMock.mockResolvedValue({
      ok: true,
      value: { review: revisaoCega, context: contextoCego }
    });
    const app = await buildReviewApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/draft-sessions/sessao-1/reviews",
      payload: {}
    });
    const corpo = resposta.json();
    const texto = JSON.stringify(corpo);

    expect(resposta.statusCode).toBe(200);
    // Só a existência do vínculo atravessa; nada da partida.
    expect(corpo.context.hasLinkedMatch).toBe(true);
    expect(texto).not.toMatch(/"won"|"kills"|"deaths"|"assists"|"durationSeconds"|postgame/i);
    expect(corpo.context.match).toBeUndefined();
    expect(corpo.context.postgameReport).toBeUndefined();
    await app.close();
  });

  it("a listagem de revisões cegas não carrega resultado", async () => {
    listDraftReviewsMock.mockResolvedValue([revisaoCega]);
    const app = await buildReviewApp();

    const corpo = (await app.inject({ method: "GET", url: "/draft-sessions/sessao-1/reviews" })).json();

    expect(corpo.reviews[0].resultRevealedAt).toBeNull();
    expect(corpo.reviews[0].matchId).toBeNull();
    expect(JSON.stringify(corpo)).not.toMatch(/"won"|kda|postgame/i);
    await app.close();
  });

  it("revelar antes de submeter a fase cega é recusado", async () => {
    revealMatchResultMock.mockResolvedValue({ ok: false, reason: "INVALID_TRANSITION" });
    const app = await buildReviewApp();

    const resposta = await app.inject({ method: "POST", url: "/draft-reviews/rev-1/reveal-result" });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().code).toBe("INVALID_TRANSITION");
    await app.close();
  });

  it("revelar duas vezes é recusado", async () => {
    revealMatchResultMock.mockResolvedValue({ ok: false, reason: "ALREADY_REVEALED" });
    const app = await buildReviewApp();

    const resposta = await app.inject({ method: "POST", url: "/draft-reviews/rev-1/reveal-result" });

    expect(resposta.statusCode).toBe(409);
    await app.close();
  });

  it("a avaliação cega não aceita ser reescrita depois de submetida", async () => {
    submitPreMatchAssessmentMock.mockResolvedValue({ ok: false, reason: "INVALID_TRANSITION" });
    const app = await buildReviewApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/draft-reviews/rev-1/pre-match",
      payload: avaliacaoCega
    });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().code).toBe("INVALID_TRANSITION");
    await app.close();
  });

  it("avaliação pós-partida sem revelação é recusada", async () => {
    submitPostMatchAssessmentMock.mockResolvedValue({ ok: false, reason: "NOT_REVEALED" });
    const app = await buildReviewApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/draft-reviews/rev-1/post-match",
      payload: {
        observedCorrespondence: "ADEQUATE",
        explanationUsefulness: "ADEQUATE",
        informationGap: "WEAK",
        postMatchClarity: "STRONG"
      }
    });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().code).toBe("NOT_REVEALED");
    await app.close();
  });

  it("sessão sem partida vinculada permanece revisão só-pré-resultado, sem inventar desfecho", async () => {
    revealMatchResultMock.mockResolvedValue({
      ok: true,
      value: { review: { ...revisaoCega, status: "PRE_MATCH_REVIEWED", resultRevealedAt: "2026-07-30T10:00:00.000Z" }, match: null }
    });
    const app = await buildReviewApp();

    const corpo = (await app.inject({ method: "POST", url: "/draft-reviews/rev-1/reveal-result" })).json();

    expect(corpo.match).toBeNull();
    expect(corpo.matchUnavailableReason).toMatch(/nao tem partida vinculada/i);
    await app.close();
  });
});

describe("regras de avaliação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue({ id: "conta-1", puuid: "puuid-1" });
  });

  it("sessão sem snapshot recusa avaliação de ranking com motivo estável", async () => {
    submitPreMatchAssessmentMock.mockResolvedValue({ ok: false, reason: "RANKING_NOT_ASSESSABLE" });
    const app = await buildReviewApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/draft-reviews/rev-1/pre-match",
      payload: avaliacaoCega
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().code).toBe("RANKING_NOT_ASSESSABLE");
    await app.close();
  });

  it("nível fora da escala é recusado pelo schema", async () => {
    const app = await buildReviewApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/draft-reviews/rev-1/pre-match",
      payload: { ...avaliacaoCega, rankingCoherence: "EXCELENTE" }
    });

    expect(resposta.statusCode).toBeGreaterThanOrEqual(400);
    expect(submitPreMatchAssessmentMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("tag desconhecida é recusada pelo schema", async () => {
    const app = await buildReviewApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/draft-reviews/rev-1/pre-match",
      payload: { ...avaliacaoCega, issueTags: ["TAG_INVENTADA"] }
    });

    expect(resposta.statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });

  it("o dicionário do formulário publica escala, dimensões e tags com definição", async () => {
    const app = await buildReviewApp();

    const corpo = (await app.inject({ method: "GET", url: "/draft-reviews/form" })).json();

    expect(corpo.reviewRatings.STRONG).toBeTruthy();
    expect(corpo.preMatchDimensions.rankingCoherence).toBeTruthy();
    expect(corpo.postMatchDimensions.observedCorrespondence).toBeTruthy();
    expect(corpo.issueTags.RANKING_SURPRISE).toBeTruthy();
    await app.close();
  });
});

describe("resumo descritivo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue({ id: "conta-1", puuid: "puuid-1" });
  });

  it("devolve contagens com denominador e nenhuma nota geral", async () => {
    summarizeReviewsMock.mockResolvedValue({
      reviewsConsidered: 3,
      completed: { count: 2, total: 3 },
      blind: { count: 1, total: 3 },
      needsInvestigation: { count: 1, total: 3 },
      withInsufficientData: { count: 1, total: 3 },
      preMatchDistribution: [],
      postMatchDistribution: [],
      issueTagFrequencies: [],
      algorithmVersions: [],
      formVersions: [],
      summaryVersion: "draft-review/1.0.0"
    });
    const app = await buildReviewApp();

    const corpo = (await app.inject({ method: "GET", url: "/players/draft-review-summary" })).json();

    expect(corpo.summary.completed).toEqual({ count: 2, total: 3 });
    expect(JSON.stringify(corpo)).not.toMatch(/accuracy|winRate|overallScore|recommendedWeight/i);
    await app.close();
  });

  it("o resumo é sempre da conta autenticada", async () => {
    summarizeReviewsMock.mockResolvedValue({ reviewsConsidered: 0 });
    const app = await buildReviewApp();

    await app.inject({ method: "GET", url: "/players/draft-review-summary" });

    expect(summarizeReviewsMock).toHaveBeenCalledWith("conta-1");
    await app.close();
  });
});
