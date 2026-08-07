import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { fetchReplayBundleSummaryMock, verifySnapshotReplayMock } = vi.hoisted(() => ({
  fetchReplayBundleSummaryMock: vi.fn(),
  verifySnapshotReplayMock: vi.fn()
}));

vi.mock("../services/api-client", () => ({
  fetchReplayBundleSummary: fetchReplayBundleSummaryMock,
  verifySnapshotReplay: verifySnapshotReplayMock
}));

import { ReplayCapabilitySummary } from "./ReplayCapabilitySummary";

function bundleSummary(overrides: Record<string, unknown> = {}) {
  return {
    snapshotId: "snap-1",
    hasBundle: true,
    capability: "FULL_DERIVATION_REPLAY_AVAILABLE",
    reason: "Replay completo disponível.",
    reweightAvailable: true,
    bundleSchemaVersion: "replay-input-bundle/2.0.0",
    missingDependencies: [],
    ...overrides
  };
}

describe("ReplayCapabilitySummary", () => {
  it("EXACT_REPLAY sem divergência não mostra tabela nenhuma", async () => {
    fetchReplayBundleSummaryMock.mockResolvedValue(bundleSummary());
    verifySnapshotReplayMock.mockResolvedValue({
      snapshotId: "snap-1",
      status: "EXACT_REPLAY",
      divergences: [],
      missingDependencies: [],
      capability: "FULL_DERIVATION_REPLAY_AVAILABLE",
      reason: "Replay completo disponível.",
      reweightAvailable: true
    });

    render(<ReplayCapabilitySummary token="token-1" snapshotId="snap-1" />);
    await waitFor(() => expect(screen.getByText("Verificar replay")).toBeTruthy());
    fireEvent.click(screen.getByText("Verificar replay"));

    await waitFor(() => expect(verifySnapshotReplayMock).toHaveBeenCalled());
    expect(screen.queryByText(/divergência\(s\)/)).toBeNull();
  });

  it("divergência mostra tabela com campo esperado vs obtido", async () => {
    fetchReplayBundleSummaryMock.mockResolvedValue(bundleSummary());
    verifySnapshotReplayMock.mockResolvedValue({
      snapshotId: "snap-1",
      status: "REPLAY_INTEGRITY_FAILED",
      divergences: [
        { championId: 234, field: "totalScore", expected: 58.7, reconstructed: 60.4, delta: 1.7 },
        { championId: 234, field: "metric.PERSONAL_PERFORMANCE", expected: 0.5, reconstructed: 0.4, delta: 0.1 }
      ],
      missingDependencies: [],
      capability: "FULL_DERIVATION_REPLAY_AVAILABLE",
      reason: "Replay completo disponível.",
      reweightAvailable: true
    });

    render(<ReplayCapabilitySummary token="token-1" snapshotId="snap-1" />);
    await waitFor(() => expect(screen.getByText("Verificar replay")).toBeTruthy());
    fireEvent.click(screen.getByText("Verificar replay"));

    await waitFor(() => expect(screen.getByText(/2 divergência\(s\)/)).toBeTruthy());
    expect(screen.getAllByText("Campeão #234")).toHaveLength(2);
    expect(screen.getByText("Score")).toBeTruthy();
    expect(screen.getByText("Métrica PERSONAL_PERFORMANCE")).toBeTruthy();
    expect(screen.getByText("58.7")).toBeTruthy();
    expect(screen.getByText("60.4")).toBeTruthy();
  });
});
