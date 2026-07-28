import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalLoadoutEvidence } from "@sparta/core";
import { PersonalLoadoutHistory } from "./PersonalLoadoutHistory";

const fetchPersonalLoadoutEvidenceMock = vi.hoisted(() => vi.fn());

vi.mock("../services/api-client", () => ({
  fetchPersonalLoadoutEvidence: fetchPersonalLoadoutEvidenceMock
}));

function patternBase() {
  return {
    signature: "signature",
    status: "AVAILABLE" as const,
    games: 2,
    wins: 1,
    losses: 1,
    outcomeUnavailableGames: 0,
    lastUsedAt: "2026-07-20T12:00:00.000Z",
    patches: ["16.14"],
    queueIds: [420],
    unknownPatchGames: 0,
    unknownQueueGames: 0,
    provenance: {
      sourceType: "CALCULATED" as const,
      sourceId: "sparta",
      status: "AVAILABLE" as const
    },
    observationProvenance: {
      sourceType: "OBSERVED" as const,
      sourceId: "riot-match-v5",
      status: "AVAILABLE" as const
    },
    limitations: []
  };
}

function evidence(overrides: Partial<PersonalLoadoutEvidence> = {}): PersonalLoadoutEvidence {
  const provenance = {
    sourceType: "CALCULATED" as const,
    sourceId: "sparta",
    status: "AVAILABLE" as const
  };
  return {
    championId: 61,
    role: "MID",
    status: "PARTIAL",
    sampleSize: 2,
    availableSampleSize: 2,
    patchScope: {
      requestedPatch: "16.14.1",
      hasRequestedPatchObservations: true,
      observedPatches: ["16.14"],
      unknownPatchSamples: 0
    },
    queueScope: {
      observedQueueIds: [420],
      unknownQueueSamples: 0
    },
    filterScope: {},
    finalInventories: [
      {
        ...patternBase(),
        signature: "items",
        itemIds: [1001, 1001, 3078],
        unavailableSlotCount: 0,
        items: [
          {
            id: 1001,
            quantity: 2,
            status: "EXACT",
            names: ["Botas"],
            assets: [],
            catalogVersions: ["16.14"],
            provenance: []
          },
          {
            id: 3078,
            quantity: 1,
            status: "UNAVAILABLE",
            names: [],
            assets: [],
            catalogVersions: [],
            provenance: []
          }
        ]
      }
    ],
    runePages: [
      {
        ...patternBase(),
        signature: "runes",
        primaryStyleId: 8200,
        secondaryStyleId: 8300,
        selections: [
          {
            tree: "PRIMARY",
            order: 0,
            perkId: 8214,
            isKeystone: true,
            enrichment: {
              id: 8214,
              status: "EXACT",
              names: ["Invocar Aery"],
              assets: [],
              catalogVersions: ["16.14"],
              provenance: []
            }
          }
        ],
        fragments: []
      }
    ],
    summonerSpellSets: [
      {
        ...patternBase(),
        signature: "spells",
        spellIds: [4, 14],
        spells: [
          {
            id: 4,
            status: "EXACT",
            names: ["Flash"],
            assets: [],
            catalogVersions: ["16.14"],
            provenance: []
          },
          {
            id: 14,
            status: "EXACT",
            names: ["Incendiar"],
            assets: [],
            catalogVersions: ["16.14"],
            provenance: []
          }
        ],
        observedOrders: [[14, 4]]
      }
    ],
    parts: {
      finalInventories: { status: "AVAILABLE", sampleSize: 2, availableSampleSize: 2 },
      runePages: { status: "AVAILABLE", sampleSize: 2, availableSampleSize: 2 },
      summonerSpellSets: { status: "AVAILABLE", sampleSize: 2, availableSampleSize: 2 }
    },
    provenance,
    algorithmVersion: "personal-loadout-evidence/1.0.0",
    ...overrides
  };
}

describe("PersonalLoadoutHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("apresenta padrões pessoais como observações factuais e preserva IDs não resolvidos", async () => {
    fetchPersonalLoadoutEvidenceMock.mockResolvedValue(evidence());
    render(
      <PersonalLoadoutHistory
        token="token"
        playerId="puuid-1"
        championId={61}
        role="MID"
        requestedPatch="16.14.1"
      />
    );

    expect(await screen.findByText("Itens finais mais observados")).toBeDefined();
    expect(screen.getByText(/Botas ×2 · ID 3078/)).toBeDefined();
    expect(screen.getByText("Página de runas mais utilizada por você")).toBeDefined();
    expect(screen.getByText(/Invocar Aery/)).toBeDefined();
    expect(screen.getByText(/Flash \+ Incendiar/)).toBeDefined();
    expect(screen.getAllByText("2 partidas").length).toBeGreaterThan(0);
    expect(screen.getByText(/não altera ranking/i)).toBeDefined();
    expect(screen.queryByText(/build ideal|melhor build|ordem da build/i)).toBeNull();
  });

  it("mostra ausência do patch atual e histórico antigo em seção separada", async () => {
    const oldHistory = evidence({
      status: "STALE",
      patchScope: { observedPatches: ["16.13"], unknownPatchSamples: 0 },
      staleReason:
        "Estas observações não pertencem ao patch solicitado 16.14.1; são exibidas somente como histórico."
    });
    fetchPersonalLoadoutEvidenceMock.mockResolvedValue(
      evidence({
        status: "UNAVAILABLE",
        sampleSize: 0,
        availableSampleSize: 0,
        patchScope: {
          requestedPatch: "16.14.1",
          hasRequestedPatchObservations: false,
          observedPatches: [],
          unknownPatchSamples: 0
        },
        finalInventories: [],
        runePages: [],
        summonerSpellSets: [],
        unavailableReason: "Nenhuma partida no contexto.",
        recentHistory: oldHistory
      })
    );

    render(
      <PersonalLoadoutHistory
        token="token"
        playerId="puuid-1"
        championId={61}
        role="MID"
        requestedPatch="16.14.1"
      />
    );

    expect(await screen.findByText(/Sem observações no patch 16.14.1/)).toBeDefined();
    expect(screen.getByText("Histórico recente de outros patches")).toBeDefined();
    expect(screen.getByText(/não pertencem ao patch solicitado/)).toBeDefined();
  });

  it("sem conta vinculada mostra indisponibilidade e não consulta a API", () => {
    render(
      <PersonalLoadoutHistory token="token" championId={61} role="MID" requestedPatch="16.14.1" />
    );

    expect(screen.getByText(/Vincule sua conta Riot/)).toBeDefined();
    expect(fetchPersonalLoadoutEvidenceMock).not.toHaveBeenCalled();
  });
});
