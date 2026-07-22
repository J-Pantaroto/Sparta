import { describe, expect, it } from "vitest";
import { derivePickOrder } from "./pick-order.js";
import type { LcuChampionSelectSnapshot } from "./read-only-client.js";

const myTeam = [
  { cellId: 0, championId: 1 },
  { cellId: 1, championId: 2 },
  { cellId: 2, championId: 3 },
  { cellId: 3, championId: 4 },
  { cellId: 4, championId: 5 }
];
const theirTeam = [
  { cellId: 5, championId: 6 },
  { cellId: 6, championId: 7 },
  { cellId: 7, championId: 8 },
  { cellId: 8, championId: 9 },
  { cellId: 9, championId: 10 }
];

function action(actorCellId: number, completed: boolean, type = "pick") {
  return { actorCellId, type, completed };
}

describe("derivePickOrder", () => {
  it("retorna undefined quando a sessao nao existe", () => {
    const snapshot: LcuChampionSelectSnapshot = { sessionExists: false };
    expect(derivePickOrder(snapshot)).toBeUndefined();
  });

  it("retorna undefined quando localPlayerCellId ainda nao esta disponivel (sessao carregando)", () => {
    const snapshot: LcuChampionSelectSnapshot = { sessionExists: true, actions: [], myTeam };
    expect(derivePickOrder(snapshot)).toBeUndefined();
  });

  it("retorna undefined quando a propria acao de pick ainda nao apareceu no historico", () => {
    const snapshot: LcuChampionSelectSnapshot = {
      sessionExists: true,
      localPlayerCellId: 2,
      actions: [[action(5, true, "ban")]],
      myTeam,
      theirTeam
    };
    expect(derivePickOrder(snapshot)).toBeUndefined();
  });

  it("retorna 1 (blind pick) quando nenhum companheiro de time pickou antes", () => {
    const snapshot: LcuChampionSelectSnapshot = {
      sessionExists: true,
      localPlayerCellId: 0,
      actions: [[action(0, false, "pick")]],
      myTeam,
      theirTeam
    };
    expect(derivePickOrder(snapshot)).toBe(1);
  });

  it("conta so picks completed de companheiros de time antes da propria acao", () => {
    const snapshot: LcuChampionSelectSnapshot = {
      sessionExists: true,
      localPlayerCellId: 3,
      actions: [
        [action(0, true, "pick")], // companheiro, completed - conta
        [action(5, true, "pick")], // inimigo - nao conta
        [action(1, false, "pick")], // companheiro, hover (nao completed) - nao conta
        [action(3, false, "pick")] // propria acao (ainda hover, mas ja aparece no historico)
      ],
      myTeam,
      theirTeam
    };
    expect(derivePickOrder(snapshot)).toBe(2);
  });

  it("ignora bans na contagem, so considera acoes do tipo pick", () => {
    const snapshot: LcuChampionSelectSnapshot = {
      sessionExists: true,
      localPlayerCellId: 2,
      actions: [
        [action(0, true, "ban")],
        [action(1, true, "pick")],
        [action(2, false, "pick")]
      ],
      myTeam,
      theirTeam
    };
    expect(derivePickOrder(snapshot)).toBe(2);
  });

  it("nao e afetado por trocas de campeao (championId), so importa o actorCellId", () => {
    const tradedTeam = myTeam.map((member) => (member.cellId === 1 ? { ...member, championId: 999 } : member));
    const snapshot: LcuChampionSelectSnapshot = {
      sessionExists: true,
      localPlayerCellId: 2,
      actions: [[action(1, true, "pick")], [action(2, false, "pick")]],
      myTeam: tradedTeam,
      theirTeam
    };
    expect(derivePickOrder(snapshot)).toBe(2);
  });
});
