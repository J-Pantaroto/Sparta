import { describe, expect, it, vi } from "vitest";
import type { DraftState, PlayerChampionStats } from "@sparta/core";
import {
  ensureChampionStatsCoverage,
  fetchDraftRecommendations,
  fetchSession,
  fetchPersonalLoadoutEvidence,
  fetchRecommendationObservability,
  PlayerRoleUnavailableError,
  SESSION_EXPIRED_EVENT
} from "./api-client";

/**
 * Compatibilidade com uma API anterior a Etapa 4: desktop e API sao
 * implantados separadamente, entao a resposta pode nao trazer `coverage`.
 */
const legado = {
  championId: 234,
  championName: "Viego",
  role: "JUNGLE",
  games: 8,
  wins: 4,
  kills: 40,
  deaths: 30,
  assists: 60,
  csPerMinute: 5.5,
  goldPerMinute: 380,
  damagePerMinute: 540,
  visionScorePerMinute: 0.9,
  killParticipation: 0.47,
  objectiveParticipation: 0,
  recentMatches: []
} as unknown as PlayerChampionStats;

describe("sessao expirada", () => {
  it("emite o evento central sem expor o bearer", async () => {
    const dispatch = vi.fn();
    vi.stubGlobal("dispatchEvent", dispatch);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: "UNAUTHENTICATED", message: "Nao autenticado." }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    await expect(fetchSession("private-token")).rejects.toThrow();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ type: SESSION_EXPIRED_EVENT });
    expect(JSON.stringify(dispatch.mock.calls)).not.toContain("private-token");
    vi.unstubAllGlobals();
  });
});

describe("compatibilidade do contrato de recomendacoes (Etapa 12)", () => {
  const draft: DraftState = {
    playerRole: "MID",
    pickOrder: 1,
    allies: [],
    enemies: [],
    bannedChampionIds: []
  };
  const recommendation = {
    championId: 61,
    championName: "Orianna",
    role: "MID",
    totalScore: 70,
    confidence: "medium",
    dataCoverage: 0.8,
    category: "comfort_pick",
    reasons: [],
    warnings: [],
    metrics: {
      personalPerformance: 70,
      recentForm: 60,
      matchup: null,
      blindSafety: 50,
      allySynergy: 50,
      enemyDraftAnswer: 50,
      compositionFit: 50,
      meta: null
    }
  };

  it("aceita resposta antiga simples sem inventar alternativas ou origem do pool", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ recommendations: [recommendation] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    const result = await fetchDraftRecommendations("token", draft);

    expect(result.primaryRecommendations).toHaveLength(1);
    expect(result.alternatives).toEqual([]);
    expect(result.primaryRecommendations[0]).not.toHaveProperty("poolSource");
    expect(result.poolSummary.shortageReason).toMatch(/API/i);
    expect(result.primaryRecommendations[0].metricDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "CHAMPION_DIFFICULTY",
          value: null,
          status: "UNAVAILABLE"
        }),
        expect.objectContaining({
          key: "EXECUTION_RISK",
          value: null,
          status: "UNAVAILABLE"
        })
      ])
    );
    vi.unstubAllGlobals();
  });

  it("preserva principais, alternativas e resumo do contrato novo", async () => {
    const ranked = {
      ...recommendation,
      rank: 1,
      poolSource: "PERSONAL_OBSERVED",
      poolProvenance: {
        sourceType: "OBSERVED",
        sourceId: "riot-match-v5",
        status: "AVAILABLE"
      },
      personalGames: 8,
      limitations: []
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            primaryRecommendations: [ranked],
            alternatives: [{ ...ranked, championId: 103, championName: "Ahri", rank: 6 }],
            poolSummary: {
              totalCandidates: 6,
              evaluatedCandidates: 6,
              primaryCount: 5,
              alternativeCount: 1,
              status: "AVAILABLE"
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      )
    );

    const result = await fetchDraftRecommendations("token", draft);

    expect(result.primaryRecommendations[0].poolSource).toBe("PERSONAL_OBSERVED");
    expect(result.alternatives).toHaveLength(1);
    expect(result.poolSummary).toMatchObject({
      totalCandidates: 6,
      alternativeCount: 1
    });
    vi.unstubAllGlobals();
  });
});

describe("ensureChampionStatsCoverage", () => {
  it("converte o zero de participação em objetivos, que é provadamente artificial", () => {
    // O mapper do Match-V5 nunca preencheu esse campo: medido no banco real,
    // 0 de 220 participantes tinham o dado.
    const normalizado = ensureChampionStatsCoverage(legado);
    expect(normalizado.objectiveParticipation).toBeNull();
    expect(normalizado.coverage.objectiveParticipation.status).toBe("UNAVAILABLE");
    expect(normalizado.coverage.objectiveParticipation.reason).toBeDefined();
  });

  it("NÃO mexe num killParticipation zero: ali o zero pode ser real", () => {
    const normalizado = ensureChampionStatsCoverage({ ...legado, killParticipation: 0 });
    expect(normalizado.killParticipation).toBe(0);
    expect(normalizado.coverage.killParticipation.status).not.toBe("UNAVAILABLE");
  });

  it("não inventa cobertura: amostra disponível fica desconhecida, não zero", () => {
    const normalizado = ensureChampionStatsCoverage(legado);
    expect(normalizado.coverage.killParticipation.availableSampleSize).toBeNull();
    expect(normalizado.coverage.killParticipation.sampleSize).toBe(8);
  });

  it("marca killParticipation ausente como indisponível, sem virar zero", () => {
    const normalizado = ensureChampionStatsCoverage({ ...legado, killParticipation: null });
    expect(normalizado.killParticipation).toBeNull();
    expect(normalizado.coverage.killParticipation.status).toBe("UNAVAILABLE");
  });

  it("deixa passar intacta uma resposta que já traz cobertura", () => {
    const novo = {
      ...legado,
      objectiveParticipation: 0.42,
      coverage: {
        killParticipation: { sampleSize: 8, availableSampleSize: 8, status: "AVAILABLE" as const },
        objectiveParticipation: {
          sampleSize: 8,
          availableSampleSize: 8,
          status: "AVAILABLE" as const
        }
      }
    } as PlayerChampionStats;
    expect(ensureChampionStatsCoverage(novo)).toBe(novo);
    expect(ensureChampionStatsCoverage(novo).objectiveParticipation).toBe(0.42);
  });
});

describe("guarda de posição no cliente da API (Etapa 6)", () => {
  const draftSemPosicao = {
    pickOrder: 1,
    allies: [],
    enemies: [],
    bannedChampionIds: []
  } as DraftState;

  it("não envia a requisição sem posição", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(fetchDraftRecommendations("token", draftSemPosicao)).rejects.toBeInstanceOf(
      PlayerRoleUnavailableError
    );
    // A protecao vale mesmo contra uma API anterior a esta etapa, que
    // aceitaria o request e usaria MID internamente.
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("o erro carrega o código estável, não é falha técnica", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const erro = await fetchDraftRecommendations("token", draftSemPosicao).catch((e: unknown) => e);
    expect((erro as PlayerRoleUnavailableError).code).toBe("PLAYER_ROLE_UNAVAILABLE");
    vi.unstubAllGlobals();
  });
});

describe("compatibilidade do histórico pessoal agregado (Etapa 17)", () => {
  it("API anterior sem a rota vira indisponibilidade estruturada, nunca configuração padrão", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 404,
            error: "Not Found",
            message: "Route GET not found"
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" }
          }
        )
      )
    );

    const result = await fetchPersonalLoadoutEvidence("token", "puuid-1", 61, "MID", {
      patch: "16.14.1"
    });

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.finalInventories).toEqual([]);
    expect(result.runePages).toEqual([]);
    expect(result.summonerSpellSets).toEqual([]);
    expect(result.unavailableReason).toMatch(/versão da API/i);
    vi.unstubAllGlobals();
  });
});

describe("observabilidade longitudinal (Etapa 23)", () => {
  it("envia somente filtros, nunca agregados prontos", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "UNAVAILABLE", sampleSize: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    await fetchRecommendationObservability("token", "puuid-1", {
      roles: ["JUNGLE"],
      patches: ["26.14"],
      selectionGroups: ["PRIMARY"]
    });

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/players/puuid-1/recommendation-observability?");
    expect(url).toContain("role=JUNGLE");
    expect(url).toContain("patch=26.14");
    expect(url).toContain("group=PRIMARY");
    expect(url).not.toMatch(/wins|scoreBands|sampleSize/);
    vi.unstubAllGlobals();
  });
});
