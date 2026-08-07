import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftSessionDetail, DraftSessionSummary } from "../services/api-client";

const { fetchDraftSessionsMock, fetchDraftSessionDetailMock } = vi.hoisted(() => ({
  fetchDraftSessionsMock: vi.fn(),
  fetchDraftSessionDetailMock: vi.fn()
}));

vi.mock("../services/api-client", () => ({
  fetchDraftSessions: fetchDraftSessionsMock,
  fetchDraftSessionDetail: fetchDraftSessionDetailMock
}));

vi.mock("./DraftReviewPanel", () => ({ DraftReviewPanel: () => null }));
vi.mock("./ReplayCapabilitySummary", () => ({ ReplayCapabilitySummary: () => null }));
vi.mock("../services/datadragon", () => ({
  fetchAllChampions: vi.fn().mockResolvedValue([
    { id: 234, key: "Viego", name: "Viego" },
    { id: 103, key: "Ahri", name: "Ahri" },
    { id: 64, key: "LeeSin", name: "Lee Sin" }
  ]),
  championSquareUrl: (slug: string) => `https://assets.test/${slug}.png`
}));

import { DraftHistoryScreen } from "./DraftHistoryScreen";

function session(overrides: Partial<DraftSessionSummary> = {}): DraftSessionSummary {
  return {
    id: "session-1",
    source: "USER",
    status: "COMPLETED",
    role: "JUNGLE",
    roleSource: "USER",
    selectedChampionId: 234,
    queueId: 420,
    patch: "26.15",
    gameVersion: "26.15.1",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedInAt: null,
    completedAt: new Date().toISOString(),
    linkedMatchId: null,
    externalGameId: null,
    matchLinkStatus: "PENDING",
    knownDraft: {
      allies: [{ championId: 103, championName: "Ahri" }],
      enemies: [{ championId: 64, championName: "Lee Sin" }],
      bannedChampionIds: [55, 91],
      banSideKnown: true,
      unknownAllyPicks: 3,
      unknownEnemyPicks: 3
    },
    ...overrides
  };
}

function detail(overrides: Partial<DraftSessionDetail> = {}): DraftSessionDetail {
  return {
    session: session(),
    latestSnapshot: {
      id: "snap-1",
      inputHash: "hash-1",
      dataCoverage: 0.9,
      algorithmVersions: { recommendationEngine: "1.0.0" },
      createdAt: new Date().toISOString(),
      supersededAt: null,
      recommendations: [
        {
          championId: 234,
          championName: "Viego",
          rank: 1,
          group: "PRIMARY",
          totalScore: 58.7,
          dataCoverage: 0.9,
          poolSource: "OBSERVED",
          personalGames: 10,
          category: "comfort_pick",
          reasons: [{ code: "r1", label: "Forma recente", detail: "Forma recente forte.", impact: 1 }],
          warnings: []
        }
      ],
      configurationSource: "RELEASE",
      configurationVersion: "1.0.0",
      configHash: "fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38",
      release: {
        id: "release-1",
        releaseVersion: "release-etapa27c-v1",
        artifactHash: "8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90",
        status: "ACTIVE",
        currentlyActive: true
      }
    },
    selectedChampion: { championId: 234, state: "RANKED", rank: 1, group: "PRIMARY" },
    matchLink: {
      status: "PENDING",
      strategy: null,
      matchId: null,
      externalGameId: null,
      algorithmVersion: null,
      candidateCount: 0,
      reason: null,
      decidedAt: null,
      evidence: [],
      revisions: []
    },
    ...overrides
  };
}

describe("DraftHistoryScreen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista vazia mostra estado honesto, sem inventar sessão", async () => {
    fetchDraftSessionsMock.mockResolvedValue({ sessions: [] });
    render(<DraftHistoryScreen sessionToken="token-1" ddragonVersion="16.14.1" />);
    await waitFor(() => expect(screen.getByText("Nenhum draft registrado ainda")).toBeTruthy());
  });

  it("filtro de posição reduz a lista sem nova chamada à API", async () => {
    fetchDraftSessionsMock.mockResolvedValue({
      sessions: [session({ id: "s1", role: "JUNGLE" }), session({ id: "s2", role: "MID" })]
    });
    render(<DraftHistoryScreen sessionToken="token-1" ddragonVersion="16.14.1" />);

    await waitFor(() => expect(screen.getByText("2 de 2 sessão(ões)")).toBeTruthy());
    expect(fetchDraftSessionsMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Mid" }));

    await waitFor(() => expect(screen.getByText("1 de 2 sessão(ões)")).toBeTruthy());
    // Filtro é só client-side - não deve refazer a busca.
    expect(fetchDraftSessionsMock).toHaveBeenCalledTimes(1);
  });

  it("abre o detalhe com os três blocos e mostra hash resumido de config/artifact", async () => {
    fetchDraftSessionsMock.mockResolvedValue({ sessions: [session()] });
    fetchDraftSessionDetailMock.mockResolvedValue(detail());
    render(<DraftHistoryScreen sessionToken="token-1" ddragonVersion="16.14.1" />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Sessão de Jungle/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Sessão de Jungle/ }));

    await waitFor(() => expect(screen.getByText("Contexto congelado")).toBeTruthy());
    expect(screen.getByText("Resultado produzido")).toBeTruthy();
    expect(screen.getByText("Configuração")).toBeTruthy();
    expect(screen.getByText("Viego")).toBeTruthy();
    expect(screen.getByText("ATIVA")).toBeTruthy();
    // Hash resumido, não o valor completo, por padrão.
    expect(screen.getByText("fa9dbd…aa38")).toBeTruthy();
    expect(screen.queryByText("fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38")).toBeNull();
  });
});
