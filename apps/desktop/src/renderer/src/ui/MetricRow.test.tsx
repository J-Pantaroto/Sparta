import { availableMetric, staleMetric, unavailableMetric } from "@sparta/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MetricRow } from "./MetricRow";

afterEach(cleanup);

/** A barra só existe quando há valor - é o invariante do componente. */
function barPreenchida(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".sp-statbar__fill");
}

describe("MetricRow", () => {
  it("desenha barra quando a métrica tem valor disponível", () => {
    const { container } = render(
      <MetricRow label="Encaixe de composição" metric={availableMetric({ key: "TEAM_COMPOSITION", value: 65 })} />
    );

    expect(barPreenchida(container)).not.toBeNull();
    expect(screen.getByText("65")).toBeTruthy();
    expect(screen.queryByText("Indisponível")).toBeNull();
  });

  it("trata 50 calculado como valor normal, com barra", () => {
    const { container } = render(
      <MetricRow label="Encaixe de composição" metric={availableMetric({ key: "TEAM_COMPOSITION", value: 50 })} />
    );

    expect(barPreenchida(container)).not.toBeNull();
    expect(screen.getByText("50")).toBeTruthy();
  });

  it("mostra 'Indisponível' e NÃO desenha barra quando a métrica falta", () => {
    const { container } = render(
      <MetricRow
        label="Matchup global"
        metric={unavailableMetric("GLOBAL_MATCHUP", "Nenhuma fonte global configurada")}
      />
    );

    expect(screen.getByText("Indisponível")).toBeTruthy();
    expect(barPreenchida(container)).toBeNull();
    expect(screen.getByText("Nenhuma fonte global configurada")).toBeTruthy();
  });

  it("não exibe 0 nem 50 no lugar de uma métrica ausente", () => {
    render(<MetricRow label="Matchup global" metric={unavailableMetric("GLOBAL_MATCHUP", "Sem fonte")} />);

    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("50")).toBeNull();
  });

  it("aguenta uma métrica indisponível sem motivo, sem quebrar", () => {
    const semMotivo = { ...unavailableMetric("GLOBAL_MATCHUP", ""), unavailableReason: undefined };
    const { container } = render(<MetricRow label="Matchup global" metric={semMotivo} />);

    expect(screen.getByText("Indisponível")).toBeTruthy();
    expect(barPreenchida(container)).toBeNull();
  });

  it("marca visualmente o dado desatualizado, diferente do disponível", () => {
    const { container } = render(
      <MetricRow
        label="Força no meta"
        metric={staleMetric({ key: "META_STRENGTH", value: 61, staleReason: "Coletado no patch 16.13" })}
      />
    );

    expect(container.querySelector(".sp-metric--stale")).not.toBeNull();
    expect(screen.getByText("desatualizado")).toBeTruthy();
    expect(screen.getByText("Coletado no patch 16.13")).toBeTruthy();
    // O último valor conhecido continua visível, mas sinalizado.
    expect(barPreenchida(container)).not.toBeNull();
  });

  it("não marca como desatualizada uma métrica disponível", () => {
    const { container } = render(
      <MetricRow label="Força no meta" metric={availableMetric({ key: "META_STRENGTH", value: 61 })} />
    );

    expect(container.querySelector(".sp-metric--stale")).toBeNull();
    expect(screen.queryByText("desatualizado")).toBeNull();
  });

  it("sinaliza métrica parcial sem escondê-la", () => {
    const { container } = render(
      <MetricRow
        label="Matchup global"
        metric={availableMetric({ key: "GLOBAL_MATCHUP", value: 58, partial: true })}
      />
    );

    expect(screen.getByText("parcial")).toBeTruthy();
    expect(barPreenchida(container)).not.toBeNull();
  });

  it("renderiza candidatos com disponibilidades diferentes lado a lado", () => {
    const { container } = render(
      <>
        <MetricRow label="Matchup de rota" metric={availableMetric({ key: "LANE_MATCHUP", value: 58 })} />
        <MetricRow label="Matchup de rota" metric={unavailableMetric("LANE_MATCHUP", "Sem histórico do confronto")} />
      </>
    );

    expect(container.querySelectorAll(".sp-statbar__fill")).toHaveLength(1);
    expect(screen.getAllByText("Matchup de rota")).toHaveLength(2);
    expect(screen.getByText("Indisponível")).toBeTruthy();
  });
});
