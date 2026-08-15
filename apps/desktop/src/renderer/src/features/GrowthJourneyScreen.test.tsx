import type { PlayerProfileOverview } from "@sparta/core";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchGrowthJourney: vi.fn(),
  fetchMyPlayerProfile: vi.fn()
}));

vi.mock("../services/api-client", () => api);
vi.mock("../theme/ThemedPageHero", () => ({
  ThemedPageHero: ({ title }: { title: string }) => <h1>{title}</h1>
}));

import { GrowthJourneyScreen } from "./GrowthJourneyScreen";

function performanceTrend(count: number): PlayerProfileOverview["performanceTrend"] {
  return Array.from({ length: count }, (_, index) => ({
    matchId: `BR1_${index + 1}`,
    observedAt: `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    performanceIndex: index === 0 ? 0 : 42 + index,
    kda: 1.5 + index / 10,
    objectiveParticipation: index / Math.max(1, count - 1),
    csPerMinute: 5 + index / 10,
    visionScorePerMinute: 0.7 + index / 20,
    won: index % 2 === 0
  }));
}

function profile(count: number): PlayerProfileOverview {
  return { performanceTrend: performanceTrend(count) } as PlayerProfileOverview;
}

const account = [{ puuid: "player-puuid" }] as Parameters<
  typeof GrowthJourneyScreen
>[0]["riotAccounts"];

describe("GrowthJourneyScreen - série temporal real", () => {
  beforeEach(() => {
    api.fetchGrowthJourney.mockReset();
    api.fetchMyPlayerProfile.mockReset();
    api.fetchGrowthJourney.mockResolvedValue({
      puuid: "player-puuid",
      matchesAnalyzed: 8,
      weaknessTrends: []
    });
  });

  it("desenha exatamente uma observação por partida real, incluindo zero observado", async () => {
    api.fetchMyPlayerProfile.mockResolvedValue(profile(8));

    render(<GrowthJourneyScreen riotAccounts={account} sessionToken="private-session" />);

    await waitFor(() =>
      expect(
        document.querySelectorAll(".sp-growth__primary-chart .sp-trend-chart__point")
      ).toHaveLength(8)
    );
    expect(screen.getByText("Índice de desempenho pessoal 0")).toBeDefined();
    expect(document.querySelectorAll(".sp-sparkline")).toHaveLength(4);
    expect(api.fetchMyPlayerProfile).toHaveBeenCalledWith("private-session");
  });

  it("não fabrica gráfico quando o histórico tem menos de três partidas", async () => {
    api.fetchMyPlayerProfile.mockResolvedValue(profile(2));

    render(<GrowthJourneyScreen riotAccounts={account} sessionToken="private-session" />);

    expect(await screen.findByText("Histórico insuficiente para medir evolução")).toBeDefined();
    expect(document.querySelector(".sp-growth__primary-chart")).toBeNull();
    expect(document.querySelector(".sp-sparkline")).toBeNull();
  });

  it("mantém a comparação pós-game agregada como detalhe secundário", async () => {
    api.fetchMyPlayerProfile.mockResolvedValue(profile(5));
    api.fetchGrowthJourney.mockResolvedValue({
      puuid: "player-puuid",
      matchesAnalyzed: 20,
      weaknessTrends: [
        {
          code: "early-deaths",
          label: "Mortes precoces",
          recentRate: 20,
          previousRate: 50,
          trend: "improving",
          confidence: "medium",
          hasComparison: true
        }
      ]
    });

    render(<GrowthJourneyScreen riotAccounts={account} sessionToken="private-session" />);

    expect(await screen.findByText("Comparação entre blocos")).toBeDefined();
    expect(screen.getByText("Recente")).toBeDefined();
    expect(screen.getByText("Anterior")).toBeDefined();
  });
});
