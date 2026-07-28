import { describe, expect, it } from "vitest";
import type { DraftState, RecommendationReason } from "../types/domain.js";
import type { PlayerChampionPoolCandidate } from "../types/player-champion-pool.js";
import {
  buildCanonicalSnapshotInput,
  canonicalSnapshotInputString,
  shouldPersistSnapshot,
  SNAPSHOT_INPUT_VERSION,
  toPersistedRecommendations,
  type PersistedRecommendationSource
} from "./recommendation-snapshot.js";

const CATALOG = { dataDragon: "16.14.1" };
const ALGORITHMS = { recommendationEngine: "1.0.0", draftStrategy: "draft-strategy/1.0.0" };

function draft(overrides: Partial<DraftState> = {}): DraftState {
  return {
    playerRole: "JUNGLE",
    playerRoleSource: "LCU",
    pickOrder: 3,
    allies: [],
    enemies: [],
    bannedChampionIds: [],
    ...overrides
  };
}

function candidate(championId: number, overrides: Partial<PlayerChampionPoolCandidate> = {}): PlayerChampionPoolCandidate {
  return {
    championId,
    championName: `Campeao ${championId}`,
    role: "JUNGLE",
    source: "PERSONAL_OBSERVED",
    enabled: true,
    ...overrides
  };
}

function canonical(input: { draft?: DraftState; pool?: PlayerChampionPoolCandidate[]; catalog?: Record<string, string>; algorithms?: Record<string, string> } = {}) {
  return buildCanonicalSnapshotInput({
    draft: input.draft ?? draft(),
    pool: input.pool ?? [candidate(234)],
    catalogVersions: input.catalog ?? CATALOG,
    algorithmVersions: input.algorithms ?? ALGORITHMS
  });
}

function reason(code: string): RecommendationReason {
  return { code, label: `rotulo ${code}`, detail: `detalhe ${code}`, impact: 1 };
}

function source(championId: number, rank: number, overrides: Partial<PersistedRecommendationSource> = {}): PersistedRecommendationSource {
  return {
    championId,
    championName: `Campeao ${championId}`,
    rank,
    totalScore: 60,
    dataCoverage: 0.9,
    poolSource: "PERSONAL_OBSERVED",
    personalGames: 8,
    metricDetails: [],
    effectiveWeights: { personalPerformance: 0.5, recentForm: 0.5 },
    category: "comfort_pick",
    reasons: [reason("amostra")],
    warnings: [],
    limitations: [],
    ...overrides
  };
}

describe("input canônico - estabilidade do hash", () => {
  it("a mesma composição em ordem diferente produz a mesma serialização", () => {
    const ordemA = canonical({
      draft: draft({
        allies: [
          { championId: 103, championName: "Ahri", team: "ally" },
          { championId: 222, championName: "Jinx", team: "ally" }
        ],
        enemies: [
          { championId: 64, championName: "Lee Sin", team: "enemy" },
          { championId: 54, championName: "Malphite", team: "enemy" }
        ],
        bannedChampionIds: [55, 91]
      })
    });
    const ordemB = canonical({
      draft: draft({
        allies: [
          { championId: 222, championName: "Jinx", team: "ally" },
          { championId: 103, championName: "Ahri", team: "ally" }
        ],
        enemies: [
          { championId: 54, championName: "Malphite", team: "enemy" },
          { championId: 64, championName: "Lee Sin", team: "enemy" }
        ],
        bannedChampionIds: [91, 55]
      })
    });

    expect(canonicalSnapshotInputString(ordemA!)).toBe(canonicalSnapshotInputString(ordemB!));
  });

  it("o pool em ordem diferente produz a mesma serialização", () => {
    const a = canonical({ pool: [candidate(234), candidate(64), candidate(254)] });
    const b = canonical({ pool: [candidate(254), candidate(234), candidate(64)] });
    expect(canonicalSnapshotInputString(a!)).toBe(canonicalSnapshotInputString(b!));
  });

  it("as versões em ordem diferente produzem a mesma serialização", () => {
    const a = canonical({ algorithms: { alfa: "1", beta: "2" } });
    const b = canonical({ algorithms: { beta: "2", alfa: "1" } });
    expect(canonicalSnapshotInputString(a!)).toBe(canonicalSnapshotInputString(b!));
  });

  it("o mesmo campeão repetido no pool conta uma vez só", () => {
    const unico = canonical({ pool: [candidate(234)] });
    const repetido = canonical({ pool: [candidate(234), candidate(234)] });
    expect(canonicalSnapshotInputString(unico!)).toBe(canonicalSnapshotInputString(repetido!));
  });

  it("candidato desabilitado ou de outra posição não entra no input", () => {
    const base = canonical({ pool: [candidate(234)] });
    const comRuido = canonical({
      pool: [candidate(234), candidate(99, { enabled: false }), candidate(98, { role: "MID" })]
    });
    expect(canonicalSnapshotInputString(base!)).toBe(canonicalSnapshotInputString(comRuido!));
  });

  it("observado prevalece sobre inclusão manual do mesmo campeão", () => {
    const a = canonical({
      pool: [candidate(234, { source: "USER_PROVIDED" }), candidate(234, { source: "PERSONAL_OBSERVED" })]
    });
    expect(a!.pool).toEqual([{ championId: 234, source: "PERSONAL_OBSERVED" }]);
  });
});

describe("input canônico - o que muda o hash", () => {
  const base = canonical();

  it("trocar a posição muda", () => {
    const outro = canonical({ draft: draft({ playerRole: "MID" }) });
    expect(canonicalSnapshotInputString(outro!)).not.toBe(canonicalSnapshotInputString(base!));
  });

  it("revelar um inimigo muda", () => {
    const outro = canonical({
      draft: draft({ enemies: [{ championId: 64, championName: "Lee Sin", team: "enemy" }] })
    });
    expect(canonicalSnapshotInputString(outro!)).not.toBe(canonicalSnapshotInputString(base!));
  });

  it("revelar um aliado muda", () => {
    const outro = canonical({
      draft: draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" }] })
    });
    expect(canonicalSnapshotInputString(outro!)).not.toBe(canonicalSnapshotInputString(base!));
  });

  it("um ban novo muda", () => {
    const outro = canonical({ draft: draft({ bannedChampionIds: [55] }) });
    expect(canonicalSnapshotInputString(outro!)).not.toBe(canonicalSnapshotInputString(base!));
  });

  it("o adversário direto muda", () => {
    const outro = canonical({ draft: draft({ enemyLaneChampionId: 64 }) });
    expect(canonicalSnapshotInputString(outro!)).not.toBe(canonicalSnapshotInputString(base!));
  });

  it("o campeão do jogador muda", () => {
    const outro = canonical({ draft: draft({ selectedChampionId: 234 }) });
    expect(canonicalSnapshotInputString(outro!)).not.toBe(canonicalSnapshotInputString(base!));
  });

  it("habilitar outro campeão no pool muda", () => {
    const outro = canonical({ pool: [candidate(234), candidate(64)] });
    expect(canonicalSnapshotInputString(outro!)).not.toBe(canonicalSnapshotInputString(base!));
  });

  it("versão nova de algoritmo muda", () => {
    const outro = canonical({ algorithms: { ...ALGORITHMS, draftStrategy: "draft-strategy/2.0.0" } });
    expect(canonicalSnapshotInputString(outro!)).not.toBe(canonicalSnapshotInputString(base!));
  });

  it("versão nova de catálogo muda", () => {
    const outro = canonical({ catalog: { dataDragon: "16.15.1" } });
    expect(canonicalSnapshotInputString(outro!)).not.toBe(canonicalSnapshotInputString(base!));
  });

  it("origem da posição faz parte do input", () => {
    const manual = canonical({ draft: draft({ playerRoleSource: "USER" }) });
    expect(canonicalSnapshotInputString(manual!)).not.toBe(canonicalSnapshotInputString(base!));
  });

  it("sem origem declarada, a posição é tratada como informada pelo usuário", () => {
    const semOrigem = canonical({ draft: draft({ playerRoleSource: undefined }) });
    expect(semOrigem!.roleSource).toBe("USER");
  });

  it("carrega a versão do próprio formato canônico", () => {
    expect(base!.inputVersion).toBe(SNAPSHOT_INPUT_VERSION);
  });

  it("sem posição não há input canônico", () => {
    expect(canonical({ draft: draft({ playerRole: undefined }) })).toBeNull();
  });
});

describe("decisão de gravar", () => {
  it("input idêntico ao último não grava", () => {
    expect(shouldPersistSnapshot({ latestInputHash: "abc", candidateInputHash: "abc" })).toBe(false);
  });

  it("input diferente grava", () => {
    expect(shouldPersistSnapshot({ latestInputHash: "abc", candidateInputHash: "def" })).toBe(true);
  });

  it("sem snapshot anterior grava", () => {
    expect(shouldPersistSnapshot({ candidateInputHash: "abc" })).toBe(true);
  });
});

describe("recomendações persistidas", () => {
  const resultado = {
    primaryRecommendations: [source(234, 1), source(64, 2)],
    alternatives: [source(254, 6), source(56, 7)]
  };

  it("preserva ranking e grupo de principais e alternativas", () => {
    const persisted = toPersistedRecommendations(resultado);

    expect(persisted.map((entry) => [entry.championId, entry.rank, entry.group])).toEqual([
      [234, 1, "PRIMARY"],
      [64, 2, "PRIMARY"],
      [254, 6, "ALTERNATIVE"],
      [56, 7, "ALTERNATIVE"]
    ]);
  });

  it("um candidato entra uma única vez, mesmo aparecendo nas duas listas", () => {
    const persisted = toPersistedRecommendations({
      primaryRecommendations: [source(234, 1)],
      alternatives: [source(234, 6)]
    });

    expect(persisted).toHaveLength(1);
    expect(persisted[0].group).toBe("PRIMARY");
  });

  it("preserva pesos efetivos e cobertura, não só o score", () => {
    const [primeiro] = toPersistedRecommendations(resultado);

    expect(primeiro.effectiveWeights).toEqual({ personalPerformance: 0.5, recentForm: 0.5 });
    expect(primeiro.dataCoverage).toBe(0.9);
    expect(primeiro.totalScore).toBe(60);
    expect(primeiro.personalGames).toBe(8);
    expect(primeiro.poolSource).toBe("PERSONAL_OBSERVED");
  });

  it("preserva motivos com código e impacto, não só o rótulo", () => {
    const [primeiro] = toPersistedRecommendations(resultado);
    expect(primeiro.reasons[0]).toEqual({
      code: "amostra",
      label: "rotulo amostra",
      detail: "detalhe amostra",
      impact: 1
    });
  });

  it("métrica indisponível continua indisponível, sem valor", () => {
    const persisted = toPersistedRecommendations({
      primaryRecommendations: [
        source(234, 1, {
          metricDetails: [
            {
              key: "PERSONAL_MATCHUP",
              value: null,
              status: "UNAVAILABLE",
              confidence: null,
              unavailableReason: "Sem confronto observado."
            }
          ]
        })
      ],
      alternatives: []
    });

    const metrica = persisted[0].metricDetails[0];
    expect(metrica.value).toBeNull();
    expect(metrica.status).toBe("UNAVAILABLE");
  });

  it("cópia defensiva: alterar a saída não altera a entrada", () => {
    const entrada = source(234, 1);
    const [persisted] = toPersistedRecommendations({
      primaryRecommendations: [entrada],
      alternatives: []
    });

    persisted.reasons[0].label = "alterado";
    persisted.effectiveWeights.personalPerformance = 999;

    expect(entrada.reasons[0].label).toBe("rotulo amostra");
    expect(entrada.effectiveWeights?.personalPerformance).toBe(0.5);
  });

  it("lista vazia produz snapshot vazio, não entradas inventadas", () => {
    expect(toPersistedRecommendations({ primaryRecommendations: [], alternatives: [] })).toEqual([]);
  });
});
