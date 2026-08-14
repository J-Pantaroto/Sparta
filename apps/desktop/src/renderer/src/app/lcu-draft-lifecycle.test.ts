import { describe, expect, it } from "vitest";
import type { DraftState } from "@sparta/core";
import type { LcuDraftSnapshot } from "@sparta/riot";
import { acceptLcuDraftObservation, clearObservedLcuDraft } from "./lcu-draft-lifecycle";

const oldDraft: LcuDraftSnapshot = {
  allies: [{ championId: 61 }],
  enemies: [{ championId: 238 }],
  bannedChampionIds: [64],
  selectedChampionId: 234,
  selectedChampionLocked: false
};

describe("lifecycle versionado do draft LCU", () => {
  it("descarta resposta atrasada da sessão anterior", () => {
    const unavailable = acceptLcuDraftObservation(
      { revision: 7, draft: oldDraft },
      { revision: 8, draft: null }
    );
    const delayedOldSession = acceptLcuDraftObservation(unavailable, {
      revision: 7,
      draft: oldDraft
    });

    expect(delayedOldSession).toEqual({ revision: 8, draft: null });
  });

  it("troca de sessão aceita somente o snapshot da revisão nova", () => {
    const newDraft: LcuDraftSnapshot = {
      allies: [{ championId: 103 }],
      enemies: [],
      bannedChampionIds: [],
      selectedChampionLocked: false
    };
    const state = acceptLcuDraftObservation(
      { revision: 8, draft: null },
      { revision: 9, draft: newDraft }
    );

    expect(state.revision).toBe(9);
    expect(state.draft?.allies).toEqual([{ championId: 103 }]);
    expect(state.draft?.allies).not.toContainEqual({ championId: 61 });
  });

  it("indisponibilidade remove todos os campos observados, preservando papel manual", () => {
    const current: DraftState = {
      playerRole: "MID",
      playerRoleSource: "USER",
      pickOrder: 4,
      allies: [{ championId: 61, championName: "Orianna", team: "ally" }],
      enemies: [{ championId: 238, championName: "Zed", team: "enemy" }],
      bannedChampionIds: [64],
      enemyLaneChampionId: 238,
      selectedChampionId: 234
    };

    expect(clearObservedLcuDraft(current)).toEqual({
      playerRole: "MID",
      playerRoleSource: "USER",
      pickOrder: 1,
      allies: [],
      enemies: [],
      bannedChampionIds: [],
      enemyLaneChampionId: undefined,
      selectedChampionId: undefined
    });
  });
});
