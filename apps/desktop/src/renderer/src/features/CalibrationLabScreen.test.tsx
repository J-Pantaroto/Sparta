import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveReleaseResponse,
  CalibrationParameterCatalog,
  CalibrationValidationResult,
  ReleaseRow
} from "../services/api-client";

const {
  fetchCalibrationParametersMock,
  listCalibrationCandidatesMock,
  fetchActiveReleaseMock,
  listReleasesMock,
  validateCalibrationCandidateRemoteMock,
  listCalibrationExperimentsMock
} = vi.hoisted(() => ({
  fetchCalibrationParametersMock: vi.fn(),
  listCalibrationCandidatesMock: vi.fn(),
  fetchActiveReleaseMock: vi.fn(),
  listReleasesMock: vi.fn(),
  validateCalibrationCandidateRemoteMock: vi.fn(),
  listCalibrationExperimentsMock: vi.fn()
}));

vi.mock("../services/api-client", () => ({
  activateRelease: vi.fn(),
  createCalibrationCandidate: vi.fn(),
  createCalibrationRevision: vi.fn(),
  createRelease: vi.fn(),
  decideCalibrationCandidate: vi.fn(),
  fetchActiveRelease: fetchActiveReleaseMock,
  fetchCalibrationExperimentCases: vi.fn(),
  fetchCalibrationParameters: fetchCalibrationParametersMock,
  listCalibrationCandidates: listCalibrationCandidatesMock,
  listCalibrationExperiments: listCalibrationExperimentsMock,
  listReleases: listReleasesMock,
  rollbackRelease: vi.fn(),
  runCalibrationExperiment: vi.fn(),
  validateCalibrationCandidateRemote: validateCalibrationCandidateRemoteMock,
  validateRelease: vi.fn()
}));

vi.mock("./ReplayCapabilitySummary", () => ({ ReplayCapabilitySummary: () => null }));

import { CalibrationLabScreen } from "./CalibrationLabScreen";

const catalog: CalibrationParameterCatalog = {
  laboratoryVersion: "1.0.0",
  maxPromotionStatus: "APPROVED_FOR_FUTURE_RELEASE",
  weightableMetrics: ["PERSONAL_PERFORMANCE"],
  postAggregationThresholds: [],
  registry: []
};

const validation: CalibrationValidationResult = { valid: true, rejections: [], accepted: [] };

function activeRelease(overrides: Partial<ReleaseRow> = {}): ReleaseRow {
  return {
    id: "release-1",
    riotAccountId: "account-1",
    candidateId: "candidate-1",
    candidateRevisionId: "candidate-rev-1",
    experimentId: "experiment-1",
    releaseVersion: "release-etapa27c-v1",
    baselineVersion: "1.0.0",
    candidateVersion: "1.0.0",
    status: "ACTIVE",
    artifact: {
      configuration: {
        version: "1.0.0",
        configHash: "fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38",
        metricWeights: {
          PERSONAL_PERFORMANCE: 0.25,
          RECENT_FORM: 0.15,
          PERSONAL_MATCHUP: 0.1,
          BLIND_SAFETY: 0.1,
          ALLY_SYNERGY: 0.1,
          ENEMY_COMPOSITION_ANSWER: 0.1,
          TEAM_COMPOSITION: 0.24
        },
        disabledMetrics: [],
        postAggregationRules: {},
        source: { type: "RELEASE", releaseId: "release-1" }
      },
      experimentEvidence: { knownLimitations: [], sampleSize: 2, exactReplayCases: 2 }
    },
    artifactHash: "8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90",
    configHash: "fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38",
    createdBy: "user-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activatedBy: "user-1",
    activatedAt: new Date().toISOString(),
    currentlyActive: true,
    ...overrides
  };
}

describe("CalibrationLabScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCalibrationParametersMock.mockResolvedValue(catalog);
    listCalibrationCandidatesMock.mockResolvedValue({ candidates: [] });
    validateCalibrationCandidateRemoteMock.mockResolvedValue(validation);
    listCalibrationExperimentsMock.mockResolvedValue({ experiments: [] });
  });

  it("mostra o banner de ambiente histórico / não operacional", async () => {
    fetchActiveReleaseMock.mockResolvedValue({ source: "BUILT_IN_BASELINE", scenarios: [] } as ActiveReleaseResponse);
    listReleasesMock.mockResolvedValue({ releases: [] });

    render(<CalibrationLabScreen token="token-1" />);

    await waitFor(() => expect(screen.getByText("Ambiente histórico / não operacional")).toBeTruthy());
    expect(
      screen.getByText("Nada aqui altera automaticamente a produção - experimentos são registros históricos.")
    ).toBeTruthy();
  });

  it("release ativa mostra badge ATIVA e hash resumido, nunca o valor completo por padrão", async () => {
    const release = activeRelease();
    fetchActiveReleaseMock.mockResolvedValue({ source: "RELEASE", release } as ActiveReleaseResponse);
    listReleasesMock.mockResolvedValue({ releases: [release] });

    render(<CalibrationLabScreen token="token-1" />);

    await waitFor(() => expect(screen.getAllByText("ATIVA").length).toBeGreaterThan(0));
    expect(screen.getAllByText("fa9dbd…aa38").length).toBeGreaterThan(0);
    expect(screen.queryByText(release.configHash)).toBeNull();
  });

  it("mostra só os pesos que divergem entre a release ativa e a configuração candidata", async () => {
    const release = activeRelease();
    fetchActiveReleaseMock.mockResolvedValue({ source: "RELEASE", release } as ActiveReleaseResponse);
    listReleasesMock.mockResolvedValue({ releases: [release] });

    render(<CalibrationLabScreen token="token-1" />);

    await waitFor(() => expect(screen.getByText("Diferença contra a release ativa")).toBeTruthy());
    const deltaBlock = screen
      .getByText("Diferença contra a release ativa")
      .closest(".sp-calib-delta-block") as HTMLElement;
    // TEAM_COMPOSITION diverge (0.24 na release vs 0.20 default da candidata) - só ele aparece.
    expect(within(deltaBlock).getByText("Encaixe de composição")).toBeTruthy();
    // Pesos iguais (ex. Desempenho pessoal, 0.25 nos dois) não aparecem na lista de diferenças.
    expect(deltaBlock.textContent).not.toContain("Desempenho pessoal");
  });

  it("releases traduz o status cru e não marca mais de uma como ativa", async () => {
    fetchActiveReleaseMock.mockResolvedValue({ source: "BUILT_IN_BASELINE", scenarios: [] } as ActiveReleaseResponse);
    const rolledBack = activeRelease({
      id: "release-old",
      status: "ROLLED_BACK",
      currentlyActive: false,
      rolledBackAt: new Date().toISOString()
    });
    listReleasesMock.mockResolvedValue({ releases: [rolledBack] });

    render(<CalibrationLabScreen token="token-1" />);

    await waitFor(() => expect(screen.getByText("Revertida")).toBeTruthy());
    expect(screen.queryByText("ATIVA")).toBeNull();
  });
});
