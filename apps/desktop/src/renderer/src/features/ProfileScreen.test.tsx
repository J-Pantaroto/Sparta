import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PlayerChampionStats } from "@sparta/core";
import { availableCoverage, partialCoverage, unavailableCoverage } from "@sparta/core";
import { ChampionDetail } from "./ProfileScreen";

function stats(overrides: Partial<PlayerChampionStats> = {}): PlayerChampionStats {
  return {
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
    objectiveParticipation: null,
    coverage: {
      killParticipation: availableCoverage(8),
      objectiveParticipation: unavailableCoverage(8, "O Sparta ainda não extrai participação em objetivos.")
    },
    recentMatches: [],
    ...overrides
  };
}

describe("ChampionDetail: ausência versus zero", () => {
  it("mostra 'Indisponível' e o motivo em vez de 0%", () => {
    render(<ChampionDetail champion={stats()} ddragonVersion="14.1.1" />);
    expect(screen.getByText("Indisponível")).toBeDefined();
    expect(screen.getByText(/não extrai participação em objetivos/i)).toBeDefined();
  });

  it("mostra participação zero medida como 0%, não como indisponível", () => {
    render(
      <ChampionDetail
        champion={stats({
          killParticipation: 0,
          objectiveParticipation: 0,
          coverage: { killParticipation: availableCoverage(8), objectiveParticipation: availableCoverage(8) }
        })}
        ddragonVersion="14.1.1"
      />
    );
    expect(screen.getAllByText("0%").length).toBe(2);
    expect(screen.queryByText("Indisponível")).toBeNull();
  });

  it("marca dado parcial e informa a amostra realmente usada", () => {
    render(
      <ChampionDetail
        champion={stats({ coverage: { killParticipation: partialCoverage(8, 5), objectiveParticipation: partialCoverage(8, 2) }, objectiveParticipation: 0.3 })}
        ddragonVersion="14.1.1"
      />
    );
    expect(screen.getAllByText("parcial").length).toBe(2);
    expect(screen.getByText(/5 de 8 partidas/)).toBeDefined();
  });

  it("não renderiza barra para o componente de score sem dado", () => {
    const { container } = render(<ChampionDetail champion={stats()} ddragonVersion="14.1.1" />);
    const labels = [...container.querySelectorAll(".sp-statbar__label")].map((node) => node.textContent);
    // `objective` fica fora dos componentes quando nao ha dado - nao entra
    // como barra zerada.
    expect(labels).not.toContain("Participação em objetivos");
    expect(labels).toContain("KDA");
  });

  it("nunca exibe NaN, Infinity ou undefined", () => {
    const { container } = render(<ChampionDetail champion={stats({ games: 0, deaths: 0, wins: 0 })} ddragonVersion="14.1.1" />);
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe("participação em objetivos real no Perfil (Etapa 5)", () => {
  it("mostra o percentual quando a métrica passa a existir", () => {
    render(
      <ChampionDetail
        champion={stats({
          objectiveParticipation: 0.75,
          coverage: { killParticipation: availableCoverage(8), objectiveParticipation: availableCoverage(8) }
        })}
        ddragonVersion="14.1.1"
      />
    );
    expect(screen.getByText("75%")).toBeDefined();
    expect(screen.queryByText("Indisponível")).toBeNull();
  });

  it("mostra 0% legítimo em vez de indisponível", () => {
    render(
      <ChampionDetail
        champion={stats({
          objectiveParticipation: 0,
          coverage: { killParticipation: availableCoverage(8), objectiveParticipation: availableCoverage(8) }
        })}
        ddragonVersion="14.1.1"
      />
    );
    expect(screen.queryByText("Indisponível")).toBeNull();
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
  });

  it("expõe a amostra realmente usada quando a cobertura é parcial", () => {
    render(
      <ChampionDetail
        champion={stats({
          objectiveParticipation: 0.36,
          coverage: { killParticipation: availableCoverage(8), objectiveParticipation: partialCoverage(8, 7) }
        })}
        ddragonVersion="14.1.1"
      />
    );
    expect(screen.getByText(/7 de 8 partidas/)).toBeDefined();
    expect(screen.getAllByText("parcial").length).toBe(1);
  });

  it("com a métrica disponível, a barra do componente volta a aparecer", () => {
    const { container } = render(
      <ChampionDetail
        champion={stats({
          objectiveParticipation: 0.5,
          coverage: { killParticipation: availableCoverage(8), objectiveParticipation: availableCoverage(8) }
        })}
        ddragonVersion="14.1.1"
      />
    );
    const labels = [...container.querySelectorAll(".sp-statbar__label")].map((node) => node.textContent);
    expect(labels).toContain("Participação em objetivos");
  });
});
