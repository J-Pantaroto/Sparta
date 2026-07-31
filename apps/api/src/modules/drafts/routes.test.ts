import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedUserIdMock,
  riotAccountFindFirstMock,
  findChampionStatsByPuuidMock,
  findPlayerInsightsByPuuidMock,
  findAllChampionTagsMock,
  findChampionNamesByIdsMock,
  findPersonalLaneMatchupHistoryMock,
  findPlayerPoolMock,
  upsertActiveDraftSessionMock,
  persistRecommendationSnapshotMock,
  findActiveDraftSessionMock,
  findDraftSessionMock,
  listDraftSessionsMock,
  listSnapshotsMock,
  findLatestSnapshotMock,
  transitionDraftSessionMock,
  describeSelectedChampionMock,
  listDraftMatchLinkRevisionsMock,
  observeExternalGameIdMock,
  reconcileDraftSessionsForAccountMock
} = vi.hoisted(() => ({
  getAuthenticatedUserIdMock: vi.fn(),
  riotAccountFindFirstMock: vi.fn(),
  findChampionStatsByPuuidMock: vi.fn(),
  findPlayerInsightsByPuuidMock: vi.fn(),
  findAllChampionTagsMock: vi.fn(),
  findChampionNamesByIdsMock: vi.fn(),
  findPersonalLaneMatchupHistoryMock: vi.fn(),
  findPlayerPoolMock: vi.fn(),
  upsertActiveDraftSessionMock: vi.fn(),
  persistRecommendationSnapshotMock: vi.fn(),
  findActiveDraftSessionMock: vi.fn(),
  findDraftSessionMock: vi.fn(),
  listDraftSessionsMock: vi.fn(),
  listSnapshotsMock: vi.fn(),
  findLatestSnapshotMock: vi.fn(),
  transitionDraftSessionMock: vi.fn(),
  describeSelectedChampionMock: vi.fn(),
  listDraftMatchLinkRevisionsMock: vi.fn(),
  observeExternalGameIdMock: vi.fn(),
  reconcileDraftSessionsForAccountMock: vi.fn()
}));

vi.mock("./draft-session-repository.js", () => ({
  upsertActiveDraftSession: upsertActiveDraftSessionMock,
  persistRecommendationSnapshot: persistRecommendationSnapshotMock,
  findActiveDraftSession: findActiveDraftSessionMock,
  findDraftSession: findDraftSessionMock,
  listDraftSessions: listDraftSessionsMock,
  listSnapshots: listSnapshotsMock,
  findLatestSnapshot: findLatestSnapshotMock,
  transitionDraftSession: transitionDraftSessionMock,
  describeSelectedChampion: describeSelectedChampionMock,
  listDraftMatchLinkRevisions: listDraftMatchLinkRevisionsMock,
  observeExternalGameId: observeExternalGameIdMock
}));

vi.mock("./draft-match-reconciler.js", () => ({
  reconcileDraftSessionsForAccount: reconcileDraftSessionsForAccountMock
}));

vi.mock("../auth/routes.js", () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
  authRoutes: async () => {}
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: { riotAccount: { findFirst: riotAccountFindFirstMock } }
}));

vi.mock("../catalog/champion-repository.js", () => ({
  findAllChampionTags: findAllChampionTagsMock,
  findChampionNamesByIds: findChampionNamesByIdsMock
}));

vi.mock("../matches/matchup-repository.js", () => ({
  findPersonalLaneMatchupHistory: findPersonalLaneMatchupHistoryMock
}));

vi.mock("../players/player-stats-repository.js", () => ({
  findChampionStatsByPuuid: findChampionStatsByPuuidMock,
  findPlayerInsightsByPuuid: findPlayerInsightsByPuuidMock,
  deriveObservedRoles: (stats: { role: string }[]) =>
    Array.from(new Set(stats.map((entry) => entry.role)))
}));

vi.mock("../players/player-pool-repository.js", () => ({
  findPlayerPool: findPlayerPoolMock
}));

import { buildApp } from "../../app.js";

const draftPayload = {
  draft: { playerRole: "MID", pickOrder: 1, allies: [], enemies: [], bannedChampionIds: [] }
};

describe("drafts routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllChampionTagsMock.mockResolvedValue([]);
    findChampionNamesByIdsMock.mockResolvedValue(new Map([[61, "Orianna"]]));
    findPersonalLaneMatchupHistoryMock.mockResolvedValue([]);
    findPlayerPoolMock.mockResolvedValue({ entries: [], roleSummaries: [] });
  });

  describe("posição ausente (Etapa 6)", () => {
    const semPosicao = { draft: { pickOrder: 1, allies: [], enemies: [], bannedChampionIds: [] } };

    it("responde 422 com código estável em vez de assumir MID", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/drafts/recommendations",
        payload: semPosicao
      });
      const body = response.json();

      expect(response.statusCode).toBe(422);
      expect(body.code).toBe("PLAYER_ROLE_UNAVAILABLE");
      expect(body.message).toMatch(/posição/i);
      // Nao pode vazar detalhe interno.
      expect(body.stack).toBeUndefined();
      await app.close();
    });

    it("não consulta estatísticas nem monta pool sem posição", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      const app = await buildApp();

      await app.inject({ method: "POST", url: "/drafts/recommendations", payload: semPosicao });

      expect(riotAccountFindFirstMock).not.toHaveBeenCalled();
      expect(findChampionStatsByPuuidMock).not.toHaveBeenCalled();
      expect(findPersonalLaneMatchupHistoryMock).not.toHaveBeenCalled();
      await app.close();
    });

    it("exige autenticação antes de avaliar a posição", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/drafts/recommendations",
        payload: semPosicao
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("aceita aliado/inimigo sem posição atribuída", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/drafts/recommendations",
        payload: {
          draft: {
            playerRole: "JUNGLE",
            pickOrder: 1,
            allies: [{ championId: 103, championName: "Ahri", team: "ally" }],
            enemies: [],
            bannedChampionIds: []
          }
        }
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });
  });

  it("retorna 401 sem autenticacao", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: draftPayload
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("responde honesto-neutro (sem recomendacoes fabricadas) quando o usuario nao tem conta Riot vinculada", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: draftPayload
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.recommendations).toEqual([]);
    expect(findChampionStatsByPuuidMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("usa dado real (championStats/championTags/matchups) da conta Riot do usuario autenticado", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue({
      id: "account-1",
      puuid: "puuid-1",
      gameName: "Zekerus",
      tagLine: "117",
      platformRegion: "br1",
      regionalRouting: "americas"
    });
    findChampionStatsByPuuidMock.mockResolvedValue([
      {
        championId: 61,
        championName: "Orianna",
        role: "MID",
        games: 10,
        wins: 6,
        kills: 50,
        deaths: 20,
        assists: 70,
        csPerMinute: 7.8,
        goldPerMinute: 420,
        damagePerMinute: 760,
        visionScorePerMinute: 0.9,
        killParticipation: 0.62,
        objectiveParticipation: 0.4,
        recentMatches: []
      }
    ]);
    findPlayerInsightsByPuuidMock.mockResolvedValue({
      strengths: [],
      weaknesses: [],
      recentForm: {
        last10Score: 60,
        last20Score: 58,
        last50Score: 55,
        trend: "stable",
        confidence: "medium"
      }
    });
    findPlayerPoolMock.mockResolvedValue({
      entries: [
        {
          playerId: "puuid-1",
          championId: 61,
          championName: "Orianna",
          role: "MID",
          source: "PERSONAL_OBSERVED",
          enabled: true
        }
      ],
      roleSummaries: []
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: draftPayload
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(findPersonalLaneMatchupHistoryMock).toHaveBeenCalledWith("puuid-1", "MID");
    expect(findPlayerPoolMock).toHaveBeenCalledWith("account-1", "puuid-1", "MID");
    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(body.recommendations[0].championName).toBe("Orianna");
    expect(body.recommendations[0].strategicAnalysis).toBeTruthy();
    expect(
      body.recommendations[0].metricDetails.find(
        (metric: { key: string }) => metric.key === "TEAM_COMPOSITION"
      )?.value
    ).toBe(body.recommendations[0].strategicAnalysis.teamCompositionScore.value);
    expect(body.primaryRecommendations).toEqual(body.recommendations);
    expect(body.alternatives).toEqual([]);
    expect(body.poolSummary.primaryCount).toBe(1);
    await app.close();
  });

  describe("POST /drafts/pre-game-analysis (Etapa 7)", () => {
    const preGamePayload = {
      draft: {
        playerRole: "MID",
        pickOrder: 3,
        allies: [],
        enemies: [],
        bannedChampionIds: [],
        selectedChampionId: 61
      }
    };

    it("exige autenticação", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/drafts/pre-game-analysis",
        payload: preGamePayload
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("responde 422 PLAYER_ROLE_UNAVAILABLE sem consultar o catálogo", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/drafts/pre-game-analysis",
        payload: { draft: { ...preGamePayload.draft, playerRole: undefined } }
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe("PLAYER_ROLE_UNAVAILABLE");
      expect(findChampionNamesByIdsMock).not.toHaveBeenCalled();
      expect(findAllChampionTagsMock).not.toHaveBeenCalled();
      await app.close();
    });

    it("responde 422 SELECTED_CHAMPION_UNAVAILABLE sem campeão confirmado", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/drafts/pre-game-analysis",
        payload: { draft: { ...preGamePayload.draft, selectedChampionId: undefined } }
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe("SELECTED_CHAMPION_UNAVAILABLE");
      expect(findChampionNamesByIdsMock).not.toHaveBeenCalled();
      await app.close();
    });

    it("responde 422 quando o campeão confirmado não existe no catálogo real", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      findChampionNamesByIdsMock.mockResolvedValue(new Map());
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/drafts/pre-game-analysis",
        payload: preGamePayload
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe("SELECTED_CHAMPION_UNAVAILABLE");
      await app.close();
    });

    it("devolve o contrato estruturado do motor de domínio, sem as frases estáticas antigas", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/drafts/pre-game-analysis",
        payload: preGamePayload
      });
      const body = response.json();

      expect(response.statusCode).toBe(200);
      expect(body.algorithmVersion).toBeTruthy();
      expect(body.summary).toBeTruthy();
      expect(body.strategicAnalysis).toBeTruthy();
      expect(body.strategicAnalysis.algorithmVersion).toMatch(/draft-strategy/);
      expect(body.selectedChampion).toEqual({
        championId: 61,
        championName: "Orianna",
        role: "MID"
      });
      expect(body.winCondition).toBeUndefined();
      expect(body.allyStrengths).toBeUndefined();
      expect(JSON.stringify(body)).not.toMatch(/prioridade de rota|spikes de nível 6/i);
      await app.close();
    });

    it("não consulta matchup pessoal quando o adversário direto não foi revelado", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      const app = await buildApp();

      await app.inject({
        method: "POST",
        url: "/drafts/pre-game-analysis",
        payload: preGamePayload
      });

      expect(findPersonalLaneMatchupHistoryMock).not.toHaveBeenCalled();
      await app.close();
    });

    it("consulta o matchup pessoal do próprio jogador quando há adversário direto", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue({
        puuid: "puuid-1",
        gameName: "Zekerus",
        tagLine: "117",
        platformRegion: "br1",
        regionalRouting: "americas"
      });
      findChampionNamesByIdsMock.mockResolvedValue(
        new Map([
          [61, "Orianna"],
          [64, "Lee Sin"]
        ])
      );
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/drafts/pre-game-analysis",
        payload: {
          draft: {
            ...preGamePayload.draft,
            enemies: [{ championId: 64, championName: "Lee Sin", team: "enemy" }],
            enemyLaneChampionId: 64
          }
        }
      });

      expect(response.statusCode).toBe(200);
      expect(findPersonalLaneMatchupHistoryMock).toHaveBeenCalledWith("puuid-1", "MID");
      expect(response.json().laneContext.status).not.toBe("UNAVAILABLE");
      await app.close();
    });

    it("gera análise parcial (não erro) com draft incompleto", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/drafts/pre-game-analysis",
        payload: preGamePayload
      });
      const body = response.json();

      expect(response.statusCode).toBe(200);
      expect(body.status).toBe("PARTIAL");
      expect(body.dataCoverage).toBeGreaterThan(0);
      await app.close();
    });
  });
});

describe("persistência de draft (Etapa 16)", () => {
  const sessaoAtiva = {
    id: "sessao-1",
    riotAccountId: "conta-1",
    source: "LCU",
    status: "ACTIVE",
    role: "JUNGLE",
    roleSource: "LCU",
    queueId: null,
    gameVersion: null,
    patch: null,
    selectedChampionId: null,
    knownDraft: {
      allies: [],
      enemies: [],
      bannedChampionIds: [],
      banSideKnown: false,
      unknownAllyPicks: 5,
      unknownEnemyPicks: 5
    },
    startedAt: "2026-07-28T10:00:00.000Z",
    updatedAt: "2026-07-28T10:00:00.000Z",
    lockedInAt: null,
    completedAt: null,
    externalSessionId: "chave-tecnica-1234",
    linkedMatchId: null
  };

  const draftBase = {
    playerRole: "JUNGLE",
    pickOrder: 1,
    allies: [],
    enemies: [],
    bannedChampionIds: []
  };
  const comSessao = {
    draft: draftBase,
    session: { sessionKey: "chave-tecnica-1234", source: "LCU" }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    findAllChampionTagsMock.mockResolvedValue([]);
    findPersonalLaneMatchupHistoryMock.mockResolvedValue([]);
    findPlayerPoolMock.mockResolvedValue({ entries: [], roleSummaries: [] });
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue({
      id: "conta-1",
      puuid: "puuid-1",
      gameName: "Zekerus",
      tagLine: "117",
      platformRegion: "br1",
      regionalRouting: "americas"
    });
    upsertActiveDraftSessionMock.mockResolvedValue(sessaoAtiva);
    persistRecommendationSnapshotMock.mockResolvedValue({
      status: "CREATED",
      snapshotId: "snap-1"
    });
  });

  it("sem identificação de sessão, nada é gravado e a análise sai normal", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: { draft: draftBase }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().persistence).toEqual({ status: "NOT_TRACKED" });
    expect(upsertActiveDraftSessionMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("com sessão identificada, grava e informa o snapshot", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: comSessao
    });
    const body = response.json();

    expect(body.persistence).toEqual({
      status: "SAVED",
      sessionId: "sessao-1",
      snapshotId: "snap-1",
      historyPreserved: true
    });
    expect(upsertActiveDraftSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        externalSessionId: "chave-tecnica-1234",
        source: "LCU",
        role: "JUNGLE"
      })
    );
    await app.close();
  });

  it("input inalterado não grava de novo", async () => {
    persistRecommendationSnapshotMock.mockResolvedValue({
      status: "UNCHANGED",
      snapshotId: "snap-1"
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: comSessao
    });

    expect(response.json().persistence.status).toBe("UNCHANGED");
    await app.close();
  });

  it("falha de persistência NÃO derruba a recomendação", async () => {
    persistRecommendationSnapshotMock.mockResolvedValue({ status: "FAILED" });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: comSessao
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.persistence.status).toBe("FAILED");
    expect(body.poolSummary).toBeTruthy();
    expect(Array.isArray(body.primaryRecommendations)).toBe(true);
    await app.close();
  });

  it("exceção na gravação também não derruba, e não vaza detalhe interno", async () => {
    upsertActiveDraftSessionMock.mockRejectedValue(
      new Error("connection refused em 10.0.0.5:5432")
    );
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: comSessao
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.persistence.status).toBe("FAILED");
    // A falha e declarada, nao escondida - e sem detalhe interno.
    expect(body.persistence.historyPreserved).toBe(false);
    expect(body.persistence.reason).toBe(
      "A preservação histórica falhou; a análise ao vivo não foi afetada."
    );
    expect(JSON.stringify(body)).not.toMatch(/connection refused/i);
    expect(JSON.stringify(body)).not.toMatch(/5432/);
    await app.close();
  });

  it("sessão manual é gravada como USER, nunca como LCU", async () => {
    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: {
        draft: { ...draftBase, playerRoleSource: "USER" },
        session: { sessionKey: "chave-manual-99", source: "USER" }
      }
    });

    expect(upsertActiveDraftSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "USER", roleSource: "USER" })
    );
    await app.close();
  });

  it("usuário sem conta Riot vinculada não grava sessão", async () => {
    riotAccountFindFirstMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/recommendations",
      payload: comSessao
    });

    expect(response.json().persistence.status).toBe("NOT_TRACKED");
    expect(upsertActiveDraftSessionMock).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("consultas de sessão (Etapa 16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue({ id: "conta-1", puuid: "puuid-1" });
    findActiveDraftSessionMock.mockResolvedValue(null);
    findDraftSessionMock.mockResolvedValue(null);
    listDraftSessionsMock.mockResolvedValue([]);
    listSnapshotsMock.mockResolvedValue(null);
    findLatestSnapshotMock.mockResolvedValue(null);
    describeSelectedChampionMock.mockResolvedValue(null);
    listDraftMatchLinkRevisionsMock.mockResolvedValue([]);
  });

  it("exige autenticação", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue(null);
    const app = await buildApp();

    for (const url of ["/drafts/sessions", "/drafts/sessions/active", "/drafts/sessions/x"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(401);
    }
    await app.close();
  });

  it("a consulta é sempre filtrada pela conta do próprio jogador", async () => {
    const app = await buildApp();

    await app.inject({ method: "GET", url: "/drafts/sessions/sessao-de-outro" });

    expect(findDraftSessionMock).toHaveBeenCalledWith("conta-1", "sessao-de-outro");
    await app.close();
  });

  it("sessão de outro jogador responde 404, não o conteúdo dela", async () => {
    findDraftSessionMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/drafts/sessions/sessao-de-outro" });

    expect(response.statusCode).toBe(404);
    expect(response.json().session).toBeUndefined();
    await app.close();
  });

  it("sessão sem vínculo é apresentada como não vinculada, com motivo", async () => {
    findDraftSessionMock.mockResolvedValue({
      id: "sessao-1",
      riotAccountId: "conta-1",
      status: "LOCKED_IN",
      linkedMatchId: null,
      selectedChampionId: 234
    });
    const app = await buildApp();

    const body = (await app.inject({ method: "GET", url: "/drafts/sessions/sessao-1" })).json();

    expect(body.matchLink.status).toBe("PENDING");
    expect(body.matchLink.reason).toBeTruthy();
    expect(body.matchLink.matchId).toBeNull();
    await app.close();
  });

  it("concluir sem identificador de partida é recusado", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/sessions/sessao-1/status",
      payload: { status: "COMPLETED" }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("MATCH_LINK_SERVER_MANAGED");
    expect(transitionDraftSessionMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("não aceita matchId arbitrário do desktop nem para concluir a sessão", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/sessions/sessao-1/status",
      payload: { status: "COMPLETED", matchId: "BR1_999999" }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("MATCH_LINK_SERVER_MANAGED");
    expect(transitionDraftSessionMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("registra somente o gameId numérico observado, sem receber matchId", async () => {
    observeExternalGameIdMock.mockResolvedValue({
      ok: true,
      session: { id: "sessao-1", externalGameId: "123456" }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/sessions/sessao-1/observed-game",
      payload: { gameId: "123456", matchId: "BR1_123456" }
    });

    expect(response.statusCode).toBe(200);
    expect(observeExternalGameIdMock).toHaveBeenCalledWith({
      riotAccountId: "conta-1",
      sessionRef: "sessao-1",
      gameId: "123456"
    });
    await app.close();
  });

  it("reprocessa apenas a conta autenticada e devolve o relatório do backfill", async () => {
    reconcileDraftSessionsForAccountMock.mockResolvedValue({
      processed: 3,
      linked: 1,
      ambiguous: 1,
      pending: 1,
      unlinkable: 0,
      notApplicable: 0,
      unchanged: 0,
      failed: 0
    });
    const app = await buildApp();

    const response = await app.inject({ method: "POST", url: "/drafts/sessions/reconcile" });

    expect(response.statusCode).toBe(200);
    expect(response.json().report).toMatchObject({ linked: 1, ambiguous: 1, pending: 1 });
    expect(reconcileDraftSessionsForAccountMock).toHaveBeenCalledWith("conta-1");
    await app.close();
  });

  it("transição inválida responde 409 sem alterar a sessão", async () => {
    transitionDraftSessionMock.mockResolvedValue({
      ok: false,
      reason: "INVALID_TRANSITION",
      currentStatus: "ABANDONED"
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/drafts/sessions/sessao-1/lock-in",
      payload: { championId: 234 }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("INVALID_TRANSITION");
    await app.close();
  });
});
