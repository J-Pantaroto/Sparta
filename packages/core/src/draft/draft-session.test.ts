import { describe, expect, it } from "vitest";
import type { DraftState } from "../types/domain.js";
import {
  canTransitionDraftSession,
  compareSelectedChampion,
  decideMatchLink,
  isTerminalDraftSessionStatus,
  summarizeKnownDraftState,
  type DraftSessionStatus
} from "./draft-session.js";

function draft(overrides: Partial<DraftState> = {}): DraftState {
  return {
    playerRole: "JUNGLE",
    playerRoleSource: "LCU",
    pickOrder: 3,
    allies: [],
    enemies: [],
    bannedChampionIds: [],
    ...overrides
  };
}

describe("ciclo de vida da sessão", () => {
  it("permite as transições reais a partir de ACTIVE", () => {
    expect(canTransitionDraftSession("ACTIVE", "LOCKED_IN")).toBe(true);
    expect(canTransitionDraftSession("ACTIVE", "IN_GAME")).toBe(true);
    expect(canTransitionDraftSession("ACTIVE", "ABANDONED")).toBe(true);
  });

  it("ACTIVE não pula direto para COMPLETED", () => {
    // Concluir exige ter passado por lock-in ou partida; sem isso não há o
    // que concluir.
    expect(canTransitionDraftSession("ACTIVE", "COMPLETED")).toBe(false);
  });

  it("sessão encerrada nunca volta para ACTIVE", () => {
    const terminais: DraftSessionStatus[] = ["COMPLETED", "ABANDONED"];
    for (const status of terminais) {
      expect(canTransitionDraftSession(status, "ACTIVE")).toBe(false);
      expect(canTransitionDraftSession(status, "LOCKED_IN")).toBe(false);
      expect(canTransitionDraftSession(status, "IN_GAME")).toBe(false);
      expect(isTerminalDraftSessionStatus(status)).toBe(true);
    }
  });

  it("dodge termina como abandono, e o abandono é final", () => {
    expect(canTransitionDraftSession("LOCKED_IN", "ABANDONED")).toBe(true);
    expect(canTransitionDraftSession("ABANDONED", "COMPLETED")).toBe(false);
  });

  it("permanecer no mesmo estado é permitido (tick repetido não é transição)", () => {
    expect(canTransitionDraftSession("ACTIVE", "ACTIVE")).toBe(true);
    expect(canTransitionDraftSession("IN_GAME", "IN_GAME")).toBe(true);
  });

  it("ACTIVE e LOCKED_IN não são terminais", () => {
    expect(isTerminalDraftSessionStatus("ACTIVE")).toBe(false);
    expect(isTerminalDraftSessionStatus("LOCKED_IN")).toBe(false);
    expect(isTerminalDraftSessionStatus("IN_GAME")).toBe(false);
  });
});

describe("estado conhecido do draft", () => {
  it("conta os picks que ainda faltam em vez de inventar entradas vazias", () => {
    const known = summarizeKnownDraftState(
      draft({
        allies: [{ championId: 103, championName: "Ahri", team: "ally" }],
        enemies: [
          { championId: 64, championName: "Lee Sin", team: "enemy" },
          { championId: 54, championName: "Malphite", team: "enemy" }
        ]
      })
    );

    expect(known.allies).toHaveLength(1);
    expect(known.enemies).toHaveLength(2);
    // 5 - (1 aliado + 0 do jogador) = 4 desconhecidos.
    expect(known.unknownAllyPicks).toBe(4);
    expect(known.unknownEnemyPicks).toBe(3);
  });

  it("o campeão do jogador conta entre os aliados revelados", () => {
    const known = summarizeKnownDraftState(
      draft({
        allies: [{ championId: 103, championName: "Ahri", team: "ally" }],
        selectedChampionId: 234
      })
    );
    expect(known.unknownAllyPicks).toBe(3);
  });

  it("bans são preservados sem lado, porque o contrato não distingue", () => {
    const known = summarizeKnownDraftState(draft({ bannedChampionIds: [55, 91] }));

    expect(known.bannedChampionIds).toEqual([55, 91]);
    expect(known.banSideKnown).toBe(false);
    expect(known.allyBannedChampionIds).toBeUndefined();
    expect(known.enemyBannedChampionIds).toBeUndefined();
  });

  it("adversário direto só aparece quando identificado", () => {
    expect(summarizeKnownDraftState(draft()).directOpponentChampionId).toBeUndefined();
    expect(summarizeKnownDraftState(draft({ enemyLaneChampionId: 64 })).directOpponentChampionId).toBe(64);
  });

  it("posição do aliado é preservada quando conhecida e omitida quando não", () => {
    const known = summarizeKnownDraftState(
      draft({
        allies: [
          { championId: 103, championName: "Ahri", role: "MID", team: "ally" },
          { championId: 222, championName: "Jinx", team: "ally" }
        ]
      })
    );

    expect(known.allies[0].role).toBe("MID");
    expect(known.allies[1].role).toBeUndefined();
  });

  it("não guarda payload bruto: só campos do contrato", () => {
    const known = summarizeKnownDraftState(draft({ bannedChampionIds: [55] }));
    expect(Object.keys(known).sort()).toEqual([
      "allies",
      "banSideKnown",
      "bannedChampionIds",
      "enemies",
      "unknownAllyPicks",
      "unknownEnemyPicks"
    ]);
  });
});

describe("campeão escolhido versus ranking", () => {
  const snapshot = {
    id: "snap-1",
    recommendations: [
      { championId: 234, rank: 1, group: "PRIMARY" as const },
      { championId: 64, rank: 2, group: "PRIMARY" as const },
      { championId: 254, rank: 6, group: "ALTERNATIVE" as const }
    ]
  };

  it("escolha dentro do ranking guarda posição e grupo", () => {
    const comparison = compareSelectedChampion({ selectedChampionId: 64, snapshot });
    expect(comparison).toEqual({
      championId: 64,
      state: "RANKED",
      rank: 2,
      group: "PRIMARY",
      snapshotId: "snap-1"
    });
  });

  it("alternativa preserva o grupo ALTERNATIVE", () => {
    expect(compareSelectedChampion({ selectedChampionId: 254, snapshot }).group).toBe("ALTERNATIVE");
  });

  it("escolha fora do ranking é registrada como fato, sem julgamento", () => {
    const comparison = compareSelectedChampion({ selectedChampionId: 999, snapshot });

    expect(comparison.state).toBe("NOT_IN_SNAPSHOT");
    expect(comparison.rank).toBeUndefined();
    // Nada no contrato classifica a escolha como certa ou errada.
    expect(JSON.stringify(comparison)).not.toMatch(/erro|errad|acert|ruim|melhor/i);
  });

  it("escolha antes de qualquer snapshot preserva só o fato conhecido", () => {
    const comparison = compareSelectedChampion({ selectedChampionId: 234 });

    expect(comparison).toEqual({ championId: 234, state: "NO_SNAPSHOT" });
    expect(comparison.snapshotId).toBeUndefined();
  });
});

describe("vínculo com partida", () => {
  it("vincula com identificador explícito", () => {
    expect(decideMatchLink({ matchId: "BR1_3263128214" })).toEqual({
      state: "LINKED",
      matchId: "BR1_3263128214"
    });
  });

  it("sem identificador permanece sem vínculo, com motivo", () => {
    const decision = decideMatchLink({});
    expect(decision.state).toBe("UNLINKED");
    expect(decision.reason).toBeTruthy();
    expect(decision.matchId).toBeUndefined();
  });

  it("identificador em branco não vira vínculo", () => {
    expect(decideMatchLink({ matchId: "   " }).state).toBe("UNLINKED");
  });
});
