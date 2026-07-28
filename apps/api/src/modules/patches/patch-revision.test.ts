import { describe, expect, it } from "vitest";
import { decidePatchRevision } from "./patch-revision.js";

describe("histórico de revisão das notas oficiais", () => {
  it("não duplica o mesmo conteúdo canônico", () => {
    expect(decidePatchRevision([{ sourceHash: "same", revision: 1 }], "same")).toEqual({
      content: "UNCHANGED",
      revision: 1
    });
  });

  it("preserva a revisão anterior quando a Riot edita a página", () => {
    const existing = [
      { sourceHash: "v2", revision: 2 },
      { sourceHash: "v1", revision: 1 }
    ];
    expect(decidePatchRevision(existing, "v3")).toEqual({
      content: "REVISION",
      revision: 3
    });
    expect(existing).toEqual([
      { sourceHash: "v2", revision: 2 },
      { sourceHash: "v1", revision: 1 }
    ]);
  });

  it("marca a primeira evidência como conteúdo novo", () => {
    expect(decidePatchRevision([], "v1")).toEqual({ content: "NEW", revision: 1 });
  });
});
