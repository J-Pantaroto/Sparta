import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAsyncData } from "./use-async-data";

function Harness({
  query,
  run
}: {
  query: string;
  run: (query: string, signal: AbortSignal) => Promise<string>;
}) {
  const state = useAsyncData((signal) => run(query, signal), [query]);
  return <span>{state.data ?? state.status}</span>;
}

describe("useAsyncData concorrente", () => {
  it("cancela a requisicao antiga e ignora sua resposta obsoleta", async () => {
    const resolvers = new Map<string, (value: string) => void>();
    const signals = new Map<string, AbortSignal>();
    const run = vi.fn(
      (query: string, signal: AbortSignal) =>
        new Promise<string>((resolve) => {
          signals.set(query, signal);
          resolvers.set(query, resolve);
        })
    );
    const { rerender } = render(<Harness query="draft-1" run={run} />);
    rerender(<Harness query="draft-2" run={run} />);
    expect(signals.get("draft-1")?.aborted).toBe(true);
    resolvers.get("draft-1")?.("resposta antiga");
    resolvers.get("draft-2")?.("resposta atual");
    expect(await screen.findByText("resposta atual")).toBeDefined();
    expect(screen.queryByText("resposta antiga")).toBeNull();
  });
});
