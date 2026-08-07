import { describe, expect, it } from "vitest";
import { deriveDraftSnapshot, isSameDraftSnapshot } from "./draft-snapshot.js";
import type { LcuChampionSelectSnapshot } from "./read-only-client.js";

/**
 * Sessao no formato que o LCU devolve em `/lol-champ-select/v1/session`:
 * o jogador local (cellId 0) e JUNGLE, dois companheiros ja escolheram, o
 * time inimigo tem tres revelados e houve dois bans concluidos.
 */
function sessaoCompleta(): LcuChampionSelectSnapshot {
  return {
    sessionExists: true,
    localPlayerCellId: 0,
    myTeam: [
      { cellId: 0, championId: 234, assignedPosition: "jungle" },
      { cellId: 1, championId: 103, assignedPosition: "middle" },
      { cellId: 2, championId: 0, assignedPosition: "top" },
      { cellId: 3, championId: 222, assignedPosition: "bottom" }
    ],
    theirTeam: [
      { cellId: 5, championId: 64, assignedPosition: "jungle" },
      { cellId: 6, championId: 157, assignedPosition: "middle" },
      { cellId: 7, championId: 0, assignedPosition: "utility" }
    ],
    actions: [
      [
        { actorCellId: 0, type: "ban", completed: true, championId: 55 },
        { actorCellId: 5, type: "ban", completed: true, championId: 91 }
      ],
      [
        { actorCellId: 1, type: "ban", completed: false, championId: 0 },
        { actorCellId: 0, type: "pick", completed: true, championId: 234 }
      ]
    ]
  };
}

describe("deriveDraftSnapshot", () => {
  it("retorna undefined sem sessao - o chamador mantem o que tinha", () => {
    expect(deriveDraftSnapshot({ sessionExists: false })).toBeUndefined();
  });

  it("separa aliados e inimigos ja revelados", () => {
    const draft = deriveDraftSnapshot(sessaoCompleta())!;
    expect(draft.allies.map((ally) => ally.championId)).toEqual([103, 222]);
    expect(draft.enemies.map((enemy) => enemy.championId)).toEqual([64, 157]);
  });

  it("nao inclui o proprio jogador entre os aliados", () => {
    const draft = deriveDraftSnapshot(sessaoCompleta())!;
    expect(draft.allies.map((ally) => ally.championId)).not.toContain(234);
    expect(draft.selectedChampionId).toBe(234);
    expect(draft.selectedChampionLocked).toBe(true);
  });

  it("descarta quem ainda nao escolheu (championId 0)", () => {
    const draft = deriveDraftSnapshot(sessaoCompleta())!;
    expect(draft.allies).toHaveLength(2);
    expect(draft.enemies).toHaveLength(2);
  });

  it("traduz a posicao do LCU pro Role do Sparta", () => {
    const draft = deriveDraftSnapshot(sessaoCompleta())!;
    expect(draft.allies.map((ally) => ally.position)).toEqual(["MID", "ADC"]);
    expect(draft.enemies.map((enemy) => enemy.position)).toEqual(["JUNGLE", "MID"]);
  });

  it("coleta so bans concluidos, dos dois times, sem duplicar", () => {
    const draft = deriveDraftSnapshot(sessaoCompleta())!;
    expect(draft.bannedChampionIds).toEqual([55, 91]);
  });

  it("identifica o inimigo da mesma posicao do jogador", () => {
    const draft = deriveDraftSnapshot(sessaoCompleta())!;
    // Jogador e jungle; o jungle inimigo e o 64.
    expect(draft.enemyLaneChampionId).toBe(64);
  });

  it("deixa o inimigo de rota indefinido quando a fila nao atribui posicao", () => {
    const sessao = sessaoCompleta();
    sessao.myTeam = sessao.myTeam!.map((member) => ({ ...member, assignedPosition: "" }));
    sessao.theirTeam = sessao.theirTeam!.map((member) => ({ ...member, assignedPosition: "" }));

    const draft = deriveDraftSnapshot(sessao)!;
    expect(draft.enemyLaneChampionId).toBeUndefined();
    // Os campeoes continuam vindo - so a posicao e que e desconhecida.
    expect(draft.enemies).toHaveLength(2);
    expect(draft.enemies[0].position).toBeUndefined();
  });

  it("nao reporta campeao proprio antes do jogador escolher", () => {
    const sessao = sessaoCompleta();
    sessao.myTeam![0].championId = 0;
    expect(deriveDraftSnapshot(sessao)!.selectedChampionId).toBeUndefined();
    expect(deriveDraftSnapshot(sessao)!.selectedChampionLocked).toBe(false);
  });

  it("distingue campeao selecionado de pick travado", () => {
    const sessao = sessaoCompleta();
    sessao.actions = sessao.actions!.map((round) =>
      round.map((action) =>
        action.actorCellId === 0 && action.type === "pick"
          ? { ...action, completed: false }
          : action
      )
    );
    const draft = deriveDraftSnapshot(sessao)!;
    expect(draft.selectedChampionId).toBe(234);
    expect(draft.selectedChampionLocked).toBe(false);
  });

  it("aguenta sessao recem-criada, ainda sem times nem acoes", () => {
    const draft = deriveDraftSnapshot({ sessionExists: true, localPlayerCellId: 0 })!;
    expect(draft.allies).toEqual([]);
    expect(draft.enemies).toEqual([]);
    expect(draft.bannedChampionIds).toEqual([]);
    expect(draft.selectedChampionId).toBeUndefined();
  });

  it("reflete um pick novo do inimigo entre dois ticks, sem estado extra", () => {
    const antes = deriveDraftSnapshot(sessaoCompleta())!;
    const sessao = sessaoCompleta();
    sessao.theirTeam![2].championId = 412;
    const depois = deriveDraftSnapshot(sessao)!;

    expect(antes.enemies).toHaveLength(2);
    expect(depois.enemies).toHaveLength(3);
    expect(depois.enemies[2].championId).toBe(412);
  });
});

describe("isSameDraftSnapshot", () => {
  it("considera iguais dois ticks sem mudanca", () => {
    expect(
      isSameDraftSnapshot(
        deriveDraftSnapshot(sessaoCompleta()),
        deriveDraftSnapshot(sessaoCompleta())
      )
    ).toBe(true);
  });

  it("detecta um pick novo", () => {
    const sessao = sessaoCompleta();
    sessao.theirTeam![2].championId = 412;
    expect(
      isSameDraftSnapshot(deriveDraftSnapshot(sessaoCompleta()), deriveDraftSnapshot(sessao))
    ).toBe(false);
  });

  it("trata undefined dos dois lados como igual", () => {
    expect(isSameDraftSnapshot(undefined, undefined)).toBe(true);
    expect(isSameDraftSnapshot(undefined, deriveDraftSnapshot(sessaoCompleta()))).toBe(false);
  });
});
