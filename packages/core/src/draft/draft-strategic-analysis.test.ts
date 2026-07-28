import { describe, expect, it } from "vitest";
import type {
  ChampionCapabilityKey,
  ChampionCapabilityProfile
} from "../types/champion-capability.js";
import type { ChampionTag, DraftPick, DraftState } from "../types/domain.js";
import { CHAMPION_CAPABILITY_KEYS } from "../types/champion-capability.js";
import {
  analyzeDraftStrategy,
  DRAFT_STRATEGIC_ANALYSIS_VERSION
} from "./draft-strategic-analysis.js";
import { generatePreGameAnalysis } from "./pre-game-analysis.js";
import { recommendFromPersonalPool } from "./recommendation-engine.js";

function pick(
  championId: number,
  championName: string,
  team: "ally" | "enemy",
  isPlayer = false
): DraftPick {
  return { championId, championName, team, ...(isPlayer ? { isPlayer } : {}) };
}

function draft(overrides: Partial<DraftState> = {}): DraftState {
  return {
    playerRole: "MID",
    playerRoleSource: "USER",
    pickOrder: 4,
    allies: [],
    enemies: [],
    bannedChampionIds: [],
    ...overrides
  };
}

function profile(
  championId: number,
  championName: string,
  available: Partial<Record<ChampionCapabilityKey, boolean | number>> = {}
): ChampionCapabilityProfile {
  const capabilities = CHAMPION_CAPABILITY_KEYS.map((key) => {
    const value = available[key];
    if (value === undefined) {
      return {
        key,
        status: "UNAVAILABLE" as const,
        value: null,
        evidence: [],
        provenance: {
          sourceType: "CALCULATED" as const,
          sourceId: "data-dragon",
          resource: `champion/${championName}.json`,
          algorithmVersion: "test"
        },
        unavailableReason: "Sem evidência explícita."
      };
    }
    return {
      key,
      status: "AVAILABLE" as const,
      value,
      evidence: [
        {
          sourceType: "SPELL" as const,
          sourceId: `${championName}Q`,
          sourceName: "Habilidade de teste",
          sourceText: "Trecho oficial de teste.",
          extractionRule: `test.${key}`
        }
      ],
      provenance: {
        sourceType: "CALCULATED" as const,
        sourceId: "data-dragon",
        resource: `champion/${championName}.json`,
        patch: "16.14.1",
        locale: "pt_BR",
        algorithmVersion: "test"
      }
    };
  });
  return {
    championId,
    championKey: championName,
    championName,
    dataDragonVersion: "16.14.1",
    locale: "pt_BR",
    algorithmVersion: "test",
    status: "PARTIAL",
    coverage: Object.keys(available).length / CHAMPION_CAPABILITY_KEYS.length,
    availableCapabilities: Object.keys(available).length,
    totalCapabilities: CHAMPION_CAPABILITY_KEYS.length,
    sourceReferences: [],
    capabilities
  };
}

function tag(
  championId: number,
  championName: string,
  overrides: Partial<ChampionTag> = {}
): ChampionTag {
  return {
    championId,
    championName,
    roles: ["MID"],
    damageProfile: "UTILITY",
    tags: [],
    blindSafety: 0.5,
    difficulty: 0.5,
    engage: 0.45,
    peel: 0.45,
    frontline: 0.45,
    pickoff: 0.45,
    waveclear: 0.45,
    scaling: 0.45,
    earlyPressure: 0.45,
    ...overrides
  };
}

function run(input: {
  draft?: DraftState;
  candidate?: { championId: number; championName: string };
  profiles?: ChampionCapabilityProfile[];
  tags?: ChampionTag[];
}) {
  return analyzeDraftStrategy({
    draft: input.draft ?? draft(),
    candidate: input.candidate ?? {
      championId: 1,
      championName: "Candidate"
    },
    capabilityProfiles: input.profiles ?? [],
    championTags: input.tags ?? []
  });
}

describe("analyzeDraftStrategy", () => {
  it("inclui o candidato uma vez e mantém draft vazio indisponível, nunca zerado", () => {
    const analysis = run({
      draft: draft({
        allies: [pick(1, "Candidate", "ally", true), pick(2, "Ally", "ally")]
      }),
      profiles: [profile(1, "Candidate", { HARD_CC: true })]
    });

    expect(
      analysis.alliedProfile.knownChampions.filter((champion) => champion.championId === 1)
    ).toHaveLength(1);

    const empty = run({
      profiles: [profile(1, "Candidate", { HARD_CC: true })]
    });
    expect(empty.teamCompositionScore.value).toBeNull();
    expect(empty.teamCompositionScore.status).toBe("UNAVAILABLE");
    expect(empty.enemyResponseScore.value).toBeNull();
  });

  it("distingue preencher lacuna de reforçar recurso existente", () => {
    const common = {
      candidate: { championId: 1, championName: "Candidate" },
      profiles: [profile(1, "Candidate", { ENGAGE: true })],
      draft: draft({ allies: [pick(2, "Ally", "ally")] })
    };
    const filled = run({
      ...common,
      tags: [tag(2, "Ally", { engage: 0.1 })]
    });
    const reinforced = run({
      ...common,
      profiles: [...common.profiles, profile(2, "Ally", { ENGAGE: true })],
      tags: [tag(2, "Ally")]
    });

    expect(filled.candidateContribution.filledKnownGaps).toContain("ENGAGE");
    expect(filled.candidateContribution.reinforcedCapabilities).not.toContain("ENGAGE");
    expect(reinforced.candidateContribution.reinforcedCapabilities).toContain("ENGAGE");
    expect(filled.teamCompositionScore.value).toBeGreaterThan(
      reinforced.teamCompositionScore.value!
    );
  });

  it("só cria ameaça de engage quando existe evidência e uma resposta habilitada melhora a nota", () => {
    const enemy = profile(9, "Enemy", { MOBILITY: true });
    const candidateResponse = run({
      draft: draft({
        allies: [pick(2, "Ally", "ally")],
        enemies: [pick(9, "Enemy", "enemy")]
      }),
      profiles: [profile(1, "Candidate", { HARD_CC: true }), profile(2, "Ally"), enemy]
    });
    const existingResponse = run({
      draft: draft({
        allies: [pick(2, "Ally", "ally")],
        enemies: [pick(9, "Enemy", "enemy")]
      }),
      profiles: [profile(1, "Candidate"), profile(2, "Ally", { HARD_CC: true }), enemy]
    });
    const noThreat = run({
      draft: draft({ enemies: [pick(9, "Enemy", "enemy")] }),
      profiles: [profile(1, "Candidate", { HARD_CC: true }), profile(9, "Enemy")]
    });

    expect(
      candidateResponse.threatResponses.find((response) => response.threat === "MOBILITY")
        ?.candidateEnabled
    ).toBe(true);
    expect(candidateResponse.enemyResponseScore.value).toBeGreaterThan(
      existingResponse.enemyResponseScore.value!
    );
    expect(noThreat.enemyResponseScore.status).toBe("UNAVAILABLE");
  });

  it("reduz cobertura ao remover uma revelação sem penalizar o score disponível", () => {
    const profiles = [
      profile(1, "Candidate", { HARD_CC: true }),
      profile(9, "Enemy", { MOBILITY: true }),
      profile(10, "OtherEnemy")
    ];
    const moreKnown = run({
      draft: draft({
        enemies: [pick(9, "Enemy", "enemy"), pick(10, "OtherEnemy", "enemy")]
      }),
      profiles
    });
    const lessKnown = run({
      draft: draft({ enemies: [pick(9, "Enemy", "enemy")] }),
      profiles
    });

    expect(lessKnown.coverage).toBeLessThan(moreKnown.coverage);
    expect(lessKnown.enemyResponseScore.value).toBe(moreKnown.enemyResponseScore.value);
  });

  it("não transforma capacidade indisponível em ausência e não soma fallback à evidência específica", () => {
    const analysis = run({
      draft: draft({ allies: [pick(2, "Ally", "ally")] }),
      profiles: [profile(1, "Candidate", { ENGAGE: true })],
      tags: [tag(1, "Candidate", { engage: 0.1 }), tag(2, "Ally", { engage: 0.1 })]
    });
    const engage = analysis.alliedProfile.dimensions.find(
      (dimension) => dimension.dimension === "ENGAGE"
    )!;
    const unavailable = analysis.alliedProfile.dimensions.find(
      (dimension) => dimension.dimension === "DISENGAGE"
    )!;

    expect(engage.championsWithEvidence).toHaveLength(1);
    expect(engage.evidence).toHaveLength(1);
    expect(engage.evidence[0]?.source).toBe("CAPABILITY_PROFILE");
    expect(unavailable.status).toBe("UNAVAILABLE");
    expect(analysis.risks.some((risk) => risk.key.startsWith("conflict_"))).toBe(true);
  });

  it("é determinístico e independente da ordem dos picks", () => {
    const profiles = [
      profile(1, "Candidate", { PEEL: true }),
      profile(2, "A", { ENGAGE: true }),
      profile(3, "B", { PROTECTION: true }),
      profile(9, "Enemy", { BURST: true })
    ];
    const first = run({
      draft: draft({
        allies: [pick(2, "A", "ally"), pick(3, "B", "ally")],
        enemies: [pick(9, "Enemy", "enemy")]
      }),
      profiles
    });
    const second = run({
      draft: draft({
        allies: [pick(3, "B", "ally"), pick(2, "A", "ally")],
        enemies: [pick(9, "Enemy", "enemy")]
      }),
      profiles
    });

    expect(first).toEqual(second);
    expect(first.algorithmVersion).toBe(DRAFT_STRATEGIC_ANALYSIS_VERSION);
  });

  it("mantém adversário direto separado e não o injeta na equipe inimiga", () => {
    const analysis = run({
      draft: draft({ enemyLaneChampionId: 9 }),
      profiles: [profile(9, "LaneEnemy")]
    });

    expect(analysis.directOpponent).toEqual({
      championId: 9,
      championName: "LaneEnemy"
    });
    expect(analysis.enemyProfile.knownChampions).toHaveLength(0);
  });

  it("ranking e pré-game reutilizam scores e sinais do mesmo motor", () => {
    const currentDraft = draft({
      allies: [pick(2, "Ally", "ally")],
      enemies: [pick(9, "Enemy", "enemy")],
      selectedChampionId: 1
    });
    const profiles = [
      profile(1, "Candidate", { PEEL: true }),
      profile(2, "Ally", { ENGAGE: true }),
      profile(9, "Enemy", { BURST: true })
    ];
    const tags = [tag(1, "Candidate"), tag(2, "Ally"), tag(9, "Enemy")];
    const ranked = recommendFromPersonalPool({
      draft: currentDraft,
      candidates: [
        {
          championId: 1,
          championName: "Candidate",
          role: "MID",
          source: "USER_PROVIDED",
          enabled: true
        }
      ],
      championStats: [],
      championTags: tags,
      capabilityProfiles: profiles,
      matchups: [],
      compositionRules: {
        minimumFrontline: 35,
        minimumEngage: 35,
        minimumWaveclear: 35,
        preferDamageBalance: true
      },
      patchMeta: null
    }).primaryRecommendations[0]!;
    const preGame = generatePreGameAnalysis({
      draft: currentDraft,
      selectedChampionName: "Candidate",
      selectedChampionTag: tags[0],
      championTags: tags,
      championCapabilityProfiles: profiles,
      now: "2026-07-28T04:14:00.000Z"
    });

    expect(preGame.ok).toBe(true);
    if (!preGame.ok) return;
    expect(ranked.strategicAnalysis).toEqual(preGame.analysis.strategicAnalysis);
    expect(ranked.metrics.compositionFit).toBe(
      preGame.analysis.strategicAnalysis?.teamCompositionScore.value
    );
    expect(ranked.metrics.enemyDraftAnswer).toBe(
      preGame.analysis.strategicAnalysis?.enemyResponseScore.value
    );
  });

  it("aplica análise independente às cinco principais e às alternativas", () => {
    const candidates = Array.from({ length: 6 }, (_, index) => ({
      championId: index + 1,
      championName: `Candidate${index + 1}`,
      role: "MID" as const,
      source: "USER_PROVIDED" as const,
      enabled: true
    }));
    const profiles = [
      ...candidates.map((candidate, index) =>
        profile(candidate.championId, candidate.championName, {
          ...(index % 2 === 0 ? { HARD_CC: true } : { PEEL: true })
        })
      ),
      profile(20, "Ally", { ENGAGE: true }),
      profile(30, "Enemy", { MOBILITY: true })
    ];
    const result = recommendFromPersonalPool({
      draft: draft({
        allies: [pick(20, "Ally", "ally")],
        enemies: [pick(30, "Enemy", "enemy")]
      }),
      candidates,
      championStats: [],
      championTags: candidates.map((candidate) =>
        tag(candidate.championId, candidate.championName)
      ),
      capabilityProfiles: profiles,
      matchups: [],
      compositionRules: {
        minimumFrontline: 35,
        minimumEngage: 35,
        minimumWaveclear: 35,
        preferDamageBalance: true
      },
      patchMeta: null
    });

    expect(result.primaryRecommendations).toHaveLength(5);
    expect(result.alternatives).toHaveLength(1);
    const all = [...result.primaryRecommendations, ...result.alternatives];
    expect(all.every((recommendation) => recommendation.strategicAnalysis)).toBe(true);
    expect(
      new Set(
        all.map(
          (recommendation) =>
            recommendation.strategicAnalysis!.candidateContribution.candidate.championId
        )
      ).size
    ).toBe(6);
  });
});
