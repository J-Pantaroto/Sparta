import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChampionRoleEvidenceResponse } from "../services/api-client";
import { ChampionRoleEvidenceCard } from "./PostGameScreen";

function response(status: "AVAILABLE" | "UNAVAILABLE"): ChampionRoleEvidenceResponse {
  const unavailableReason =
    status === "UNAVAILABLE"
      ? "Nenhuma partida observada com este campeão nesta posição para os filtros informados."
      : undefined;
  return {
    personalRoleEvidence: {
      championId: 161,
      role: "SUPPORT",
      status,
      games: status === "AVAILABLE" ? 3 : 0,
      wins: status === "AVAILABLE" ? 2 : 0,
      losses: status === "AVAILABLE" ? 1 : 0,
      lastPlayedAt: status === "AVAILABLE" ? "2026-07-20T12:00:00.000Z" : null,
      patches: status === "AVAILABLE" ? ["16.14"] : [],
      queueIds: status === "AVAILABLE" ? [420, 440] : [],
      normalization: {
        extractorVersions: status === "AVAILABLE" ? ["match-observation/1.0.0"] : [],
        sources: status === "AVAILABLE" ? ["TEAM_POSITION"] : []
      },
      provenance: {
        sourceType: "CALCULATED",
        sourceId: "sparta",
        resource: "MatchObservation",
        sampleSize: status === "AVAILABLE" ? 3 : 0,
        status,
        ...(unavailableReason ? { unavailableReason } : {})
      },
      observationSource: {
        sourceType: "OBSERVED",
        sourceId: "riot-match-v5",
        sampleSize: status === "AVAILABLE" ? 3 : 0,
        status
      },
      ...(unavailableReason ? { unavailableReason } : {})
    },
    globalRoleEligibility: {
      championId: 161,
      role: "SUPPORT",
      status: "UNAVAILABLE",
      eligible: null,
      unavailableReason: "Elegibilidade global por posição ainda não está disponível."
    },
    scope: {}
  };
}

describe("ChampionRoleEvidenceCard", () => {
  it("mostra experiência pessoal factual e indisponibilidade global separadas", () => {
    render(<ChampionRoleEvidenceCard evidence={response("AVAILABLE")} />);

    expect(screen.getByText("Experiência observada")).toBeTruthy();
    expect(screen.getByText(/3 partidas observadas como Suporte/)).toBeTruthy();
    expect(screen.getByText(/filas 420, 440/)).toBeTruthy();
    expect(screen.getByText(/Elegibilidade global:/).textContent).toContain(
      "Elegibilidade global por posição ainda não está disponível."
    );
    expect(screen.queryByText(/recomendad/i)).toBeNull();
  });

  it("zero partidas mostra motivo sem inventar valor neutro", () => {
    render(<ChampionRoleEvidenceCard evidence={response("UNAVAILABLE")} />);

    expect(screen.getByText(/Nenhuma partida observada/)).toBeTruthy();
    expect(screen.queryByText(/50%/)).toBeNull();
  });
});
