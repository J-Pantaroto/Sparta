import type { DraftState } from "@sparta/core";
import type { LcuDraftSnapshot } from "@sparta/riot";

export interface VersionedLcuDraft {
  revision: number;
  draft: LcuDraftSnapshot | null;
}

/** Uma observação atrasada nunca volta o relógio da sessão local. */
export function acceptLcuDraftObservation(
  current: VersionedLcuDraft,
  incoming: VersionedLcuDraft
): VersionedLcuDraft {
  return incoming.revision < current.revision ? current : incoming;
}

/**
 * Remove somente o contexto que pode ter vindo do LCU. O chamador só usa
 * esta função depois de ter aplicado uma observação automática, preservando
 * o modo manual quando nenhuma sessão real participou.
 */
export function clearObservedLcuDraft(draft: DraftState): DraftState {
  return {
    ...draft,
    playerRole: draft.playerRoleSource === "LCU" ? undefined : draft.playerRole,
    playerRoleSource: draft.playerRoleSource === "LCU" ? undefined : draft.playerRoleSource,
    pickOrder: 1,
    allies: [],
    enemies: [],
    bannedChampionIds: [],
    enemyLaneChampionId: undefined,
    selectedChampionId: undefined
  };
}
