import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftState, PatchRelease, PickRecommendation } from "@sparta/core";
import { ChampionSelectScreen } from "./ChampionSelectScreen";

const apiMocks = vi.hoisted(() => ({
  fetchPlayerPool: vi.fn(),
  addPlayerPoolEntry: vi.fn(),
  disablePlayerPoolEntry: vi.fn(),
  fetchPatchRelease: vi.fn()
}));

vi.mock("../services/api-client", () => ({
  fetchPlayerProfile: () => new Promise(() => {}),
  fetchPlayerPool: apiMocks.fetchPlayerPool,
  addPlayerPoolEntry: apiMocks.addPlayerPoolEntry,
  disablePlayerPoolEntry: apiMocks.disablePlayerPoolEntry,
  fetchPatchRelease: apiMocks.fetchPatchRelease
}));
vi.mock("../services/datadragon", () => ({
  fetchAllChampions: () => Promise.resolve([]),
  fetchChampionClassProfiles: () => Promise.resolve([]),
  fetchItemCatalog: () => Promise.resolve([]),
  itemIconUrl: () => "",
  championSquareUrl: () => ""
}));
vi.mock("../theme/ThemedPageHero", () => ({
  ThemedPageHero: ({ title }: { title: string }) => <h1>{title}</h1>
}));

const recomendacaoMid = {
  championId: 61,
  championName: "Orianna",
  totalScore: 70,
  confidence: "medium",
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
  },
  metricDetails: [],
  dataCoverage: 1
} as unknown as PickRecommendation;

const releaseSemMudancas: PatchRelease = {
  patch: "26.14",
  title: "Notas da Atualização 26.14",
  locale: "pt_BR",
  publishedAt: "2026-07-14T18:00:00.000Z",
  collectedAt: "2026-07-28T18:00:00.000Z",
  sourceUrl:
    "https://www.leagueoflegends.com/pt-br/news/game-updates/league-of-legends-patch-26-14-notes/",
  sourceHash: "hash",
  parserVersion: "parser/1",
  revision: 1,
  status: "AVAILABLE",
  changes: [],
  provenance: { sourceType: "OFFICIAL", status: "AVAILABLE" }
};

beforeEach(() => {
  apiMocks.fetchPatchRelease.mockResolvedValue(releaseSemMudancas);
});

function renderScreen(draft: Partial<DraftState>, recommendations: PickRecommendation[] = []) {
  const setDraft = vi.fn();
  render(
    <ChampionSelectScreen
      draft={{ pickOrder: 1, allies: [], enemies: [], bannedChampionIds: [], ...draft }}
      setDraft={setDraft}
      autoPickOrder={null}
      autoPlayerRole={null}
      champSelectActive
      recommendations={recommendations}
      recommendationsStatus="idle"
      noAccountLinked={false}
      ddragonVersion="14.1.1"
      riotAccounts={[]}
      draftAutoFilled={false}
    />
  );
  return { setDraft };
}

describe("Champion Select sem posição identificada (Etapa 6)", () => {
  it("mostra o estado de espera em vez de recomendações", () => {
    renderScreen({});
    expect(screen.getByText("Posição ainda não identificada")).toBeDefined();
    expect(screen.getByText(/Aguardando o League Client informar sua função/)).toBeDefined();
  });

  it("não exibe recomendações antigas quando a posição some", () => {
    // Mesmo com recomendacoes em maos, sem posicao nada e apresentado como
    // atual - senao os cards da posicao anterior ficariam na tela.
    renderScreen({}, [recomendacaoMid]);
    expect(screen.queryByText("Orianna")).toBeNull();
    expect(screen.getByText("Posição ainda não identificada")).toBeDefined();
  });

  it("não deixa nenhuma posição pré-selecionada", () => {
    renderScreen({});
    const select = screen.getByLabelText("Posição") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.value).not.toBe("MID");
  });

  it("seleção manual marca a origem como USER, nunca LCU", () => {
    const { setDraft } = renderScreen({});
    fireEvent.change(screen.getByLabelText("Posição"), { target: { value: "JUNGLE" } });

    expect(setDraft).toHaveBeenCalledTimes(1);
    const atualizar = setDraft.mock.calls[0][0] as (current: DraftState) => DraftState;
    const proximo = atualizar({ pickOrder: 1, allies: [], enemies: [], bannedChampionIds: [] });
    expect(proximo.playerRole).toBe("JUNGLE");
    expect(proximo.playerRoleSource).toBe("USER");
  });

  it("voltar para 'Selecione...' limpa posição e origem", () => {
    const { setDraft } = renderScreen({ playerRole: "ADC", playerRoleSource: "USER" });
    fireEvent.change(screen.getByLabelText("Posição"), { target: { value: "" } });

    const atualizar = setDraft.mock.calls[0][0] as (current: DraftState) => DraftState;
    const proximo = atualizar({
      playerRole: "ADC",
      pickOrder: 1,
      allies: [],
      enemies: [],
      bannedChampionIds: []
    });
    expect(proximo.playerRole).toBeUndefined();
    expect(proximo.playerRoleSource).toBeUndefined();
  });

  it("com posição válida o estado de espera some e as recomendações aparecem", () => {
    renderScreen({ playerRole: "MID", playerRoleSource: "USER" }, [recomendacaoMid]);
    expect(screen.queryByText("Posição ainda não identificada")).toBeNull();
    expect(screen.getAllByText("Orianna").length).toBeGreaterThan(0);
  });

  it("nunca renderiza NaN, Infinity ou undefined", () => {
    const { container } = render(
      <ChampionSelectScreen
        draft={{ pickOrder: 1, allies: [], enemies: [], bannedChampionIds: [] }}
        setDraft={vi.fn()}
        autoPickOrder={null}
        autoPlayerRole={null}
        champSelectActive
        recommendations={[]}
        recommendationsStatus="idle"
        noAccountLinked={false}
        ddragonVersion="14.1.1"
        riotAccounts={[]}
        draftAutoFilled={false}
      />
    );
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe("análise estratégica 5×5 (Etapa 15)", () => {
  it("mostra resumo no card e evidência/cobertura no detalhe", () => {
    const strategic = {
      ...recomendacaoMid,
      strategicAnalysis: {
        status: "PARTIAL",
        coverage: 0.42,
        alliedProfile: {
          knownChampions: [
            { championId: 61, championName: "Orianna" },
            { championId: 54, championName: "Malphite" }
          ]
        },
        enemyProfile: {
          knownChampions: [{ championId: 64, championName: "Lee Sin" }]
        },
        candidateContribution: {
          addedCapabilities: ["PEEL"],
          filledKnownGaps: [],
          reinforcedCapabilities: [],
          remainingKnownGaps: ["FRONTLINE"],
          newlyEnabledResponses: []
        },
        strengths: [
          {
            key: "added_PEEL",
            dimension: "PEEL",
            description: "Orianna adiciona evidência de peel.",
            status: "PARTIAL",
            evidence: [],
            unavailableReason: undefined
          }
        ],
        gaps: [],
        risks: [],
        unavailableSignals: []
      }
    } as unknown as PickRecommendation;

    renderScreen({ playerRole: "MID", playerRoleSource: "USER" }, [strategic]);

    expect(screen.getAllByText("Adiciona peel").length).toBeGreaterThan(0);
    expect(screen.getByText("Análise estratégica 5×5")).toBeDefined();
    expect(screen.getByText(/3 de 10 campeões conhecidos/)).toBeDefined();
    expect(screen.getByText(/Aliados considerados: Orianna, Malphite/)).toBeDefined();
    expect(screen.getByText(/Inimigos considerados: Lee Sin/)).toBeDefined();
  });
});

describe("pool pessoal na selecao de campeoes (Etapa 12)", () => {
  it("separa principais de alternativas e mostra origem/amostra sem inventar dados", () => {
    const alternativa = {
      ...recomendacaoMid,
      championId: 103,
      championName: "Ahri",
      poolSource: "USER_PROVIDED",
      personalGames: 0,
      rank: 6,
      limitations: ["Sem historico pessoal observado."]
    } as unknown as PickRecommendation;

    render(
      <ChampionSelectScreen
        draft={{
          playerRole: "MID",
          pickOrder: 1,
          allies: [],
          enemies: [],
          bannedChampionIds: []
        }}
        setDraft={vi.fn()}
        autoPickOrder={null}
        autoPlayerRole={null}
        champSelectActive
        recommendations={[recomendacaoMid]}
        alternatives={[alternativa]}
        poolSummary={{
          totalCandidates: 2,
          evaluatedCandidates: 2,
          primaryCount: 2,
          alternativeCount: 0,
          status: "PARTIAL",
          shortageReason: "Adicione pelo menos mais 3."
        }}
        recommendationsStatus="idle"
        noAccountLinked={false}
        ddragonVersion="14.1.1"
        riotAccounts={[]}
        draftAutoFilled={false}
      />
    );

    expect(screen.getByText("Alternativas")).toBeDefined();
    expect(screen.getAllByText("Ahri").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Adicionado por voc/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sem hist/).length).toBeGreaterThan(0);
    expect(screen.getByText("Adicione pelo menos mais 3.")).toBeDefined();
  });

  it("distingue entradas observadas e manuais e oferece desabilitar somente a manual", async () => {
    apiMocks.fetchPlayerPool.mockResolvedValue({
      entries: [
        {
          playerId: "puuid-1",
          championId: 61,
          championName: "Orianna",
          role: "MID",
          source: "PERSONAL_OBSERVED",
          enabled: true,
          createdAt: "2026-07-27T23:00:00.000Z",
          updatedAt: "2026-07-27T23:00:00.000Z",
          provenance: {
            sourceType: "OBSERVED",
            sourceId: "riot-match-v5",
            status: "AVAILABLE"
          }
        },
        {
          playerId: "puuid-1",
          championId: 103,
          championName: "Ahri",
          role: "MID",
          source: "USER_PROVIDED",
          enabled: true,
          createdAt: "2026-07-27T23:00:00.000Z",
          updatedAt: "2026-07-27T23:00:00.000Z",
          provenance: {
            sourceType: "USER_PROVIDED",
            sourceId: "sparta-user-pool",
            status: "AVAILABLE"
          }
        }
      ],
      roleSummaries: [
        {
          role: "MID",
          enabledCandidates: 2,
          observedCandidates: 1,
          userProvidedCandidates: 1
        }
      ]
    });

    render(
      <ChampionSelectScreen
        draft={{
          playerRole: "MID",
          pickOrder: 1,
          allies: [],
          enemies: [],
          bannedChampionIds: []
        }}
        setDraft={vi.fn()}
        autoPickOrder={null}
        autoPlayerRole={null}
        champSelectActive
        recommendations={[]}
        recommendationsStatus="idle"
        noAccountLinked={false}
        ddragonVersion="14.1.1"
        riotAccounts={[]}
        sessionToken="token"
        draftAutoFilled={false}
      />
    );

    expect(await screen.findByText("Observado")).toBeDefined();
    expect(screen.getByText(/Adicionado por voc/)).toBeDefined();
    expect(screen.queryByLabelText("Desabilitar Orianna do pool")).toBeNull();
    expect(screen.getByLabelText("Desabilitar Ahri do pool")).toBeDefined();
    expect(
      screen.getByText(
        (_, element) =>
          element?.classList.contains("sp-badge") === true && element.textContent === "Mid: 2"
      )
    ).toBeDefined();
  });
});

describe("dificuldade e risco na Champion Select (Etapa 13)", () => {
  it("mostra dificuldade, risco, amostra e motivo em principais e alternativas", () => {
    const main = {
      ...recomendacaoMid,
      personalGames: 8,
      poolSource: "PERSONAL_OBSERVED",
      metricDetails: [
        {
          key: "CHAMPION_DIFFICULTY",
          value: 80,
          status: "AVAILABLE",
          confidence: null,
          explanation: "Valor original 8/10 da Data Dragon; normalizado linearmente pelo Sparta."
        },
        {
          key: "EXECUTION_RISK",
          value: 62,
          status: "AVAILABLE",
          confidence: null,
          explanation:
            "Dificuldade geral elevada, compensada por 8 partidas observadas nesta posição."
        }
      ]
    } as unknown as PickRecommendation;
    const alternative = {
      ...main,
      championId: 103,
      championName: "Ahri",
      personalGames: 0,
      poolSource: "USER_PROVIDED",
      metricDetails: [
        {
          key: "CHAMPION_DIFFICULTY",
          value: 30,
          status: "AVAILABLE",
          confidence: null
        },
        {
          key: "EXECUTION_RISK",
          value: 30,
          status: "AVAILABLE",
          confidence: null,
          explanation: "Dificuldade geral baixa e nenhuma partida observada nesta posição."
        }
      ]
    } as unknown as PickRecommendation;

    render(
      <ChampionSelectScreen
        draft={{
          playerRole: "MID",
          pickOrder: 1,
          allies: [],
          enemies: [],
          bannedChampionIds: []
        }}
        setDraft={vi.fn()}
        autoPickOrder={null}
        autoPlayerRole={null}
        champSelectActive
        recommendations={[main]}
        alternatives={[alternative]}
        recommendationsStatus="idle"
        noAccountLinked={false}
        ddragonVersion="16.14.1"
        riotAccounts={[]}
        draftAutoFilled={false}
      />
    );

    expect(screen.getByText("Dificuldade 80 · risco 62")).toBeDefined();
    expect(screen.getByText("Dificuldade 30 · risco 30")).toBeDefined();
    expect(screen.getAllByText(/8 partidas observadas/).length).toBeGreaterThan(0);
    expect(
      screen.getByTitle(
        "Dificuldade geral elevada, compensada por 8 partidas observadas nesta posição."
      )
    ).toBeDefined();
    expect(
      screen.getByTitle("Dificuldade geral baixa e nenhuma partida observada nesta posição.")
    ).toBeDefined();
  });
});

describe("Patch Intelligence na Champion Select (Etapa 19)", () => {
  it("mostra a mudança como contexto secundário, com evidência e aviso de meta", async () => {
    apiMocks.fetchPatchRelease.mockResolvedValue({
      ...releaseSemMudancas,
      status: "PARTIAL",
      changes: [
        {
          id: "orianna-q",
          entityType: "CHAMPION",
          entityId: 61,
          entityName: "Orianna",
          entityResolution: { status: "RESOLVED" },
          changeType: "BUFF",
          affectedComponent: "Q – Comando: Atacar",
          officialSummary: "Vamos fortalecer Orianna neste patch.",
          officialDetails: ["Dano: 10 ⇒ 12"],
          structuredChanges: [
            {
              label: "Dano",
              previousValue: "10",
              newValue: "12",
              numericPreviousValue: 10,
              numericNewValue: 12,
              numericDelta: 2,
              status: "AVAILABLE"
            }
          ],
          status: "AVAILABLE",
          provenance: { sourceType: "OFFICIAL", status: "AVAILABLE" }
        }
      ]
    } satisfies PatchRelease);

    renderScreen({ playerRole: "MID", playerRoleSource: "USER", patch: "16.14.1" }, [
      recomendacaoMid
    ]);

    expect(await screen.findByText("Patch 26.14")).toBeDefined();
    expect(apiMocks.fetchPatchRelease).toHaveBeenCalledWith("26.14");
    expect(screen.getAllByText("Buff oficial neste patch").length).toBeGreaterThan(0);
    expect(screen.getByText("Q – Comando: Atacar")).toBeDefined();
    expect(screen.getByText("Antes: 10 · Agora: 12")).toBeDefined();
    expect(
      screen.getByText(/Mudança oficial não representa força observada no meta/)
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Fonte oficial" }).getAttribute("href")).toBe(
      releaseSemMudancas.sourceUrl
    );
    expect(screen.getByText("Por que este pick")).toBeDefined();
  });
});
