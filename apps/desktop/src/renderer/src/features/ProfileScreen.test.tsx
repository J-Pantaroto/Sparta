import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PlayerProfileOverview } from "@sparta/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMyPlayerProfileMock } = vi.hoisted(() => ({ fetchMyPlayerProfileMock: vi.fn() }));

vi.mock("../services/api-client", () => ({ fetchMyPlayerProfile: fetchMyPlayerProfileMock }));
vi.mock("../services/datadragon", () => ({
  fetchAllChampions: vi.fn().mockResolvedValue([
    { id: 61, key: "Orianna", name: "Orianna" },
    { id: 234, key: "Viego", name: "Viego" }
  ]),
  championSquareUrl: (slug: string) => `https://assets.test/${slug}.png`,
  itemIconUrl: (itemId: number) => `https://assets.test/item-${itemId}.png`
}));

import { ProfileScreen } from "./ProfileScreen";

function overview(overrides: Partial<PlayerProfileOverview> = {}): PlayerProfileOverview {
  return {
    status: "PARTIAL",
    identity: {
      riotId: "Nome Muito Longo do Jogador#BR1",
      platform: "BR1",
      regionLabel: "Servidor BR1 · americas",
      profileIconId: null,
      summonerLevel: null,
      updatedAt: "2026-08-06T12:00:00.000Z"
    },
    ranked: {
      status: "UNAVAILABLE",
      queue: null,
      tier: null,
      division: null,
      leaguePoints: null,
      wins: null,
      losses: null,
      winRate: null,
      updatedAt: null,
      unavailableReason: "League-V4 não integrada."
    },
    roleProfile: {
      primaryRole: "JUNGLE",
      secondaryRole: "MID",
      roleEvidence: [
        { role: "JUNGLE", games: 6, share: 0.75, lastObservedAt: "2026-08-06T10:00:00.000Z" },
        { role: "MID", games: 2, share: 0.25, lastObservedAt: "2026-08-05T10:00:00.000Z" }
      ]
    },
    recentPerformance: {
      sampleSize: 8,
      wins: 4,
      losses: 4,
      winRate: 50,
      periodStart: "2026-08-01T10:00:00.000Z",
      periodEnd: "2026-08-06T10:00:00.000Z",
      metrics: [
        {
          key: "OBJECTIVES",
          label: "Objetivos",
          value: 0,
          unit: "PERCENT",
          status: "AVAILABLE",
          sampleSize: 8,
          availableSampleSize: 8,
          coverage: 1,
          formula: "Média da participação observada em objetivos × 100.",
          algorithmVersion: "player-profile-overview/1.0.0"
        },
        {
          key: "CONSISTENCY",
          label: "Consistência",
          value: null,
          unit: "INDEX",
          status: "UNAVAILABLE",
          sampleSize: 1,
          availableSampleSize: 0,
          coverage: 0,
          formula: "Desvio-padrão.",
          algorithmVersion: "player-profile-overview/1.0.0",
          unavailableReason: "Amostra insuficiente."
        }
      ]
    },
    performanceTrend: [
      {
        matchId: "BR1_1",
        observedAt: "2026-08-06T10:00:00.000Z",
        performanceIndex: 0,
        kda: 0,
        objectiveParticipation: 0,
        csPerMinute: 0,
        visionScorePerMinute: 0,
        won: false
      }
    ],
    topChampions: [
      {
        championId: 234,
        championName: "Viego",
        role: "JUNGLE",
        games: 6,
        wins: 3,
        losses: 3,
        winRate: 50,
        kda: 2.1,
        recentForm: "stable",
        sampleStatus: "SUFFICIENT",
        lastPlayedAt: "2026-08-06T10:00:00.000Z"
      },
      {
        championId: 61,
        championName: "Orianna",
        role: "MID",
        games: 2,
        wins: 1,
        losses: 1,
        winRate: 50,
        kda: 3,
        recentForm: "stable",
        sampleStatus: "SMALL",
        lastPlayedAt: "2026-08-05T10:00:00.000Z"
      }
    ],
    recentMatches: [
      {
        matchId: "BR1_1",
        championId: 234,
        championName: "Viego",
        role: "JUNGLE",
        won: false,
        kills: 0,
        deaths: 2,
        assists: 0,
        csPerMinute: 0,
        damagePerMinute: 0,
        visionScorePerMinute: 0,
        killParticipation: 0,
        objectiveParticipation: 0,
        objectiveTakedowns: 0,
        teamObjectiveKills: 3,
        durationSeconds: 1800,
        queueId: 420,
        queueLabel: "Ranqueada Solo/Duo",
        patch: "26.15",
        observedAt: "2026-08-06T10:00:00.000Z",
        items: [{ slot: 0, state: "OBSERVED", itemId: 1001, itemName: "Botas" }],
        runes: [
          {
            tree: "PRIMARY",
            slotOrder: 0,
            perkId: 8112,
            perkName: "Colheita Sombria",
            isKeystone: true
          }
        ],
        spells: [{ slot: 0, state: "OBSERVED", spellId: 4, spellName: "Flash" }],
        timelineAvailable: true,
        postGameAvailable: true,
        draftComparisonAvailable: false,
        positionStatus: "CONFIRMED"
      }
    ],
    strengths: [
      {
        code: "objetivos_altos",
        title: "Participação em objetivos",
        detail: "Sinal observado de participação.",
        evidence: "8 partidas observadas.",
        sampleSize: 8,
        periodStart: "2026-08-01T10:00:00.000Z",
        periodEnd: "2026-08-06T10:00:00.000Z",
        coverage: 1,
        status: "AVAILABLE",
        ruleVersion: "player-profile-overview/1.0.0"
      }
    ],
    improvementAreas: [],
    coverage: {
      identity: {
        status: "AVAILABLE",
        sampleSize: 1,
        availableSampleSize: 1,
        coverage: 1,
        updatedAt: "2026-08-06T12:00:00.000Z"
      },
      ranked: {
        status: "UNAVAILABLE",
        sampleSize: 0,
        availableSampleSize: 0,
        coverage: 0,
        updatedAt: null,
        reason: "League-V4 não integrada."
      },
      roles: {
        status: "AVAILABLE",
        sampleSize: 8,
        availableSampleSize: 8,
        coverage: 1,
        updatedAt: "2026-08-06T12:00:00.000Z"
      },
      recentPerformance: {
        status: "AVAILABLE",
        sampleSize: 8,
        availableSampleSize: 8,
        coverage: 1,
        updatedAt: "2026-08-06T12:00:00.000Z"
      },
      trend: {
        status: "AVAILABLE",
        sampleSize: 8,
        availableSampleSize: 8,
        coverage: 1,
        updatedAt: "2026-08-06T12:00:00.000Z"
      },
      champions: {
        status: "AVAILABLE",
        sampleSize: 8,
        availableSampleSize: 8,
        coverage: 1,
        updatedAt: "2026-08-06T12:00:00.000Z"
      },
      matches: {
        status: "AVAILABLE",
        sampleSize: 8,
        availableSampleSize: 8,
        coverage: 1,
        updatedAt: "2026-08-06T12:00:00.000Z"
      },
      objectives: {
        status: "AVAILABLE",
        sampleSize: 8,
        availableSampleSize: 8,
        coverage: 1,
        updatedAt: "2026-08-06T12:00:00.000Z"
      },
      loadout: {
        status: "PARTIAL",
        sampleSize: 8,
        availableSampleSize: 3,
        coverage: 0.375,
        updatedAt: "2026-08-06T12:00:00.000Z"
      }
    },
    provenance: [
      { sourceType: "OFFICIAL", sourceId: "riot-account-v1", status: "AVAILABLE" },
      { sourceType: "OBSERVED", sourceId: "riot-match-v5", status: "AVAILABLE", sampleSize: 8 }
    ],
    algorithmVersion: "player-profile-overview/1.0.0",
    generatedAt: "2026-08-06T12:00:00.000Z",
    ...overrides
  };
}

describe("ProfileScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPlayerProfileMock.mockResolvedValue(overview());
  });

  it("usa somente a sessão e não mostra conteúdo antigo durante o loading", async () => {
    let resolve!: (value: PlayerProfileOverview) => void;
    fetchMyPlayerProfileMock.mockReturnValue(
      new Promise<PlayerProfileOverview>((done) => {
        resolve = done;
      })
    );
    render(
      <ProfileScreen
        sessionToken="private-session"
        ddragonVersion="16.15.1"
        onOpenMatch={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Carregando perfil")).toBeDefined();
    expect(screen.queryByText("Nome Muito Longo do Jogador#BR1")).toBeNull();
    expect(fetchMyPlayerProfileMock).toHaveBeenCalledWith("private-session");

    await act(async () => resolve(overview()));
    expect(await screen.findByText("Nome Muito Longo do Jogador#BR1")).toBeDefined();
  });

  it("diferencia rank ausente, zero real, dado parcial e amostra pequena", async () => {
    const { container } = render(
      <ProfileScreen sessionToken="session" ddragonVersion="16.15.1" onOpenMatch={vi.fn()} />
    );

    expect(await screen.findByText("Elo indisponível")).toBeDefined();
    expect(screen.getByLabelText("Objetivos: 0%")).toBeDefined();
    expect(screen.getByText("Amostra pequena")).toBeDefined();
    expect(screen.getAllByText(/Parcial · 38%/).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
    expect(container.textContent).not.toContain("🇧🇷");
    expect(container.textContent).not.toContain("🇺🇸");
    expect(container.textContent).not.toContain("🇪🇺");
  });

  it("mantém a ordenação recebida dos campeões", async () => {
    render(<ProfileScreen sessionToken="session" ddragonVersion="16.15.1" onOpenMatch={vi.fn()} />);
    await screen.findByRole("heading", { level: 3, name: "Viego" });
    const names = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(names.indexOf("Viego")).toBeLessThan(names.indexOf("Orianna"));
  });

  it("abre o detalhe da partida correta por um botão acessível ao teclado", async () => {
    const onOpenMatch = vi.fn();
    render(
      <ProfileScreen sessionToken="session" ddragonVersion="16.15.1" onOpenMatch={onOpenMatch} />
    );
    const button = await screen.findByRole("button", { name: /abrir detalhes da partida BR1_1/i });

    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onOpenMatch).toHaveBeenCalledWith("BR1_1");
  });

  it("expõe evidência, amostra, período, cobertura e versão dos insights", async () => {
    render(<ProfileScreen sessionToken="session" ddragonVersion="16.15.1" onOpenMatch={vi.fn()} />);
    expect(await screen.findByText("Sinal observado de participação.")).toBeDefined();
    expect(screen.getByText("8 partidas observadas.")).toBeDefined();
    expect(screen.getByText("Regra player-profile-overview/1.0.0")).toBeDefined();
  });

  it("renderiza estados honestos quando não há partidas nem pontos no gráfico", async () => {
    fetchMyPlayerProfileMock.mockResolvedValue(
      overview({
        roleProfile: { primaryRole: null, secondaryRole: null, roleEvidence: [] },
        recentPerformance: {
          sampleSize: 0,
          wins: 0,
          losses: 0,
          winRate: null,
          periodStart: null,
          periodEnd: null,
          metrics: []
        },
        performanceTrend: [],
        topChampions: [],
        recentMatches: [],
        strengths: [],
        improvementAreas: []
      })
    );
    render(<ProfileScreen sessionToken="session" ddragonVersion="16.15.1" onOpenMatch={vi.fn()} />);

    expect(await screen.findByText("Nenhum jogo nos últimos 14 dias")).toBeDefined();
    expect(screen.getByText("Nenhum campeão observado")).toBeDefined();
    expect(screen.getByText("Nenhuma partida sincronizada")).toBeDefined();
    expect(screen.getByText("Amostra ainda insuficiente para insights")).toBeDefined();
  });

  it("mantém labels essenciais e escala fixa do gráfico", async () => {
    const { container } = render(
      <ProfileScreen sessionToken="session" ddragonVersion="16.15.1" onOpenMatch={vi.fn()} />
    );
    await waitFor(() => expect(container.querySelector(".sp-trend-chart svg")).not.toBeNull());
    expect(screen.getByRole("group", { name: "Período da tendência" })).toBeDefined();
    expect(container.querySelectorAll(".sp-trend-chart__grid")).toHaveLength(5);
    expect(screen.getByLabelText("Valores do gráfico")).toBeDefined();
  });

  it("não conecta partidas separadas por um período sem jogos", async () => {
    const first = overview()
      .performanceTrend[0] as PlayerProfileOverview["performanceTrend"][number];
    fetchMyPlayerProfileMock.mockResolvedValue(
      overview({
        performanceTrend: [
          { ...first, matchId: "BR1_old", observedAt: "2026-08-01T10:00:00.000Z" },
          { ...first, matchId: "BR1_new", observedAt: "2026-08-06T10:00:00.000Z" }
        ]
      })
    );
    const { container } = render(
      <ProfileScreen sessionToken="session" ddragonVersion="16.15.1" onOpenMatch={vi.fn()} />
    );

    await waitFor(() =>
      expect(container.querySelectorAll(".sp-trend-chart__point")).toHaveLength(2)
    );
    expect(container.querySelectorAll(".sp-trend-chart__line")).toHaveLength(0);
  });
});
