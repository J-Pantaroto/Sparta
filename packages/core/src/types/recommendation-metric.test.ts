import { describe, expect, it } from "vitest";
import {
  availableMetric,
  hasDisplayableValue,
  staleMetric,
  unavailableMetric,
  type RecommendationMetric
} from "./recommendation-metric.js";
import { isUsable, toConfidenceLabel, toConfidenceScore, type DataProvenance } from "./provenance.js";

describe("métrica disponível", () => {
  it("aceita 50 como valor legítimo calculado, com status disponível", () => {
    const metric = availableMetric({
      key: "TEAM_COMPOSITION",
      value: 50,
      confidence: 0.72,
      provenance: { sourceType: "DERIVED", algorithmVersion: "1.0.0" }
    });

    expect(metric.value).toBe(50);
    expect(metric.status).toBe("AVAILABLE");
    expect(metric.confidence).toBe(0.72);
    expect(metric.provenance?.sourceType).toBe("DERIVED");
  });

  it("marca como parcial sem virar indisponível", () => {
    const metric = availableMetric({ key: "GLOBAL_MATCHUP", value: 62, partial: true });
    expect(metric.status).toBe("PARTIAL");
    expect(metric.value).toBe(62);
    expect(isUsable(metric.status)).toBe(true);
  });

  it("deixa a confiança ausente como null, sem inventar um valor", () => {
    const metric = availableMetric({ key: "BLIND_SAFETY", value: 43 });
    expect(metric.confidence).toBeNull();
  });

  it("omite campos opcionais não informados em vez de preencher com placeholder", () => {
    const metric = availableMetric({ key: "BLIND_SAFETY", value: 43 });
    expect("provenance" in metric).toBe(false);
    expect("explanation" in metric).toBe(false);
    expect("unavailableReason" in metric).toBe(false);
    expect("staleReason" in metric).toBe(false);
  });
});

describe("métrica indisponível", () => {
  const metric = unavailableMetric("GLOBAL_MATCHUP", "Nenhuma fonte global configurada");

  it("tem valor ausente e motivo declarado", () => {
    expect(metric.value).toBeNull();
    expect(metric.status).toBe("UNAVAILABLE");
    expect(metric.unavailableReason).toBe("Nenhuma fonte global configurada");
  });

  it("não converte a ausência em 0", () => {
    expect(metric.value).not.toBe(0);
  });

  it("não converte a ausência em 50", () => {
    expect(metric.value).not.toBe(50);
  });

  it("não tem confiança", () => {
    expect(metric.confidence).toBeNull();
  });

  it("não é exibível como barra", () => {
    expect(hasDisplayableValue(metric)).toBe(false);
    expect(isUsable(metric.status)).toBe(false);
  });
});

describe("métrica desatualizada", () => {
  const metric = staleMetric({
    key: "META_STRENGTH",
    value: 61,
    staleReason: "Coletado no patch 16.13, patch atual é 16.14"
  });

  it("é diferente de disponível, mesmo mantendo o último valor", () => {
    expect(metric.status).toBe("STALE");
    expect(metric.status).not.toBe("AVAILABLE");
    expect(metric.value).toBe(61);
    expect(metric.staleReason).toContain("16.13");
  });

  it("não é tratada como utilizável enquanto informação atual", () => {
    expect(isUsable(metric.status)).toBe(false);
  });

  it("aceita ter perdido até o último valor conhecido", () => {
    const semValor = staleMetric({ key: "META_STRENGTH", value: null, staleReason: "Cache vencido" });
    expect(semValor.value).toBeNull();
    expect(semValor.status).toBe("STALE");
  });
});

describe("proveniência", () => {
  it("distingue dado oficial de dado derivado", () => {
    const oficial: DataProvenance = {
      sourceType: "OFFICIAL",
      sourceId: "riot-api",
      resource: "/lol/match/v5/matches/{matchId}",
      patch: "16.14"
    };
    const derivado: DataProvenance = { sourceType: "DERIVED", sourceId: "sparta", algorithmVersion: "1.0.0" };

    expect(oficial.sourceType).not.toBe(derivado.sourceType);
    // Dado oficial não carrega versão de algoritmo; derivado não carrega patch
    // de publicação. Cada um só informa o que de fato se aplica a ele.
    expect(oficial.algorithmVersion).toBeUndefined();
    expect(derivado.patch).toBeUndefined();
  });

  it("distingue amostra medida como zero de amostra desconhecida", () => {
    const medida: DataProvenance = { sourceType: "CALCULATED", sampleSize: 0 };
    const desconhecida: DataProvenance = { sourceType: "CALCULATED" };

    expect(medida.sampleSize).toBe(0);
    expect(desconhecida.sampleSize).toBeUndefined();
  });

  it("atravessa confiança numérica e categórica de forma consistente", () => {
    expect(toConfidenceLabel(0.85)).toBe("high");
    expect(toConfidenceLabel(0.55)).toBe("medium");
    expect(toConfidenceLabel(0.2)).toBe("low");
    expect(toConfidenceLabel(toConfidenceScore("high"))).toBe("high");
  });
});

describe("métricas por candidato", () => {
  it("mantém disponibilidade independente entre candidatos", () => {
    const candidatoA: RecommendationMetric[] = [
      availableMetric({ key: "LANE_MATCHUP", value: 58, confidence: 0.6 }),
      availableMetric({ key: "PERSONAL_PERFORMANCE", value: 52 })
    ];
    const candidatoB: RecommendationMetric[] = [
      unavailableMetric("LANE_MATCHUP", "Sem histórico deste confronto"),
      availableMetric({ key: "PERSONAL_PERFORMANCE", value: 71 })
    ];

    const matchupA = candidatoA.find((metric) => metric.key === "LANE_MATCHUP")!;
    const matchupB = candidatoB.find((metric) => metric.key === "LANE_MATCHUP")!;

    expect(matchupA.status).toBe("AVAILABLE");
    expect(matchupB.status).toBe("UNAVAILABLE");
    expect(matchupA.value).toBe(58);
    expect(matchupB.value).toBeNull();
    // A indisponibilidade de um candidato não contamina o outro.
    expect(candidatoB.find((metric) => metric.key === "PERSONAL_PERFORMANCE")!.value).toBe(71);
  });

  it("mantém separados os conceitos que não podem ser fundidos", () => {
    const chaves = [
      "PERSONAL_MATCHUP",
      "GLOBAL_MATCHUP",
      "LANE_MATCHUP",
      "PATCH_OFFICIAL_CHANGE",
      "PATCH_IMPACT",
      "META_STRENGTH",
      "CHAMPION_DIFFICULTY",
      "EXECUTION_RISK",
      "ALLY_SYNERGY",
      "TEAM_COMPOSITION",
      "ENEMY_COMPOSITION_ANSWER"
    ] as const;

    const metricas = chaves.map((key) => availableMetric({ key, value: 50 }));
    expect(new Set(metricas.map((metric) => metric.key)).size).toBe(chaves.length);
  });
});
