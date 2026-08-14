import { describe, expect, it } from "vitest";
import { LatestRequestCoordinator } from "./latest-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("coordenação da seleção mais recente", () => {
  it("A inicia, B termina e A tardia nunca sobrescreve B", async () => {
    const coordinator = new LatestRequestCoordinator();
    const a = deferred<string>();
    const b = deferred<string>();
    let state = "idle";
    const load = async (identity: string, promise: Promise<string>) => {
      const ticket = coordinator.begin(identity);
      ticket.commit(() => (state = `loading:${identity}`));
      const value = await promise;
      ticket.commit(() => (state = value));
      return ticket;
    };

    const loadA = load("A", a.promise);
    const loadB = load("B", b.promise);
    b.resolve("result:B");
    await loadB;
    a.resolve("result:A");
    const ticketA = await loadA;

    expect(ticketA.signal.aborted).toBe(true);
    expect(state).toBe("result:B");
  });

  it("erro tardio da seleção anterior não altera o erro atual", async () => {
    const coordinator = new LatestRequestCoordinator();
    const a = deferred<string>();
    let error: string | null = null;
    const ticketA = coordinator.begin("A");
    const pendingA = a.promise.catch((cause: Error) =>
      ticketA.commit(() => (error = cause.message))
    );
    const ticketB = coordinator.begin("B");
    ticketB.commit(() => (error = null));
    a.reject(new Error("erro de A"));
    await pendingA;

    expect(error).toBeNull();
    expect(ticketB.isCurrent()).toBe(true);
  });

  it("cancelamento da tela bloqueia commits pendentes", () => {
    const coordinator = new LatestRequestCoordinator();
    const ticket = coordinator.begin("A");
    let committed = false;
    coordinator.cancel();

    expect(ticket.signal.aborted).toBe(true);
    expect(ticket.commit(() => (committed = true))).toBe(false);
    expect(committed).toBe(false);
  });
});
