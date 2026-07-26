import { describe, expect, it } from "vitest";
import type { PlayerChampionStats } from "@sparta/core";
import { ensureChampionStatsCoverage } from "./api-client";

/**
 * Compatibilidade com uma API anterior a Etapa 4: desktop e API sao
 * implantados separadamente, entao a resposta pode nao trazer `coverage`.
 */
const legado = {
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
  objectiveParticipation: 0,
  recentMatches: []
} as unknown as PlayerChampionStats;

describe("ensureChampionStatsCoverage", () => {
  it("converte o zero de participação em objetivos, que é provadamente artificial", () => {
    // O mapper do Match-V5 nunca preencheu esse campo: medido no banco real,
    // 0 de 220 participantes tinham o dado.
    const normalizado = ensureChampionStatsCoverage(legado);
    expect(normalizado.objectiveParticipation).toBeNull();
    expect(normalizado.coverage.objectiveParticipation.status).toBe("UNAVAILABLE");
    expect(normalizado.coverage.objectiveParticipation.reason).toBeDefined();
  });

  it("NÃO mexe num killParticipation zero: ali o zero pode ser real", () => {
    const normalizado = ensureChampionStatsCoverage({ ...legado, killParticipation: 0 });
    expect(normalizado.killParticipation).toBe(0);
    expect(normalizado.coverage.killParticipation.status).not.toBe("UNAVAILABLE");
  });

  it("não inventa cobertura: amostra disponível fica desconhecida, não zero", () => {
    const normalizado = ensureChampionStatsCoverage(legado);
    expect(normalizado.coverage.killParticipation.availableSampleSize).toBeNull();
    expect(normalizado.coverage.killParticipation.sampleSize).toBe(8);
  });

  it("marca killParticipation ausente como indisponível, sem virar zero", () => {
    const normalizado = ensureChampionStatsCoverage({ ...legado, killParticipation: null });
    expect(normalizado.killParticipation).toBeNull();
    expect(normalizado.coverage.killParticipation.status).toBe("UNAVAILABLE");
  });

  it("deixa passar intacta uma resposta que já traz cobertura", () => {
    const novo = {
      ...legado,
      objectiveParticipation: 0.42,
      coverage: {
        killParticipation: { sampleSize: 8, availableSampleSize: 8, status: "AVAILABLE" as const },
        objectiveParticipation: { sampleSize: 8, availableSampleSize: 8, status: "AVAILABLE" as const }
      }
    } as PlayerChampionStats;
    expect(ensureChampionStatsCoverage(novo)).toBe(novo);
    expect(ensureChampionStatsCoverage(novo).objectiveParticipation).toBe(0.42);
  });
});
