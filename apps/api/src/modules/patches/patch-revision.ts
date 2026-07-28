export function decidePatchRevision(
  existing: ReadonlyArray<{ sourceHash: string; revision: number }>,
  sourceHash: string
): { content: "UNCHANGED"; revision: number } | { content: "NEW" | "REVISION"; revision: number } {
  const unchanged = existing.find((revision) => revision.sourceHash === sourceHash);
  if (unchanged) return { content: "UNCHANGED", revision: unchanged.revision };
  const revision = Math.max(0, ...existing.map((entry) => entry.revision)) + 1;
  return { content: revision === 1 ? "NEW" : "REVISION", revision };
}
