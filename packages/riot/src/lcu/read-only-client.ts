export interface LcuChampionSelectSnapshot {
  sessionExists: boolean;
  localPlayerCellId?: number;
  actions?: unknown[];
  myTeam?: unknown[];
  theirTeam?: unknown[];
}

export class LcuReadOnlyClient {
  async getChampionSelectSession(): Promise<LcuChampionSelectSnapshot> {
    return {
      sessionExists: false
    };
  }
}
