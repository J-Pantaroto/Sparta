import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProfileRecentMatch } from "@sparta/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMatchHistoryMock } = vi.hoisted(() => ({ fetchMatchHistoryMock: vi.fn() }));

vi.mock("../services/api-client", () => ({ fetchMatchHistory: fetchMatchHistoryMock }));
vi.mock("../services/datadragon", () => ({
  fetchAllChampions: vi.fn().mockResolvedValue([{ id: 61, key: "Orianna", name: "Orianna" }]),
  championSquareUrl: (slug: string) => `https://assets.test/${slug}.png`,
  itemIconUrl: (itemId: number) => `https://assets.test/item-${itemId}.png`
}));

import { MatchHistoryList } from "./MatchHistoryList";

function match(overrides: Partial<ProfileRecentMatch> = {}): ProfileRecentMatch {
  return {
    matchId: "BR1_1",
    championId: 61,
    championName: "Orianna",
    role: "MID",
    won: true,
    kills: 5,
    deaths: 2,
    assists: 7,
    csPerMinute: 7.5,
    damagePerMinute: 700,
    visionScorePerMinute: 1.1,
    killParticipation: 0.6,
    objectiveParticipation: 0.4,
    objectiveTakedowns: 2,
    teamObjectiveKills: 4,
    durationSeconds: 1800,
    queueId: 420,
    queueLabel: "Ranqueada Solo/Duo",
    patch: "26.15",
    observedAt: new Date().toISOString(),
    items: [],
    runes: [],
    spells: [],
    timelineAvailable: false,
    postGameAvailable: false,
    draftComparisonAvailable: false,
    positionStatus: null,
    ...overrides
  };
}

describe("MatchHistoryList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("busca a primeira página e agrupa por período ao montar", async () => {
    fetchMatchHistoryMock.mockResolvedValue({
      puuid: "puuid-1",
      matches: [match()],
      total: 1,
      limit: 20,
      offset: 0
    });

    render(
      <MatchHistoryList
        sessionToken="token-1"
        puuid="puuid-1"
        ddragonVersion="16.14.1"
        selectedMatchId={null}
        onSelect={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText("Orianna")).toBeTruthy());
    expect(screen.getByText("Hoje")).toBeTruthy();
    expect(screen.getByText("1 de 1 partida")).toBeTruthy();
    expect(fetchMatchHistoryMock).toHaveBeenCalledWith(
      "token-1",
      "puuid-1",
      expect.objectContaining({ limit: 20, offset: 0 })
    );
  });

  it("nenhuma partida corresponde aos filtros mostra estado vazio honesto", async () => {
    fetchMatchHistoryMock.mockResolvedValue({ puuid: "puuid-1", matches: [], total: 0, limit: 20, offset: 0 });

    render(
      <MatchHistoryList
        sessionToken="token-1"
        puuid="puuid-1"
        ddragonVersion="16.14.1"
        selectedMatchId={null}
        onSelect={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText("Nenhuma partida encontrada")).toBeTruthy());
  });

  it("trocar o filtro de resultado refaz a busca do zero (offset 0)", async () => {
    fetchMatchHistoryMock.mockResolvedValue({
      puuid: "puuid-1",
      matches: [match()],
      total: 1,
      limit: 20,
      offset: 0
    });

    render(
      <MatchHistoryList
        sessionToken="token-1"
        puuid="puuid-1"
        ddragonVersion="16.14.1"
        selectedMatchId={null}
        onSelect={() => {}}
      />
    );

    await waitFor(() => expect(fetchMatchHistoryMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Vitórias" }));

    await waitFor(() =>
      expect(fetchMatchHistoryMock).toHaveBeenLastCalledWith(
        "token-1",
        "puuid-1",
        expect.objectContaining({ won: true, offset: 0 })
      )
    );
  });

  it("clicar numa partida chama onSelect com o objeto completo", async () => {
    const onSelect = vi.fn();
    fetchMatchHistoryMock.mockResolvedValue({
      puuid: "puuid-1",
      matches: [match()],
      total: 1,
      limit: 20,
      offset: 0
    });

    render(
      <MatchHistoryList
        sessionToken="token-1"
        puuid="puuid-1"
        ddragonVersion="16.14.1"
        selectedMatchId={null}
        onSelect={onSelect}
      />
    );

    await waitFor(() => expect(screen.getByText("Orianna")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Orianna/ }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ matchId: "BR1_1" }));
  });
});
