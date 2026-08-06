import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PlayerProfileOverview, ProfileMetric, ProfileMetricKey } from "@sparta/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

const api = vi.hoisted(() => ({
  fetchMyPlayerProfile: vi.fn(),
  syncMyPlayerData: vi.fn()
}));

vi.mock("../services/api-client", () => api);
vi.mock("../services/datadragon", () => ({
  fetchAllChampions: vi.fn().mockResolvedValue([{ id: 234, key: "Viego", name: "Viego" }]),
  championSquareUrl: (slug: string) => `https://assets.test/${slug}.png`,
  itemIconUrl: (itemId: number) => `https://assets.test/item-${itemId}.png`
}));

import { DashboardScreen } from "./DashboardScreen";

const metric = (
  key: ProfileMetricKey,
  label: string,
  value: number | null,
  status: ProfileMetric["status"] = "AVAILABLE"
): ProfileMetric => ({
  key,
  label,
  value,
  unit: key === "OBJECTIVES" || key === "TEAM_IMPACT" ? "PERCENT" : "INDEX",
  status,
  sampleSize: 8,
  availableSampleSize: value === null ? 0 : 8,
  coverage: value === null ? 0 : 1,
  formula: `Fórmula de ${label}`,
  algorithmVersion: "player-profile-overview/1.0.0"
});

function overview(overrides: Partial<PlayerProfileOverview> = {}): PlayerProfileOverview {
  return {
    status: "PARTIAL",
    identity: {
      riotId: "Jogador com Riot ID muito extenso#BR1",
      platform: "BR1",
      regionLabel: "Servidor BR1 · americas",
      profileIconId: null,
      summonerLevel: null,
      updatedAt: "2026-08-06T18:00:00.000Z"
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
      secondaryRole: null,
      roleEvidence: [
        { role: "JUNGLE", games: 8, share: 1, lastObservedAt: "2026-08-06T18:00:00.000Z" }
      ]
    },
    recentPerformance: {
      sampleSize: 8,
      wins: 4,
      losses: 4,
      winRate: 50,
      periodStart: "2026-08-01T18:00:00.000Z",
      periodEnd: "2026-08-06T18:00:00.000Z",
      metrics: [
        metric("RECENT_PERFORMANCE", "Desempenho recente", 62),
        metric("OBJECTIVES", "Objetivos", 0),
        metric("VISION", "Visão", 58),
        metric("CONSISTENCY", "Consistência", null, "UNAVAILABLE"),
        metric("TEAM_IMPACT", "Impacto em equipe", 51),
        metric("SURVIVAL", "Sobrevivência", 70),
        metric("FARM", "Farm", 63),
        metric("EXECUTION", "Execução", 66)
      ]
    },
    performanceTrend: [
      {
        matchId: "BR1_1",
        observedAt: "2026-08-05T18:00:00.000Z",
        performanceIndex: 0,
        kda: 0,
        objectiveParticipation: 0,
        csPerMinute: 0,
        visionScorePerMinute: 0,
        won: false
      },
      {
        matchId: "BR1_2",
        observedAt: "2026-08-06T18:00:00.000Z",
        performanceIndex: 62,
        kda: 2.5,
        objectiveParticipation: 0.5,
        csPerMinute: 6,
        visionScorePerMinute: 1.1,
        won: true
      }
    ],
    topChampions: [
      {
        championId: 234,
        championName: "Viego",
        role: "JUNGLE",
        games: 8,
        wins: 4,
        losses: 4,
        winRate: 50,
        kda: 2.5,
        recentForm: "stable",
        sampleStatus: "SUFFICIENT",
        lastPlayedAt: "2026-08-06T18:00:00.000Z"
      }
    ],
    recentMatches: [
      {
        matchId: "BR1_2",
        championId: 234,
        championName: "Viego",
        role: "JUNGLE",
        won: true,
        kills: 4,
        deaths: 2,
        assists: 6,
        csPerMinute: 6,
        damagePerMinute: 500,
        visionScorePerMinute: 1.1,
        killParticipation: 0.5,
        objectiveParticipation: 0.5,
        objectiveTakedowns: 2,
        teamObjectiveKills: 4,
        durationSeconds: 1800,
        queueId: 420,
        queueLabel: "Ranqueada Solo/Duo",
        patch: "26.15",
        observedAt: "2026-08-06T18:00:00.000Z",
        items: [],
        runes: [],
        spells: [],
        timelineAvailable: true,
        postGameAvailable: true,
        draftComparisonAvailable: true,
        positionStatus: "CONFIRMED"
      }
    ],
    strengths: [],
    improvementAreas: [],
    coverage: {} as PlayerProfileOverview["coverage"],
    provenance: [],
    algorithmVersion: "player-profile-overview/1.0.0",
    generatedAt: "2026-08-06T18:00:00.000Z",
    ...overrides
  };
}

const account = {
  puuid: "own-puuid",
  gameName: "Jogador",
  tagLine: "BR1",
  platformRegion: "br1",
  regionalRouting: "americas",
  linkStatus: "UNVERIFIED_LEGACY",
  verifiedAt: null
};

function renderDashboard(props: Partial<ComponentProps<typeof DashboardScreen>> = {}) {
  const onNavigate = vi.fn();
  const onOpenMatch = vi.fn();
  const rendered = render(
    <DashboardScreen
      riotAccounts={[account]}
      sessionToken="private-session"
      ddragonVersion="16.15.1"
      champSelectActive={false}
      leagueConnected={false}
      emailVerified
      onNavigate={onNavigate}
      onOpenMatch={onOpenMatch}
      {...props}
    />
  );
  return { onNavigate, onOpenMatch, ...rendered };
}

describe("DashboardScreen v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchMyPlayerProfile.mockResolvedValue(overview());
    api.syncMyPlayerData.mockResolvedValue({
      requested: 0,
      imported: 0,
      skippedExisting: 0,
      failed: [],
      skippedParticipants: []
    });
  });

  it("mostra skeleton sem flash de dados e consulta somente o agregado autenticado", async () => {
    let resolveProfile!: (value: PlayerProfileOverview) => void;
    api.fetchMyPlayerProfile.mockReturnValue(new Promise((resolve) => (resolveProfile = resolve)));
    renderDashboard();

    expect(screen.getByLabelText("Carregando dashboard")).toBeDefined();
    expect(screen.queryByText(/Jogador com Riot ID/)).toBeNull();
    resolveProfile(overview());

    expect(await screen.findByText("Jogador com Riot ID muito extenso#BR1")).toBeDefined();
    expect(api.fetchMyPlayerProfile).toHaveBeenCalledWith("private-session");
  });

  it("preserva zero, indisponibilidade de elo e amostra parcial sem valores inválidos", async () => {
    const { container } = renderDashboard();
    expect((await screen.findAllByText("Indisponível")).length).toBeGreaterThan(0);
    expect(screen.getByText("0%")).toBeDefined();
    expect(screen.getByText("Cobertura parcial")).toBeDefined();
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("explica League fechado sem bloquear o modo manual", async () => {
    renderDashboard({ leagueConnected: false });
    expect(await screen.findByText("League Client")).toBeDefined();
    expect(screen.getByText("Fechado")).toBeDefined();
    const action = screen.getByRole("button", { name: /Champion Select/ });
    expect(action).not.toHaveProperty("disabled", true);
    expect(screen.getByText(/Modo manual; detecção automática indisponível/)).toBeDefined();
  });

  it("abre perfil e a partida correta pelas ações do dashboard", async () => {
    const { onNavigate, onOpenMatch } = renderDashboard();
    await screen.findByText("Partidas recentes");
    fireEvent.click(screen.getByRole("button", { name: "Abrir perfil" }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir detalhes da partida BR1_2/ }));
    expect(onNavigate).toHaveBeenCalledWith("profile");
    expect(onOpenMatch).toHaveBeenCalledWith("BR1_2");
  });

  it("sincroniza sem identidade arbitrária e atualiza o agregado", async () => {
    renderDashboard();
    await screen.findByText("Ações rápidas");
    fireEvent.click(screen.getByRole("button", { name: /Sincronizar dados/ }));
    await waitFor(() => expect(api.syncMyPlayerData).toHaveBeenCalledWith("private-session"));
    await waitFor(() => expect(api.fetchMyPlayerProfile).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/nenhuma partida nova encontrada/i)).toBeDefined();
  });

  it("distingue jogador sem partidas de erro da API", async () => {
    api.fetchMyPlayerProfile.mockResolvedValue(
      overview({
        recentPerformance: {
          ...overview().recentPerformance,
          sampleSize: 0,
          wins: 0,
          losses: 0,
          winRate: null
        },
        performanceTrend: [],
        topChampions: [],
        recentMatches: []
      })
    );
    renderDashboard();
    expect(await screen.findByText("Nenhuma partida sincronizada")).toBeDefined();
    expect(screen.getByText("Sem campeões observados")).toBeDefined();
  });

  it("apresenta erro acionável quando a API está indisponível", async () => {
    api.fetchMyPlayerProfile.mockRejectedValue(new Error("connect ECONNREFUSED"));
    renderDashboard();
    expect(await screen.findByText("Dashboard indisponível")).toBeDefined();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeDefined();
    expect(screen.queryByText("connect ECONNREFUSED")).toBeNull();
  });

  it.each([1000, 1280, 1600])("mantém conteúdo e ações essenciais em %ipx", async (width) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    renderDashboard();
    expect(await screen.findByText("Índices pessoais")).toBeDefined();
    expect(screen.getByRole("button", { name: "Abrir perfil" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Champion Select/ })).toBeDefined();
  });
});
