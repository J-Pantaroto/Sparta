import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DraftPostGameComparison } from "@sparta/core";
import type { ChampionRoleEvidenceResponse, DraftComparisonResponse } from "../services/api-client";
import { ChampionRoleEvidenceCard, DraftComparisonSection } from "./PostGameScreen";

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

function comparisonResponse(): DraftComparisonResponse {
  const report = {
    draftSessionId: "draft-1",
    matchId: "BR1_1",
    status: "PARTIAL",
    coverage: 0.75,
    selectedChoice: {
      championId: 234,
      championName: "Viego",
      group: "PRIMARY",
      rank: 2,
      score: 71,
      coverage: 0.82,
      strategicSignals: ["O draft registrava necessidade de engage."],
      knownLimitations: [],
      unavailableMetricKeys: []
    },
    observedMatch: {
      championId: 234,
      championName: "Viego",
      won: false,
      observedRole: "JUNGLE",
      positionStatus: "AVAILABLE",
      kills: 3,
      deaths: 7,
      assists: 5,
      kda: 8 / 7,
      csPerMinute: 6,
      goldPerMinute: 380,
      damagePerMinute: 500,
      visionScorePerMinute: 0.7,
      deathsBefore10: 2,
      objectiveParticipation: 0,
      finalItems: [],
      runeIds: [],
      summonerSpellIds: []
    },
    comparableSignals: [
      {
        id: "position",
        key: "POSITION_ALIGNMENT",
        status: "AVAILABLE",
        statement: "A posição observada corresponde à posição usada no draft.",
        limitation: "Não demonstra causalidade."
      }
    ],
    unavailableSignals: [
      {
        id: "matchup",
        key: "PERSONAL_MATCHUP_AND_RESULT",
        status: "UNAVAILABLE",
        statement: "Comparação indisponível.",
        limitation: "Não demonstra causalidade.",
        unavailableReason: "O adversário direto não pôde ser confirmado."
      }
    ]
  } as unknown as DraftPostGameComparison;
  return { state: "PARTIAL", draftSessionId: "draft-1", report };
}

describe("DraftComparisonSection", () => {
  it("separa escolha histórica, observação e limitações sem julgar o resultado", () => {
    render(<DraftComparisonSection response={comparisonResponse()} />);

    expect(screen.getByText("Draft versus partida")).toBeTruthy();
    expect(screen.getByText(/Viego · 2º lugar · principal/)).toBeTruthy();
    expect(screen.getByText(/Cobertura da análise no draft: 82%/)).toBeTruthy();
    expect(screen.getByText(/Derrota · 3\/7\/5/)).toBeTruthy();
    expect(screen.getByText(/adversário direto não pôde ser confirmado/i)).toBeTruthy();
    expect(screen.getByText(/Correspondência não significa causalidade/)).toBeTruthy();
    expect(screen.queryByText(/recomendação (certa|errada)/i)).toBeNull();
  });

  it("sem vínculo preserva o resumo observado sem inventar contexto de draft", () => {
    render(
      <DraftComparisonSection
        response={{
          state: "MATCH_NOT_LINKED",
          report: null,
          reason: "Nenhuma sessão de draft vinculada a esta partida."
        }}
      />
    );

    expect(screen.getByText(/Nenhuma sessão de draft vinculada/)).toBeTruthy();
    expect(screen.getByText(/sem inventar contexto de draft/)).toBeTruthy();
  });
});
