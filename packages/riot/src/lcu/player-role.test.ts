import { describe, expect, it } from "vitest";
import { derivePlayerRole } from "./player-role.js";
import type { LcuChampionSelectSnapshot } from "./read-only-client.js";

function member(cellId: number, assignedPosition?: string) {
  return { cellId, championId: cellId + 1, assignedPosition };
}

describe("derivePlayerRole", () => {
  it("retorna undefined quando a sessao nao existe", () => {
    expect(derivePlayerRole({ sessionExists: false })).toBeUndefined();
  });

  it("retorna undefined quando localPlayerCellId ainda nao esta disponivel", () => {
    const snapshot: LcuChampionSelectSnapshot = { sessionExists: true, myTeam: [member(0, "top")] };
    expect(derivePlayerRole(snapshot)).toBeUndefined();
  });

  it("retorna undefined quando o jogador local nao esta em myTeam", () => {
    const snapshot: LcuChampionSelectSnapshot = {
      sessionExists: true,
      localPlayerCellId: 9,
      myTeam: [member(0, "top"), member(1, "jungle")]
    };
    expect(derivePlayerRole(snapshot)).toBeUndefined();
  });

  it("retorna undefined quando a posicao vem vazia (blind pick/ARAM)", () => {
    const snapshot: LcuChampionSelectSnapshot = {
      sessionExists: true,
      localPlayerCellId: 0,
      myTeam: [member(0, "")]
    };
    expect(derivePlayerRole(snapshot)).toBeUndefined();
  });

  it("retorna undefined pra uma posicao desconhecida", () => {
    const snapshot: LcuChampionSelectSnapshot = {
      sessionExists: true,
      localPlayerCellId: 0,
      myTeam: [member(0, "fill")]
    };
    expect(derivePlayerRole(snapshot)).toBeUndefined();
  });

  it("mapeia cada posicao do LCU pro Role do Sparta", () => {
    const cases: Array<[string, string]> = [
      ["top", "TOP"],
      ["jungle", "JUNGLE"],
      ["middle", "MID"],
      ["bottom", "ADC"],
      ["utility", "SUPPORT"]
    ];
    for (const [position, role] of cases) {
      const snapshot: LcuChampionSelectSnapshot = {
        sessionExists: true,
        localPlayerCellId: 0,
        myTeam: [member(0, position)]
      };
      expect(derivePlayerRole(snapshot)).toBe(role);
    }
  });

  it("aceita a posicao em maiuscula (case-insensitive)", () => {
    const snapshot: LcuChampionSelectSnapshot = {
      sessionExists: true,
      localPlayerCellId: 0,
      myTeam: [member(0, "JUNGLE")]
    };
    expect(derivePlayerRole(snapshot)).toBe("JUNGLE");
  });

  it("reflete a troca de lane so relendo o snapshot (sem estado extra)", () => {
    // Antes: jogador local (cell 0) e MID, colega (cell 1) e TOP.
    const before: LcuChampionSelectSnapshot = {
      sessionExists: true,
      localPlayerCellId: 0,
      myTeam: [member(0, "middle"), member(1, "top")]
    };
    expect(derivePlayerRole(before)).toBe("MID");

    // Depois da troca pela ferramenta do cliente: os assignedPosition trocam.
    const after: LcuChampionSelectSnapshot = {
      sessionExists: true,
      localPlayerCellId: 0,
      myTeam: [member(0, "top"), member(1, "middle")]
    };
    expect(derivePlayerRole(after)).toBe("TOP");
  });
});

describe("mapeamento de posição do LCU (Etapa 6)", () => {
  function comPosicao(assignedPosition: unknown) {
    return {
      sessionExists: true,
      localPlayerCellId: 1,
      myTeam: [{ cellId: 1, championId: 0, assignedPosition }]
    } as unknown as Parameters<typeof derivePlayerRole>[0];
  }

  it("mapeia os cinco valores reconhecidos", () => {
    expect(derivePlayerRole(comPosicao("top"))).toBe("TOP");
    expect(derivePlayerRole(comPosicao("jungle"))).toBe("JUNGLE");
    expect(derivePlayerRole(comPosicao("middle"))).toBe("MID");
    expect(derivePlayerRole(comPosicao("bottom"))).toBe("ADC");
    expect(derivePlayerRole(comPosicao("utility"))).toBe("SUPPORT");
  });

  it("aceita as variações de caixa que o cliente usa", () => {
    expect(derivePlayerRole(comPosicao("MIDDLE"))).toBe("MID");
    expect(derivePlayerRole(comPosicao("Utility"))).toBe("SUPPORT");
  });

  // Cada um destes viraria MID se a tabela tivesse um fallback.
  it.each([
    ["unselected", "UNSELECTED"],
    ["unknown", "UNKNOWN"],
    ["string vazia", ""],
    ["só espaços", "   "],
    ["valor não reconhecido", "SUPPORT_ROAMING"],
    ["campo ausente", undefined]
  ])("%s produz posição ausente, nunca MID", (_rotulo, valor) => {
    const role = derivePlayerRole(comPosicao(valor));
    expect(role).toBeUndefined();
    expect(role).not.toBe("MID");
  });

  it("sem sessão ou sem o jogador local fica ausente", () => {
    expect(
      derivePlayerRole({ sessionExists: false } as unknown as Parameters<typeof derivePlayerRole>[0])
    ).toBeUndefined();
    expect(
      derivePlayerRole({
        sessionExists: true,
        localPlayerCellId: 9,
        myTeam: [{ cellId: 1, championId: 0, assignedPosition: "middle" }]
      } as unknown as Parameters<typeof derivePlayerRole>[0])
    ).toBeUndefined();
  });
});
