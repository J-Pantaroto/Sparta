import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DraftState, PickRecommendation } from "@sparta/core";
import { ChampionSelectScreen } from "./ChampionSelectScreen";

const apiMocks = vi.hoisted(() => ({
  fetchPlayerPool: vi.fn(),
  addPlayerPoolEntry: vi.fn(),
  disablePlayerPoolEntry: vi.fn()
}));

vi.mock("../services/api-client", () => ({
  fetchPlayerProfile: () => new Promise(() => {}),
  fetchPlayerPool: apiMocks.fetchPlayerPool,
  addPlayerPoolEntry: apiMocks.addPlayerPoolEntry,
  disablePlayerPoolEntry: apiMocks.disablePlayerPoolEntry
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
    const proximo = atualizar({ playerRole: "ADC", pickOrder: 1, allies: [], enemies: [], bannedChampionIds: [] });
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
          element?.classList.contains("sp-badge") === true &&
          element.textContent === "Mid: 2"
      )
    ).toBeDefined();
  });
});
