import { describe, expect, it } from "vitest";
import {
  GLOBAL_ROLE_ELIGIBILITY_UNAVAILABLE_REASON,
  adaptLegacyChampionRoleField,
  aggregatePlayerChampionRoleEvidence,
  unavailableGlobalChampionRoleEligibility,
  type PlayerChampionRoleObservationRecord
} from "./champion-role-evidence.js";

const records: PlayerChampionRoleObservationRecord[] = [
  {
    championId: 161,
    role: "SUPPORT",
    won: true,
    playedAt: "2025-01-10T12:00:00.000Z",
    patch: "15.1",
    queueId: 420,
    gameMode: "CLASSIC",
    gameType: "MATCHED_GAME",
    extractorVersion: "match-observation/1.0.0",
    normalizationSource: "TEAM_POSITION"
  },
  {
    championId: 161,
    role: "SUPPORT",
    won: false,
    playedAt: "2026-07-20T12:00:00.000Z",
    patch: "16.14",
    queueId: 400,
    gameMode: "CLASSIC",
    gameType: "MATCHED_GAME",
    extractorVersion: "match-observation/1.0.0",
    normalizationSource: "INDIVIDUAL_POSITION"
  },
  {
    championId: 161,
    won: true,
    playedAt: "2026-07-21T12:00:00.000Z",
    patch: "16.14",
    queueId: 420,
    gameMode: "CLASSIC",
    gameType: "MATCHED_GAME",
    extractorVersion: "match-observation/1.0.0"
  }
];

describe("player champion role evidence", () => {
  it("uma partida de Vel'Koz suporte cria evidência pessoal, não elegibilidade global", () => {
    const personal = aggregatePlayerChampionRoleEvidence(records.slice(0, 1), {
      championId: 161,
      role: "SUPPORT"
    });
    const global = unavailableGlobalChampionRoleEligibility(161, "SUPPORT");

    expect(personal).toMatchObject({
      status: "AVAILABLE",
      games: 1,
      wins: 1,
      losses: 0,
      queueIds: [420],
      patches: ["15.1"],
      normalization: { sources: ["TEAM_POSITION"] }
    });
    expect(global).toEqual({
      championId: 161,
      role: "SUPPORT",
      status: "UNAVAILABLE",
      eligible: null,
      unavailableReason: GLOBAL_ROLE_ELIGIBILITY_UNAVAILABLE_REASON
    });
  });

  it("zero partidas permanece indisponível, com amostra zero e sem confiança inventada", () => {
    const evidence = aggregatePlayerChampionRoleEvidence(records, {
      championId: 161,
      role: "MID"
    });

    expect(evidence.status).toBe("UNAVAILABLE");
    expect(evidence.games).toBe(0);
    expect(evidence.lastPlayedAt).toBeNull();
    expect(evidence.provenance.sampleSize).toBe(0);
    expect(evidence.provenance).not.toHaveProperty("confidence");
  });

  it("posição ausente não vira MID e filtros de patch, fila e data são auditáveis", () => {
    const evidence = aggregatePlayerChampionRoleEvidence(records, {
      championId: 161,
      role: "SUPPORT",
      patches: ["16.14"],
      queueIds: [400],
      playedAtFrom: "2026-01-01T00:00:00.000Z"
    });

    expect(evidence.games).toBe(1);
    expect(evidence.queueIds).toEqual([400]);
    expect(evidence.patches).toEqual(["16.14"]);
    expect(evidence.lastPlayedAt).toBe("2026-07-20T12:00:00.000Z");
  });

  it("amostra antiga continua factual e múltiplas filas ficam explícitas", () => {
    const evidence = aggregatePlayerChampionRoleEvidence(records, {
      championId: 161,
      role: "SUPPORT"
    });

    expect(evidence.games).toBe(2);
    expect(evidence.queueIds).toEqual([400, 420]);
    expect(evidence).not.toHaveProperty("recent");
  });

  it("campo legado fica com semântica desconhecida e não vira contrato global", () => {
    const legacy = adaptLegacyChampionRoleField(["MID", "MID", "INVALID"]);

    expect(legacy).toEqual({ values: ["MID"], semantics: "UNKNOWN" });
    expect(legacy).not.toHaveProperty("eligible");
    expect(legacy).not.toHaveProperty("provenance");
  });

  it("Smite observado não cria elegibilidade global de jungle", () => {
    const global = unavailableGlobalChampionRoleEligibility(161, "JUNGLE");

    expect(global.status).toBe("UNAVAILABLE");
    expect(global.eligible).toBeNull();
    expect(global).not.toHaveProperty("summonerSpells");
  });
});
