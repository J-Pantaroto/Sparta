import { describe, expect, it } from "vitest";
import {
  CONSIDERED_NEUTRAL_OBJECTIVES,
  OBJECTIVE_PARTICIPATION_ALGORITHM_VERSION,
  computeObjectiveParticipation
} from "./objective-participation.js";

describe("computeObjectiveParticipation", () => {
  it("calcula a razão quando numerador e denominador são reais", () => {
    const observacao = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: 2, baronTakedowns: 1 },
      teamKills: { dragonKills: 3, baronKills: 1 }
    });
    expect(observacao.status).toBe("AVAILABLE");
    expect(observacao.value).toBeCloseTo(0.75, 5);
    expect(observacao.personalTakedowns).toBe(3);
    expect(observacao.teamObjectives).toBe(4);
  });

  it("soma dragão e barão corretamente", () => {
    const observacao = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: 4, baronTakedowns: 2 },
      teamKills: { dragonKills: 5, baronKills: 3 }
    });
    expect(observacao.personalTakedowns).toBe(6);
    expect(observacao.teamObjectives).toBe(8);
  });

  it("participação zero com denominador positivo é 0% disponível, não ausência", () => {
    const observacao = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: 0, baronTakedowns: 0 },
      teamKills: { dragonKills: 2, baronKills: 1 }
    });
    expect(observacao.value).toBe(0);
    expect(observacao.status).toBe("AVAILABLE");
    expect(observacao.unavailableReason).toBeUndefined();
  });

  it("time sem nenhum objetivo neutro fica indisponível, não 0%", () => {
    const observacao = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: 0, baronTakedowns: 0 },
      teamKills: { dragonKills: 0, baronKills: 0 }
    });
    expect(observacao.value).toBeNull();
    expect(observacao.status).toBe("UNAVAILABLE");
    expect(observacao.unavailableReason).toMatch(/denominador/i);
    // O absoluto continua exposto: sabemos que ele participou de zero.
    expect(observacao.personalTakedowns).toBe(0);
    expect(observacao.teamObjectives).toBe(0);
  });

  it("sem `challenges` fica indisponível (não vira zero)", () => {
    const observacao = computeObjectiveParticipation({
      takedowns: undefined,
      teamKills: { dragonKills: 3, baronKills: 1 }
    });
    expect(observacao.value).toBeNull();
    expect(observacao.personalTakedowns).toBeNull();
    expect(observacao.status).toBe("UNAVAILABLE");
  });

  it("um único campo de challenge ausente NÃO vira zero, fica indisponível", () => {
    // Somar só o dragão contra um denominador que conta dragão + barão
    // subestimaria o percentual de forma sistemática.
    const observacao = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: 2 },
      teamKills: { dragonKills: 3, baronKills: 1 }
    });
    expect(observacao.value).toBeNull();
    expect(observacao.status).toBe("UNAVAILABLE");
    expect(observacao.unavailableReason).toMatch(/subestimaria/i);
  });

  it("sem os objetivos do time fica indisponível, preservando o numerador", () => {
    const observacao = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: 2, baronTakedowns: 1 },
      teamKills: undefined
    });
    expect(observacao.value).toBeNull();
    expect(observacao.personalTakedowns).toBe(3);
    expect(observacao.teamObjectives).toBeNull();
  });

  it("objetivos do time incompletos ficam indisponíveis", () => {
    const observacao = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: 1, baronTakedowns: 0 },
      teamKills: { dragonKills: 2 }
    });
    expect(observacao.value).toBeNull();
    expect(observacao.status).toBe("UNAVAILABLE");
  });

  it("não trunca numerador maior que denominador - marca a anomalia", () => {
    const observacao = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: 3, baronTakedowns: 1 },
      teamKills: { dragonKills: 2, baronKills: 1 }
    });
    // O valor sai como e: um `Math.min(1, ...)` esconderia a divergencia.
    expect(observacao.value).toBeCloseTo(4 / 3, 5);
    expect(observacao.status).toBe("PARTIAL");
    expect(observacao.partialReason).toMatch(/excedem/i);
  });

  it("considera apenas dragão e barão", () => {
    expect(CONSIDERED_NEUTRAL_OBJECTIVES).toEqual(["DRAGON", "BARON"]);
    const observacao = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: 1, baronTakedowns: 0 },
      teamKills: { dragonKills: 1, baronKills: 0 }
    });
    expect(observacao.consideredObjectives).toEqual(["DRAGON", "BARON"]);
  });

  it("registra proveniência com o recurso oficial e a versão do algoritmo", () => {
    const observacao = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: 1, baronTakedowns: 0 },
      teamKills: { dragonKills: 2, baronKills: 0 },
      patch: "16.14",
      observedAt: "2026-07-01T00:00:00.000Z"
    });
    expect(observacao.provenance?.sourceType).toBe("CALCULATED");
    expect(observacao.provenance?.sourceId).toBe("riot");
    expect(observacao.provenance?.resource).toContain("match-v5");
    expect(observacao.provenance?.algorithmVersion).toBe(OBJECTIVE_PARTICIPATION_ALGORITHM_VERSION);
    expect(observacao.provenance?.patch).toBe("16.14");
  });

  it("indisponível nunca carrega proveniência de cálculo", () => {
    const observacao = computeObjectiveParticipation({ takedowns: undefined, teamKills: undefined });
    expect(observacao.provenance).toBeUndefined();
  });

  it("nunca produz NaN nem Infinity", () => {
    const casos = [
      { takedowns: { dragonTakedowns: 0, baronTakedowns: 0 }, teamKills: { dragonKills: 0, baronKills: 0 } },
      { takedowns: { dragonTakedowns: 5, baronTakedowns: 2 }, teamKills: { dragonKills: 5, baronKills: 2 } },
      { takedowns: undefined, teamKills: { dragonKills: 1, baronKills: 1 } }
    ];
    casos.forEach((caso) => {
      const { value } = computeObjectiveParticipation(caso);
      if (value !== null) expect(Number.isFinite(value)).toBe(true);
    });
  });

  it("valor negativo ou não numérico é tratado como ausência", () => {
    const negativo = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: -1, baronTakedowns: 0 },
      teamKills: { dragonKills: 2, baronKills: 0 }
    });
    expect(negativo.status).toBe("UNAVAILABLE");

    const naoNumerico = computeObjectiveParticipation({
      takedowns: { dragonTakedowns: Number.NaN, baronTakedowns: 0 },
      teamKills: { dragonKills: 2, baronKills: 0 }
    });
    expect(naoNumerico.status).toBe("UNAVAILABLE");
  });
});
