import { describe, expect, it } from "vitest";
import type { ChampionTag, DraftState, MatchupData } from "../types/domain.js";
import { generatePreGameAnalysis, PRE_GAME_ANALYSIS_VERSION, type PreGameAnalysis } from "./pre-game-analysis.js";

const NOW = "2026-07-27T12:00:00.000Z";

function tag(championName: string, overrides: Partial<ChampionTag> = {}): ChampionTag {
  return {
    championId: overrides.championId,
    championName,
    roles: [],
    damageProfile: "AD",
    tags: [],
    blindSafety: 0.5,
    difficulty: 0.5,
    engage: 0.5,
    peel: 0.5,
    frontline: 0.5,
    pickoff: 0.5,
    waveclear: 0.5,
    scaling: 0.5,
    earlyPressure: 0.5,
    ...overrides
  };
}

function draft(overrides: Partial<DraftState> = {}): DraftState {
  return {
    playerRole: "MID",
    pickOrder: 3,
    allies: [],
    enemies: [],
    bannedChampionIds: [],
    selectedChampionId: 61,
    ...overrides
  };
}

function run(overrides: Partial<Parameters<typeof generatePreGameAnalysis>[0]> = {}) {
  return generatePreGameAnalysis({
    draft: draft(),
    selectedChampionName: "Orianna",
    championTags: [],
    now: NOW,
    ...overrides
  });
}

function ok(result: ReturnType<typeof generatePreGameAnalysis>): PreGameAnalysis {
  if (!result.ok) throw new Error(`esperava sucesso, veio ${result.reason}`);
  return result.analysis;
}

/** Todo texto visível ao usuário, pra varreduras de frase proibida. */
function allText(analysis: PreGameAnalysis): string {
  return JSON.stringify(analysis);
}

function allNumbers(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(allNumbers);
  if (value && typeof value === "object") return Object.values(value).flatMap(allNumbers);
  return [];
}

describe("generatePreGameAnalysis - pré-requisitos", () => {
  it("recusa sem posição, com motivo estruturado", () => {
    const result = run({ draft: draft({ playerRole: undefined }) });
    expect(result).toEqual({ ok: false, reason: "PLAYER_ROLE_UNAVAILABLE" });
  });

  it("recusa sem campeão confirmado, com motivo estruturado", () => {
    const result = run({ draft: draft({ selectedChampionId: undefined }) });
    expect(result).toEqual({ ok: false, reason: "SELECTED_CHAMPION_UNAVAILABLE" });
  });

  it("a ausência de posição é avaliada antes da de campeão (ordem estável)", () => {
    const result = run({ draft: draft({ playerRole: undefined, selectedChampionId: undefined }) });
    expect(result).toEqual({ ok: false, reason: "PLAYER_ROLE_UNAVAILABLE" });
  });

  it("não gera análise parcial quando falta pré-requisito", () => {
    const result = run({ draft: draft({ playerRole: undefined }) });
    expect("analysis" in result).toBe(false);
  });
});

describe("generatePreGameAnalysis - determinismo", () => {
  it("o mesmo input produz exatamente a mesma saída", () => {
    const input = {
      draft: draft({
        allies: [{ championId: 103, championName: "Ahri", team: "ally" as const }],
        enemies: [{ championId: 64, championName: "Lee Sin", team: "enemy" as const }],
        enemyLaneChampionId: 64
      }),
      selectedChampionName: "Orianna",
      championTags: [tag("Ahri"), tag("Lee Sin"), tag("Orianna")],
      enemyLaneChampionName: "Lee Sin",
      now: NOW
    };

    expect(ok(generatePreGameAnalysis(input))).toEqual(ok(generatePreGameAnalysis(input)));
  });

  it("carrega a versão do algoritmo e o instante injetado, sem ler o relógio", () => {
    const analysis = ok(run());
    expect(analysis.algorithmVersion).toBe(PRE_GAME_ANALYSIS_VERSION);
    expect(analysis.generatedAt).toBe(NOW);
  });

  it("não produz NaN nem Infinity em nenhum número da resposta", () => {
    const analysis = ok(
      run({
        draft: draft({
          allies: [{ championId: 103, championName: "Ahri", team: "ally" }],
          enemies: [{ championId: 64, championName: "Lee Sin", team: "enemy" }]
        }),
        championTags: [tag("Ahri"), tag("Lee Sin"), tag("Orianna")]
      })
    );

    for (const value of allNumbers(analysis)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("generatePreGameAnalysis - draft parcial", () => {
  it("draft vazio não é descrito como completo", () => {
    const analysis = ok(run());
    expect(analysis.status).toBe("PARTIAL");
    expect(analysis.summary.status).toBe("PARTIAL");
    expect(analysis.summary.description).toMatch(/1 dos 10/);
  });

  it("draft completo é descrito como completo", () => {
    const allies = ["Ahri", "Jinx", "Thresh", "Malphite"].map((championName, index) => ({
      championId: index + 1,
      championName,
      team: "ally" as const
    }));
    const enemies = ["Lee Sin", "Yasuo", "Lux", "Ezreal", "Leona"].map((championName, index) => ({
      championId: index + 100,
      championName,
      team: "enemy" as const
    }));

    const analysis = ok(
      run({
        draft: draft({ allies, enemies }),
        championTags: [...allies, ...enemies].map((pick) => tag(pick.championName)).concat(tag("Orianna"))
      })
    );

    expect(analysis.status).toBe("AVAILABLE");
    expect(analysis.summary.description).toMatch(/draft completo/i);
  });

  it("sem aliados, a composição aliada fica indisponível com motivo (não vira 'o time não tem')", () => {
    const analysis = ok(run({ championTags: [] }));
    expect(analysis.alliedComposition.status).toBe("UNAVAILABLE");
    expect(analysis.alliedComposition.unavailableReason).toBeTruthy();
    expect(analysis.alliedComposition.signals).toEqual([]);
  });

  it("com o campeão do jogador e mais ninguém, não chama isso de composição", () => {
    // Medido contra a API real: com 0 aliados revelados a seção descrevia o
    // próprio Viego como se fosse leitura do time - a mesma leitura falsa que
    // a Fase 15 corrigiu no motor de recomendação.
    const orianna = tag("Orianna", { engage: 0.95 });
    const analysis = ok(run({ championTags: [orianna], selectedChampionTag: orianna }));

    expect(analysis.alliedComposition.status).toBe("UNAVAILABLE");
    expect(analysis.alliedComposition.signals).toEqual([]);
    expect(analysis.alliedComposition.unavailableReason).toMatch(/companheiro de time/i);
    // O que dá pra dizer do campeão continua sendo dito, no lugar certo.
    expect(analysis.selectedChampionFit.signals.length).toBeGreaterThan(0);
  });

  it("sem inimigos, a composição inimiga fica indisponível com motivo", () => {
    const analysis = ok(run());
    expect(analysis.enemyComposition.status).toBe("UNAVAILABLE");
    expect(analysis.enemyComposition.unavailableReason).toBeTruthy();
  });

  it("com draft incompleto, o sinal de dimensão ausente usa linguagem de parcialidade", () => {
    const analysis = ok(
      run({
        draft: draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" }] }),
        championTags: [tag("Ahri", { frontline: 0.1 }), tag("Orianna", { frontline: 0.1 })]
      })
    );

    const frontline = analysis.alliedComposition.signals.find((signal) => signal.key === "ally_frontline");
    expect(frontline?.status).toBe("PARTIAL");
    expect(frontline?.description).toMatch(/ainda não foi identificada/i);
    expect(frontline?.description).not.toMatch(/não possui|não tem/i);
  });

  it("com o time completo, a mesma dimensão vira afirmação direta", () => {
    const allies = ["Ahri", "Jinx", "Thresh", "Lux"].map((championName, index) => ({
      championId: index + 1,
      championName,
      team: "ally" as const
    }));

    const analysis = ok(
      run({
        draft: draft({ allies }),
        championTags: [...allies.map((pick) => tag(pick.championName, { frontline: 0.1 })), tag("Orianna", { frontline: 0.1 })]
      })
    );

    const frontline = analysis.alliedComposition.signals.find((signal) => signal.key === "ally_frontline");
    expect(frontline?.status).toBe("AVAILABLE");
    expect(frontline?.description).toMatch(/pouca linha de frente/i);
  });
});

describe("generatePreGameAnalysis - o campeão do jogador entra uma vez", () => {
  it("o campeão selecionado conta exatamente uma vez na composição aliada", () => {
    // O jogador não está em `draft.allies` (contrato da Fase 16). Se fosse
    // contado duas vezes, a média de 1 aliado + jogador não bateria com a
    // média aritmética dos dois valores distintos.
    const analysis = ok(
      run({
        draft: draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" }] }),
        championTags: [tag("Ahri", { engage: 1 }), tag("Orianna", { engage: 0 })]
      })
    );

    const engage = analysis.alliedComposition.signals.find((signal) => signal.key === "ally_engage");
    // 2 campeões: (100 + 0) / 2 = 50. Contado duas vezes, Orianna puxaria
    // pra 33,3 e a média deixaria de ser 50.
    expect(engage).toBeUndefined(); // 50 fica na faixa neutra, sem sinal
    expect(analysis.alliedComposition.knownCount).toBe(2);
  });

  it("knownCount dos aliados inclui o jogador e não passa de 5", () => {
    const allies = ["Ahri", "Jinx", "Thresh", "Lux"].map((championName, index) => ({
      championId: index + 1,
      championName,
      team: "ally" as const
    }));

    const analysis = ok(
      run({ draft: draft({ allies }), championTags: [...allies.map((pick) => tag(pick.championName)), tag("Orianna")] })
    );

    expect(analysis.alliedComposition.knownCount).toBe(5);
    expect(analysis.alliedComposition.expectedCount).toBe(5);
  });

  it("a evidência do resumo conta o jogador entre os aliados", () => {
    const analysis = ok(run());
    expect(analysis.summary.evidence).toContain("1 de 5 aliados (incluindo você)");
  });
});

describe("generatePreGameAnalysis - reage ao draft", () => {
  const base = {
    championTags: [tag("Ahri", { engage: 0.9 }), tag("Malphite", { frontline: 0.95 }), tag("Orianna")],
    selectedChampionName: "Orianna",
    now: NOW
  };

  it("trocar o aliado muda os sinais da composição aliada", () => {
    const comAhri = ok(
      generatePreGameAnalysis({
        ...base,
        draft: draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" }] })
      })
    );
    const comMalphite = ok(
      generatePreGameAnalysis({
        ...base,
        draft: draft({ allies: [{ championId: 54, championName: "Malphite", team: "ally" }] })
      })
    );

    expect(comAhri.alliedComposition.signals).not.toEqual(comMalphite.alliedComposition.signals);
  });

  it("trocar o inimigo muda os sinais da composição inimiga", () => {
    const comAhri = ok(
      generatePreGameAnalysis({
        ...base,
        draft: draft({ enemies: [{ championId: 103, championName: "Ahri", team: "enemy" }] })
      })
    );
    const comMalphite = ok(
      generatePreGameAnalysis({
        ...base,
        draft: draft({ enemies: [{ championId: 54, championName: "Malphite", team: "enemy" }] })
      })
    );

    expect(comAhri.enemyComposition.signals).not.toEqual(comMalphite.enemyComposition.signals);
  });

  it("remover um inimigo reduz a cobertura", () => {
    const enemies = [
      { championId: 103, championName: "Ahri", team: "enemy" as const },
      { championId: 54, championName: "Malphite", team: "enemy" as const }
    ];

    const comDois = ok(generatePreGameAnalysis({ ...base, draft: draft({ enemies }) }));
    const comUm = ok(generatePreGameAnalysis({ ...base, draft: draft({ enemies: enemies.slice(0, 1) }) }));

    expect(comUm.dataCoverage).toBeLessThan(comDois.dataCoverage);
  });

  it("revelar o adversário direto aumenta a cobertura", () => {
    const semAdversario = ok(generatePreGameAnalysis({ ...base, draft: draft() }));
    const comAdversario = ok(
      generatePreGameAnalysis({
        ...base,
        draft: draft({
          enemies: [{ championId: 64, championName: "Lee Sin", team: "enemy" }],
          enemyLaneChampionId: 64
        }),
        enemyLaneChampionName: "Lee Sin"
      })
    );

    expect(comAdversario.dataCoverage).toBeGreaterThan(semAdversario.dataCoverage);
  });
});

describe("generatePreGameAnalysis - confronto direto", () => {
  it("sem adversário revelado, a seção fica indisponível e não escolhe um inimigo qualquer", () => {
    const analysis = ok(
      run({
        draft: draft({
          enemies: [
            { championId: 64, championName: "Lee Sin", team: "enemy" },
            { championId: 157, championName: "Yasuo", team: "enemy" }
          ]
        }),
        championTags: [tag("Lee Sin"), tag("Yasuo"), tag("Orianna")]
      })
    );

    expect(analysis.laneContext.status).toBe("UNAVAILABLE");
    expect(analysis.laneContext.signals).toEqual([]);
    expect(analysis.laneContext.unavailableReason).toMatch(/não foi revelado/i);
  });

  it("com adversário revelado e sem histórico pessoal, informa o motivo em vez de um neutro artificial", () => {
    const analysis = ok(
      run({
        draft: draft({ enemyLaneChampionId: 64 }),
        enemyLaneChampionName: "Lee Sin"
      })
    );

    const matchup = analysis.laneContext.signals.find((signal) => signal.key === "personal_matchup");
    expect(analysis.laneContext.status).toBe("PARTIAL");
    expect(matchup?.status).toBe("UNAVAILABLE");
    expect(matchup?.strength).toBeNull();
    expect(matchup?.unavailableReason).toBeTruthy();
  });

  it("com histórico pessoal, carrega valor, amostra, confiança e proveniência calculada", () => {
    const personalMatchup: MatchupData = {
      championId: 61,
      enemyChampionId: 64,
      role: "MID",
      score: 62.5,
      sampleSize: 4,
      confidence: "low"
    };

    const analysis = ok(
      run({ draft: draft({ enemyLaneChampionId: 64 }), enemyLaneChampionName: "Lee Sin", personalMatchup })
    );

    const matchup = analysis.laneContext.signals.find((signal) => signal.key === "personal_matchup");
    expect(matchup?.status).toBe("AVAILABLE");
    expect(matchup?.strength).toBe(62.5);
    expect(matchup?.provenance?.sourceType).toBe("CALCULATED");
    expect(matchup?.provenance?.sampleSize).toBe(4);
    expect(matchup?.confidence).not.toBeNull();
  });

  it("o matchup pessoal nunca é apresentado como tendência global", () => {
    const personalMatchup: MatchupData = {
      championId: 61,
      enemyChampionId: 64,
      role: "MID",
      score: 62.5,
      sampleSize: 4,
      confidence: "low"
    };

    const analysis = ok(
      run({ draft: draft({ enemyLaneChampionId: 64 }), enemyLaneChampionName: "Lee Sin", personalMatchup })
    );

    const matchup = analysis.laneContext.signals.find((signal) => signal.key === "personal_matchup");
    expect(matchup?.description).toMatch(/suas partidas|seu desempenho/i);
    expect(matchup?.description).not.toMatch(/em geral|jogadores|no meta|globalmente/i);
  });

  it("um 50 calculado com amostra real continua sendo valor, não ausência", () => {
    const personalMatchup: MatchupData = {
      championId: 61,
      enemyChampionId: 64,
      role: "MID",
      score: 50,
      sampleSize: 6,
      confidence: "low"
    };

    const analysis = ok(
      run({ draft: draft({ enemyLaneChampionId: 64 }), enemyLaneChampionName: "Lee Sin", personalMatchup })
    );

    const matchup = analysis.laneContext.signals.find((signal) => signal.key === "personal_matchup");
    expect(matchup?.status).toBe("AVAILABLE");
    expect(matchup?.strength).toBe(50);
  });
});

describe("generatePreGameAnalysis - sinais indisponíveis", () => {
  it("matchup global e força no meta ficam indisponíveis, sem valor", () => {
    const analysis = ok(run());
    const keys = analysis.unavailableSignals.map((signal) => signal.key);

    expect(keys).toContain("GLOBAL_MATCHUP");
    expect(keys).toContain("META_STRENGTH");
    for (const signal of analysis.unavailableSignals) {
      expect(signal.status).toBe("UNAVAILABLE");
      expect(signal.strength).toBeNull();
      expect(signal.unavailableReason).toBeTruthy();
    }
  });

  it("interações específicas entre campeões ficam explicitamente fora do modelo", () => {
    const analysis = ok(run());
    const interacoes = analysis.unavailableSignals.find((signal) => signal.key === "CHAMPION_INTERACTIONS");
    expect(interacoes?.status).toBe("UNAVAILABLE");
    expect(interacoes?.unavailableReason).toMatch(/habilidades/i);
  });

  it("nenhum sinal indisponível tem número associado", () => {
    const analysis = ok(run());
    for (const signal of analysis.unavailableSignals) {
      expect(signal.strength ?? null).toBeNull();
      expect(signal.confidence ?? null).toBeNull();
    }
  });
});

describe("generatePreGameAnalysis - proveniência e linguagem", () => {
  it("sinais de composição são DERIVED, nunca estatística oficial da Riot", () => {
    const analysis = ok(
      run({
        draft: draft({ enemies: [{ championId: 54, championName: "Malphite", team: "enemy" }] }),
        championTags: [tag("Malphite", { engage: 0.95 }), tag("Orianna")]
      })
    );

    const sinais = [...analysis.alliedComposition.signals, ...analysis.enemyComposition.signals];
    expect(sinais.length).toBeGreaterThan(0);
    for (const signal of sinais) {
      expect(signal.provenance?.sourceType).toBe("DERIVED");
      expect(signal.provenance?.sourceType).not.toBe("OFFICIAL");
    }
  });

  it("dimensão derivada usa linguagem de indicação, não de fato consumado", () => {
    const analysis = ok(
      run({
        draft: draft({ enemies: [{ championId: 54, championName: "Malphite", team: "enemy" }] }),
        championTags: [tag("Malphite", { engage: 0.95 }), tag("Orianna")]
      })
    );

    const engage = analysis.enemyComposition.signals.find((signal) => signal.key === "enemy_engage");
    expect(engage?.description).toMatch(/indica/i);
    expect(engage?.description).not.toMatch(/necessariamente|com certeza|vai impedir/i);
  });

  it("o draft manual é USER_PROVIDED e o do cliente é OBSERVED", () => {
    const manual = ok(run({ draft: draft({ playerRoleSource: "USER" }) }));
    const lcu = ok(run({ draft: draft({ playerRoleSource: "LCU" }) }));

    expect(manual.summary.provenance?.sourceType).toBe("USER_PROVIDED");
    expect(lcu.summary.provenance?.sourceType).toBe("OBSERVED");
  });

  it("não usa nenhum dos conceitos de habilidade que o Sparta não modela", () => {
    const analysis = ok(
      run({
        draft: draft({
          allies: [{ championId: 103, championName: "Ahri", team: "ally" }],
          enemies: [{ championId: 54, championName: "Malphite", team: "enemy" }],
          enemyLaneChampionId: 54
        }),
        championTags: [tag("Ahri"), tag("Malphite", { engage: 0.95 }), tag("Orianna")],
        enemyLaneChampionName: "Malphite"
      })
    );

    const texto = allText(analysis);
    expect(texto).not.toMatch(/hard cc|anti-?dash|supress|corpo a corpo|ataque físico/i);
  });

  it("não fala em probabilidade de vitória nem chama a cobertura de confiança", () => {
    const analysis = ok(run());
    const texto = allText(analysis);
    expect(texto).not.toMatch(/chance de vit|probabilidade|% de vencer/i);
    expect(texto).not.toMatch(/confiança estatística/i);
  });

  it("não repete nenhuma das frases estáticas antigas da rota", () => {
    const analysis = ok(run());
    const texto = allText(analysis);
    expect(texto).not.toMatch(/prioridade de rota, visão em objetivo/i);
    expect(texto).not.toMatch(/spikes de nível 6/i);
    expect(texto).not.toMatch(/Boa capacidade de teamfight/i);
  });
});

describe("generatePreGameAnalysis - encaixe do campeão selecionado", () => {
  it("sem tag do campeão, a seção fica indisponível em vez de inventar encaixe", () => {
    const analysis = ok(run({ selectedChampionTag: undefined, championTags: [] }));
    expect(analysis.selectedChampionFit.status).toBe("UNAVAILABLE");
    expect(analysis.selectedChampionFit.unavailableReason).toMatch(/catálogo/i);
  });

  it("descreve os recursos que o campeão traz a partir das dimensões individuais", () => {
    const orianna = tag("Orianna", { waveclear: 0.9, engage: 0.1 });
    const analysis = ok(run({ selectedChampionTag: orianna, championTags: [orianna] }));

    const adds = analysis.selectedChampionFit.signals.find((signal) => signal.key === "fit_adds");
    expect(adds?.description).toMatch(/wave clear/i);
    expect(adds?.tone).toBe("POSITIVE");
  });

  it("aponta a necessidade que passa a ser atendida pela escolha", () => {
    const malphite = tag("Malphite", { frontline: 0.95, engage: 0.2 });
    const ahri = tag("Ahri", { frontline: 0.1, engage: 0.2 });

    const analysis = ok(
      run({
        draft: draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" }] }),
        selectedChampionName: "Malphite",
        selectedChampionTag: malphite,
        championTags: [ahri, malphite]
      })
    );

    const preenche = analysis.selectedChampionFit.signals.find((signal) => signal.key === "fit_fills_gap");
    expect(preenche?.description).toMatch(/linha de frente/i);
  });

  it("a mesma dimensão nunca aparece como atendida e como em aberto ao mesmo tempo", () => {
    // Medido na API real: Viego com Ahri e Jinx produzia "sua escolha não
    // cobre linha de frente" e "linha de frente passa a existir com a sua
    // escolha" na mesma resposta - a média do time seguia baixa mesmo com o
    // campeão do jogador cobrindo a dimensão.
    const viego = tag("Viego", { frontline: 0.9 });
    const ahri = tag("Ahri", { frontline: 0.02 });
    const jinx = tag("Jinx", { frontline: 0.02 });

    const analysis = ok(
      run({
        draft: draft({
          allies: [
            { championId: 103, championName: "Ahri", team: "ally" },
            { championId: 222, championName: "Jinx", team: "ally" }
          ]
        }),
        selectedChampionName: "Viego",
        selectedChampionTag: viego,
        championTags: [ahri, jinx, viego]
      })
    );

    const lacunas = analysis.selectedChampionFit.signals.find((signal) => signal.key === "fit_gaps");
    const preenche = analysis.selectedChampionFit.signals.find((signal) => signal.key === "fit_fills_gap");

    expect(preenche?.description).toMatch(/linha de frente/i);
    expect(lacunas?.description ?? "").not.toMatch(/linha de frente/i);
  });

  it("aponta o que continua em aberto sem afirmar ausência com draft incompleto", () => {
    const orianna = tag("Orianna", { frontline: 0.05 });
    const ahri = tag("Ahri", { frontline: 0.05 });

    const analysis = ok(
      run({
        draft: draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" }] }),
        selectedChampionTag: orianna,
        championTags: [ahri, orianna]
      })
    );

    const lacunas = analysis.selectedChampionFit.signals.find((signal) => signal.key === "fit_gaps");
    expect(lacunas?.status).toBe("PARTIAL");
    expect(lacunas?.description).toMatch(/ainda faltam campeões/i);
  });
});

describe("generatePreGameAnalysis - riscos conhecidos", () => {
  it("sem inimigo com perfil conhecido, a seção fica indisponível", () => {
    const analysis = ok(run());
    expect(analysis.knownRisks.status).toBe("UNAVAILABLE");
  });

  it("aponta assimetria só quando as duas dimensões existem", () => {
    const analysis = ok(
      run({
        draft: draft({
          allies: [{ championId: 103, championName: "Ahri", team: "ally" }],
          enemies: [{ championId: 54, championName: "Malphite", team: "enemy" }]
        }),
        championTags: [tag("Ahri", { peel: 0.05 }), tag("Malphite", { engage: 0.95 }), tag("Orianna", { peel: 0.05 })]
      })
    );

    const risco = analysis.knownRisks.signals.find((signal) => signal.key === "risk_engage_vs_peel");
    expect(risco?.tone).toBe("WARNING");
    expect(risco?.status).toBe("PARTIAL");
    expect(risco?.description).toMatch(/campeões já conhecidos/i);
  });

  it("sem companheiro de time revelado, não compara os dois times", () => {
    // A frase de risco fala do time; sem aliado ela descreveria o jogador
    // sozinho como se fosse a composição.
    const analysis = ok(
      run({
        draft: draft({ enemies: [{ championId: 54, championName: "Malphite", team: "enemy" }] }),
        championTags: [tag("Malphite", { engage: 0.95 }), tag("Orianna", { peel: 0.05 })]
      })
    );

    expect(analysis.knownRisks.status).toBe("UNAVAILABLE");
    expect(analysis.knownRisks.unavailableReason).toMatch(/companheiro de time/i);
  });

  it("sem assimetria, diz isso explicitamente em vez de ficar vazio", () => {
    const analysis = ok(
      run({
        draft: draft({
          allies: [{ championId: 103, championName: "Ahri", team: "ally" }],
          enemies: [{ championId: 54, championName: "Malphite", team: "enemy" }]
        }),
        championTags: [tag("Ahri"), tag("Malphite"), tag("Orianna")]
      })
    );

    expect(analysis.knownRisks.signals).toHaveLength(1);
    expect(analysis.knownRisks.signals[0].key).toBe("risk_none");
    expect(analysis.knownRisks.signals[0].tone).toBe("NEUTRAL");
  });
});

describe("generatePreGameAnalysis - cobertura", () => {
  it("é uma fração entre 0 e 1", () => {
    const analysis = ok(run());
    expect(analysis.dataCoverage).toBeGreaterThan(0);
    expect(analysis.dataCoverage).toBeLessThanOrEqual(1);
  });

  it("expõe o peso e a disponibilidade de cada componente", () => {
    const analysis = ok(run());
    const componentes = Object.keys(analysis.coverageBreakdown);

    expect(componentes).toContain("adversarioDireto");
    expect(componentes).toContain("matchupPessoal");
    for (const componente of Object.values(analysis.coverageBreakdown)) {
      expect(componente.weight).toBeGreaterThan(0);
      expect(typeof componente.available).toBe("boolean");
    }
  });

  it("a soma dos pesos declarados é 1", () => {
    const analysis = ok(run());
    const soma = Object.values(analysis.coverageBreakdown).reduce((total, item) => total + item.weight, 0);
    expect(soma).toBeCloseTo(1, 5);
  });

  it("é independente da confiança do matchup pessoal", () => {
    const base = { draft: draft({ enemyLaneChampionId: 64 }), enemyLaneChampionName: "Lee Sin" };
    const comBaixa = ok(
      run({
        ...base,
        personalMatchup: { championId: 61, enemyChampionId: 64, role: "MID", score: 55, sampleSize: 2, confidence: "low" }
      })
    );
    const comAlta = ok(
      run({
        ...base,
        personalMatchup: {
          championId: 61,
          enemyChampionId: 64,
          role: "MID",
          score: 55,
          sampleSize: 40,
          confidence: "high"
        }
      })
    );

    expect(comBaixa.dataCoverage).toBe(comAlta.dataCoverage);
  });

  it("cresce conforme o draft é revelado", () => {
    const championTags = [tag("Ahri"), tag("Jinx"), tag("Lee Sin"), tag("Orianna")];
    const vazio = ok(run({ championTags }));
    const cheio = ok(
      run({
        championTags,
        draft: draft({
          allies: [
            { championId: 103, championName: "Ahri", team: "ally" },
            { championId: 222, championName: "Jinx", team: "ally" }
          ],
          enemies: [{ championId: 64, championName: "Lee Sin", team: "enemy" }],
          enemyLaneChampionId: 64
        }),
        enemyLaneChampionName: "Lee Sin"
      })
    );

    expect(cheio.dataCoverage).toBeGreaterThan(vazio.dataCoverage);
  });
});

describe("generatePreGameAnalysis - proveniência das ChampionTag (Etapa 8)", () => {
  const provenanceOf = (patch: string, algorithmVersion = "champion-tag-derivation/1.0.0") => ({
    source: {
      sourceType: "DERIVED" as const,
      sourceId: "data-dragon",
      resource: "champion.json",
      patch,
      locale: "pt_BR",
      algorithmVersion,
      status: "AVAILABLE" as const
    },
    reviewState: "UNREVIEWED" as const,
    reviewedDimensions: []
  });

  it("expõe a origem do perfil do campeão escolhido no contrato", () => {
    const orianna = tag("Orianna", { provenance: provenanceOf("16.14.1") });
    const analysis = ok(run({ selectedChampionTag: orianna, championTags: [orianna] }));

    expect(analysis.selectedChampion.profileProvenance?.source.patch).toBe("16.14.1");
    expect(analysis.selectedChampion.profileProvenance?.reviewState).toBe("UNREVIEWED");
  });

  it("perfil sem proveniência sai ausente, nunca preenchido com default", () => {
    const orianna = tag("Orianna");
    const analysis = ok(run({ selectedChampionTag: orianna, championTags: [orianna] }));

    expect(analysis.selectedChampion.profileProvenance).toBeUndefined();
  });

  it("sinais de composição declaram a versão quando todas as tags concordam", () => {
    const ahri = tag("Ahri", { engage: 0.95, provenance: provenanceOf("16.14.1") });
    const orianna = tag("Orianna", { engage: 0.95, provenance: provenanceOf("16.14.1") });

    const analysis = ok(
      run({
        draft: draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" }] }),
        selectedChampionTag: orianna,
        championTags: [ahri, orianna]
      })
    );

    const sinal = analysis.alliedComposition.signals[0];
    expect(sinal.provenance?.patch).toBe("16.14.1");
    expect(sinal.provenance?.algorithmVersion).toBe("champion-tag-derivation/1.0.0");
  });

  it("com versões diferentes na mesma composição, a versão fica ausente em vez de escolher uma", () => {
    const ahri = tag("Ahri", { engage: 0.95, provenance: provenanceOf("16.10.1") });
    const orianna = tag("Orianna", { engage: 0.95, provenance: provenanceOf("16.14.1") });

    const analysis = ok(
      run({
        draft: draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" }] }),
        selectedChampionTag: orianna,
        championTags: [ahri, orianna]
      })
    );

    const sinal = analysis.alliedComposition.signals[0];
    expect(sinal.provenance?.patch).toBeUndefined();
    expect(sinal.provenance?.sourceType).toBe("DERIVED");
  });

  it("uma tag sem proveniência derruba a versão declarada do conjunto", () => {
    const ahri = tag("Ahri", { engage: 0.95 });
    const orianna = tag("Orianna", { engage: 0.95, provenance: provenanceOf("16.14.1") });

    const analysis = ok(
      run({
        draft: draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" }] }),
        selectedChampionTag: orianna,
        championTags: [ahri, orianna]
      })
    );

    expect(analysis.alliedComposition.signals[0].provenance?.patch).toBeUndefined();
  });

  it("nenhum sinal de composição é declarado como OFFICIAL", () => {
    const ahri = tag("Ahri", { engage: 0.95, provenance: provenanceOf("16.14.1") });
    const orianna = tag("Orianna", { engage: 0.95, provenance: provenanceOf("16.14.1") });

    const analysis = ok(
      run({
        draft: draft({
          allies: [{ championId: 103, championName: "Ahri", team: "ally" }],
          enemies: [{ championId: 61, championName: "Orianna", team: "enemy" }]
        }),
        selectedChampionTag: orianna,
        championTags: [ahri, orianna]
      })
    );

    const todos = [
      ...analysis.alliedComposition.signals,
      ...analysis.enemyComposition.signals,
      ...analysis.selectedChampionFit.signals,
      ...analysis.knownRisks.signals
    ];
    expect(todos.length).toBeGreaterThan(0);
    for (const sinal of todos) {
      expect(sinal.provenance?.sourceType).not.toBe("OFFICIAL");
    }
  });

  it("a proveniência não introduz confiança inventada em sinal de composição", () => {
    const orianna = tag("Orianna", { engage: 0.95, provenance: provenanceOf("16.14.1") });
    const ahri = tag("Ahri", { engage: 0.95, provenance: provenanceOf("16.14.1") });

    const analysis = ok(
      run({
        draft: draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" }] }),
        selectedChampionTag: orianna,
        championTags: [ahri, orianna]
      })
    );

    for (const sinal of analysis.alliedComposition.signals) {
      expect(sinal.confidence).toBeNull();
      expect(sinal.provenance?.confidence).toBeUndefined();
    }
  });

  it("a análise continua determinística com proveniência anexada", () => {
    const orianna = tag("Orianna", { provenance: provenanceOf("16.14.1") });
    const input = {
      draft: draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" as const }] }),
      selectedChampionName: "Orianna",
      selectedChampionTag: orianna,
      championTags: [tag("Ahri", { provenance: provenanceOf("16.14.1") }), orianna],
      now: NOW
    };

    expect(ok(generatePreGameAnalysis(input))).toEqual(ok(generatePreGameAnalysis(input)));
  });

  it("anexar proveniência não muda nenhum texto nem número da análise", () => {
    const semProv = tag("Orianna", { engage: 0.95 });
    const comProv = tag("Orianna", { engage: 0.95, provenance: provenanceOf("16.14.1") });
    const ahriSem = tag("Ahri", { engage: 0.95 });
    const ahriCom = tag("Ahri", { engage: 0.95, provenance: provenanceOf("16.14.1") });
    const draftComAliado = draft({ allies: [{ championId: 103, championName: "Ahri", team: "ally" as const }] });

    const semProveniencia = ok(
      run({ draft: draftComAliado, selectedChampionTag: semProv, championTags: [ahriSem, semProv] })
    );
    const comProveniencia = ok(
      run({ draft: draftComAliado, selectedChampionTag: comProv, championTags: [ahriCom, comProv] })
    );

    // Mesmos textos, mesmos status, mesmas forças - só a origem declarada muda.
    const semTextos = semProveniencia.alliedComposition.signals.map((s) => `${s.key}|${s.description}|${s.strength}`);
    const comTextos = comProveniencia.alliedComposition.signals.map((s) => `${s.key}|${s.description}|${s.strength}`);
    expect(comTextos).toEqual(semTextos);
    expect(comProveniencia.dataCoverage).toBe(semProveniencia.dataCoverage);
  });
});
