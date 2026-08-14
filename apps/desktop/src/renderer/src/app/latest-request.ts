export interface LatestRequestTicket {
  readonly identity: string;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  commit(effect: () => void): boolean;
}

/** Coordena uma única seleção ativa e invalida todos os commits anteriores. */
export class LatestRequestCoordinator {
  private revision = 0;
  private active: { identity: string; revision: number; controller: AbortController } | null = null;

  begin(identity: string): LatestRequestTicket {
    this.active?.controller.abort();
    const active = { identity, revision: ++this.revision, controller: new AbortController() };
    this.active = active;
    return this.ticket(active);
  }

  current(identity: string): LatestRequestTicket | null {
    return this.active?.identity === identity ? this.ticket(this.active) : null;
  }

  cancel(): void {
    this.active?.controller.abort();
    this.active = null;
    this.revision += 1;
  }

  private ticket(active: {
    identity: string;
    revision: number;
    controller: AbortController;
  }): LatestRequestTicket {
    const isCurrent = () =>
      this.active?.revision === active.revision &&
      this.active.identity === active.identity &&
      !active.controller.signal.aborted;
    return {
      identity: active.identity,
      signal: active.controller.signal,
      isCurrent,
      commit(effect) {
        if (!isCurrent()) return false;
        effect();
        return true;
      }
    };
  }
}
