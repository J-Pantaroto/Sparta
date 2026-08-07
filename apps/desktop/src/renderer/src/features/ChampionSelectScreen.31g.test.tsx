import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftState, PickRecommendation } from "@sparta/core";
import { ChampionSelectScreen } from "./ChampionSelectScreen";

const apiMocks = vi.hoisted(() => ({
  fetchPlayerPool: vi.fn(),
  fetchPatchRelease: vi.fn(),
  fetchTheoreticalPatchImpacts: vi.fn()
}));

vi.mock("../services/api-client", () => ({
  fetchPlayerPool: apiMocks.fetchPlayerPool,
  fetchPatchRelease: apiMocks.fetchPatchRelease,
  fetchTheoreticalPatchImpacts: apiMocks.fetchTheoreticalPatchImpacts,
  addPlayerPoolEntry: vi.fn(),
  disablePlayerPoolEntry: vi.fn()
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

const orianna = {
  championId: 61,
  championName: "Orianna",
  role: "MID",
  totalScore: 70,
  category: "comfort_pick",
  reasons: [],
  warnings: [],
  metrics: {},
  metricDetails: [],
  dataCoverage: 0.8
} as unknown as PickRecommendation;

const inactiveProps = {
  draft: { pickOrder: 1, allies: [], enemies: [], bannedChampionIds: [] } as DraftState,
  setDraft: vi.fn(),
  autoPickOrder: null,
  autoPlayerRole: null,
  champSelectActive: false,
  recommendations: [],
  recommendationsStatus: "idle",
  noAccountLinked: false,
  ddragonVersion: "16.14.1",
  riotAccounts: [],
  draftAutoFilled: false
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.fetchPlayerPool.mockResolvedValue({ entries: [], roleSummaries: [] });
  apiMocks.fetchPatchRelease.mockResolvedValue(undefined);
  apiMocks.fetchTheoreticalPatchImpacts.mockResolvedValue(undefined);
});

describe("Champion Select visual e operacional (Etapa 31G)", () => {
  it("distingue League fechado de falha instavel da LCU", () => {
    const { rerender } = render(
      <ChampionSelectScreen {...inactiveProps} lcuStatus="CLIENT_CLOSED" />
    );
    expect(screen.getByText(/League n.o detectado/)).toBeDefined();
    rerender(<ChampionSelectScreen {...inactiveProps} lcuStatus="REQUEST_TIMEOUT" />);
    expect(screen.getByText(/A LCU n.o respondeu de forma est.vel/)).toBeDefined();
    expect(screen.getByText(/nenhum dado ausente ser. inferido/i)).toBeDefined();
  });

  it("registra escolha fora do snapshot sem score retroativo", () => {
    render(
      <ChampionSelectScreen
        {...inactiveProps}
        draft={{
          playerRole: "MID",
          pickOrder: 1,
          allies: [],
          enemies: [],
          bannedChampionIds: [],
          selectedChampionId: 103
        }}
        champSelectActive
        recommendations={[orianna]}
        recommendationsStatus="success"
        draftAutoFilled
        selectedChampionName="Ahri"
      />
    );
    expect(screen.getByText(/Fora do snapshot: nenhum score ou ranking retroativo/)).toBeDefined();
  });

  it("preserva o snapshot visual depois do lock-in", () => {
    const base = {
      ...inactiveProps,
      draft: {
        playerRole: "MID" as const,
        pickOrder: 1,
        allies: [],
        enemies: [],
        bannedChampionIds: [],
        selectedChampionId: 61
      },
      autoPlayerRole: "MID" as const,
      champSelectActive: true,
      recommendationsStatus: "success",
      draftAutoFilled: true,
      selectedChampionLocked: true,
      selectedChampionName: "Orianna"
    };
    const { rerender } = render(<ChampionSelectScreen {...base} recommendations={[orianna]} />);
    expect(screen.getByText("Snapshot preservado")).toBeDefined();
    rerender(
      <ChampionSelectScreen
        {...base}
        recommendations={[
          { ...orianna, championId: 103, championName: "Ahri" } as PickRecommendation
        ]}
      />
    );
    expect(screen.getAllByText("Orianna").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ahri")).toBeNull();
  });

  it("mantem adversario desconhecido sem inferir confronto e usa botao nativo", () => {
    render(
      <ChampionSelectScreen
        {...inactiveProps}
        draft={{
          playerRole: "MID",
          pickOrder: 1,
          allies: [],
          enemies: [{ championId: 64, championName: "Lee Sin", team: "enemy" }],
          bannedChampionIds: []
        }}
        champSelectActive
        recommendations={[orianna]}
      />
    );
    expect(screen.getAllByText("Desconhecido").length).toBeGreaterThan(0);
    expect(screen.queryByText("Direto")).toBeNull();
    expect(screen.getByRole("button", { name: /Ver detalhes de Orianna/ }).tagName).toBe("BUTTON");
  });
});
