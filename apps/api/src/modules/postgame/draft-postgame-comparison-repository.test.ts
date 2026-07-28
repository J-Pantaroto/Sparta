import { describe, expect, it } from "vitest";
import { hashDraftComparisonInput } from "./draft-postgame-comparison-repository.js";

describe("hashDraftComparisonInput", () => {
  it("é canônico para ordem de chaves e sensível a mudanças reais de fonte", () => {
    const first = hashDraftComparisonInput({
      session: { role: "MID", patch: "16.14" },
      observed: { kills: 0, deaths: 2 },
      signals: ["a", "b"]
    });
    const reordered = hashDraftComparisonInput({
      signals: ["a", "b"],
      observed: { deaths: 2, kills: 0 },
      session: { patch: "16.14", role: "MID" }
    });
    const changed = hashDraftComparisonInput({
      session: { role: "MID", patch: "16.14" },
      observed: { kills: 0, deaths: 3 },
      signals: ["a", "b"]
    });

    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });

  it("preserva a ordem de arrays porque ranking e sinais ordenados são parte do input", () => {
    expect(hashDraftComparisonInput({ ranking: [1, 2] })).not.toBe(
      hashDraftComparisonInput({ ranking: [2, 1] })
    );
  });
});
