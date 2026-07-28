import { describe, expect, it } from "vitest";
import type { ChampionCapabilityProfile } from "../types/champion-capability.js";
import type { PatchChange, PatchRelease, StructuredPatchDelta } from "./patch-intelligence.js";
import {
  THEORETICAL_PATCH_IMPACT_ALGORITHM_VERSION,
  analyzeTheoreticalPatchImpact,
  analyzeTheoreticalPatchImpacts,
  classifyPatchImpactMagnitude
} from "./theoretical-patch-impact.js";

const officialProvenance = {
  sourceType: "OFFICIAL" as const,
  sourceId: "riot-patch-notes",
  patch: "26.14",
  locale: "pt_BR",
  status: "AVAILABLE" as const
};

function delta(
  label: string,
  previous: number,
  next: number
): StructuredPatchDelta {
  return {
    label,
    previousValue: String(previous),
    newValue: String(next),
    numericPreviousValue: previous,
    numericNewValue: next,
    numericDelta: next - previous,
    status: "AVAILABLE"
  };
}

function change(
  id: string,
  structuredChanges: StructuredPatchDelta[],
  overrides: Partial<PatchChange> = {}
): PatchChange {
  return {
    id,
    entityType: "CHAMPION",
    entityId: 61,
    entityName: "Orianna",
    entityResolution: { status: "RESOLVED" },
    changeType: "ADJUSTMENT",
    affectedComponent: "Q – Comando: Atacar",
    officialSummary: "Resumo oficial.",
    officialDetails: structuredChanges.map(
      (entry) => `${entry.label}: ${entry.previousValue} ⇒ ${entry.newValue}`
    ),
    structuredChanges,
    status: "AVAILABLE",
    provenance: officialProvenance,
    ...overrides
  };
}

function release(changes: PatchChange[]): PatchRelease {
  return {
    patch: "26.14",
    title: "Notas da Atualização 26.14",
    locale: "pt_BR",
    publishedAt: "2026-07-14T18:00:00.000Z",
    collectedAt: "2026-07-28T18:00:00.000Z",
    sourceUrl:
      "https://www.leagueoflegends.com/pt-br/news/game-updates/league-of-legends-patch-26-14-notes/",
    sourceHash: "hash-26.14",
    parserVersion: "riot-patch-notes-parser/1.0.0",
    revision: 1,
    status: "AVAILABLE",
    changes,
    provenance: officialProvenance
  };
}

function burstProfile(): ChampionCapabilityProfile {
  return {
    championId: 61,
    championKey: "Orianna",
    championName: "Orianna",
    dataDragonVersion: "16.14.1",
    locale: "pt_BR",
    algorithmVersion: "champion-capability-extraction/1.0.0",
    status: "PARTIAL",
    coverage: 0.0435,
    availableCapabilities: 1,
    totalCapabilities: 23,
    sourceReferences: [
      {
        sourceType: "SPELL",
        sourceId: "OrianaIzunaCommand",
        sourceName: "Comando: Atacar"
      }
    ],
    capabilities: [
      {
        key: "BURST",
        status: "AVAILABLE",
        value: true,
        evidence: [
          {
            sourceType: "SPELL",
            sourceId: "OrianaIzunaCommand",
            sourceName: "Comando: Atacar",
            sourceText: "Orianna ordena que sua Esfera ataque o local-alvo.",
            extractionRule: "test-burst"
          }
        ],
        provenance: {
          sourceType: "CALCULATED",
          sourceId: "data-dragon",
          algorithmVersion: "champion-capability-extraction/1.0.0",
          status: "AVAILABLE"
        }
      }
    ]
  };
}

describe("impacto teórico do patch", () => {
  it("deriva cooldown menor como frequência positiva sem obedecer ao changeType", () => {
    const result = analyzeTheoreticalPatchImpact({
      release: release([
        change("q-cooldown", [delta("Tempo de Recarga", 10, 8)], {
          changeType: "NERF"
        })
      ]),
      championId: 61
    });

    expect(result).toMatchObject({
      entityChanged: true,
      status: "AVAILABLE",
      coverage: 1,
      algorithmVersion: THEORETICAL_PATCH_IMPACT_ALGORITHM_VERSION,
      signals: [
        {
          dimension: "COOLDOWN",
          direction: "POSITIVE",
          magnitude: "MODERATE",
          supportingChangeIds: ["q-cooldown"]
        }
      ],
      unavailableSignals: []
    });
    expect(result.signals[0]?.explanation).toContain("frequência teórica");
    expect(JSON.stringify(result)).not.toMatch(/win rate|META_STRENGTH|tier/i);
  });

  it("não transforma BUFF genérico em impacto positivo", () => {
    const result = analyzeTheoreticalPatchImpact({
      release: release([
        change(
          "q-text-only",
          [{ label: "Funcionamento", status: "PARTIAL" }],
          { changeType: "BUFF" }
        )
      ]),
      championId: 61
    });

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.coverage).toBe(0);
    expect(result.signals).toEqual([]);
    expect(result.unavailableSignals[0]).toMatchObject({
      dimension: "UNCLASSIFIED",
      direction: "UNKNOWN",
      magnitude: null,
      status: "UNAVAILABLE"
    });
  });

  it("preserva compensações opostas como MIXED e não duplica a mudança agregada", () => {
    const result = analyzeTheoreticalPatchImpact({
      release: release([
        change("mobility-mixed", [
          delta("Velocidade de Movimento inicial", 30, 40),
          delta("Velocidade de Movimento adicional", 40, 30)
        ])
      ]),
      championId: 61
    });

    expect(result.coverage).toBe(1);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({
      dimension: "MOBILITY",
      direction: "MIXED",
      magnitude: null,
      supportingChangeIds: ["mobility-mixed"]
    });
    expect(result.signals[0]?.evidence).toHaveLength(2);
  });

  it("preserva dano e cooldown compensados como dimensões independentes", () => {
    const result = analyzeTheoreticalPatchImpact({
      release: release([
        change("q-compensated", [
          delta("Dano inicial", 100, 120),
          delta("Tempo de Recarga", 8, 10)
        ])
      ]),
      championId: 61
    });

    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: "INITIAL_DAMAGE",
          direction: "POSITIVE"
        }),
        expect.objectContaining({
          dimension: "COOLDOWN",
          direction: "NEGATIVE"
        })
      ])
    );
    expect(result.patchChangeIds).toEqual(["q-compensated"]);
  });

  it("distingue redução de cooldown do próprio valor de cooldown", () => {
    const result = analyzeTheoreticalPatchImpact({
      release: release([
        change("q-refund", [delta("Redução do Tempo de Recarga", 2, 3)])
      ]),
      championId: 61
    });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({
      dimension: "COOLDOWN",
      direction: "POSITIVE"
    });
  });

  it("mantém bugfix desconhecido mesmo quando há números estruturados", () => {
    const result = analyzeTheoreticalPatchImpact({
      release: release([
        change("bugfix-damage", [delta("Dano inicial", 10, 12)], {
          changeType: "BUGFIX"
        })
      ]),
      championId: 61
    });

    expect(result.signals).toEqual([]);
    expect(result.unavailableSignals[0]).toMatchObject({
      direction: "UNKNOWN",
      status: "UNAVAILABLE"
    });
    expect(result.unavailableSignals[0]?.unavailableReason).toContain("Correção de bug");
  });

  it("vincula dano à capacidade da mesma habilidade e declara a relação derivada", () => {
    const result = analyzeTheoreticalPatchImpact({
      release: release([change("q-damage", [delta("Dano", 100, 120)])]),
      championId: 61,
      capabilityProfile: burstProfile()
    });

    expect(result.signals[0]).toMatchObject({
      dimension: "BURST",
      direction: "POSITIVE",
      magnitude: "MODERATE",
      evidence: [
        {
          relationship: "CAPABILITY_DERIVED",
          capability: {
            key: "BURST",
            sourceId: "OrianaIzunaCommand",
            sourceName: "Comando: Atacar"
          }
        }
      ]
    });
    expect(result.signals[0]?.explanation).toContain("foi derivada pelo Sparta");
    expect(result.capabilityAlgorithmVersion).toBe(
      "champion-capability-extraction/1.0.0"
    );
  });

  it("não cria capacidade de dano quando o perfil estruturado não sustenta a relação", () => {
    const result = analyzeTheoreticalPatchImpact({
      release: release([change("q-damage", [delta("Dano", 100, 120)])]),
      championId: 61
    });

    expect(result.signals).toEqual([]);
    expect(result.unavailableSignals[0]?.dimension).toBe("UNCLASSIFIED");
  });

  it("não classifica magnitude sem escalar comparável e documenta as bandas objetivas", () => {
    expect(classifyPatchImpactMagnitude(100, 105)).toBe("MINOR");
    expect(classifyPatchImpactMagnitude(100, 110)).toBe("MODERATE");
    expect(classifyPatchImpactMagnitude(100, 125)).toBe("MODERATE");
    expect(classifyPatchImpactMagnitude(100, 126)).toBe("MAJOR");
    expect(classifyPatchImpactMagnitude(0, 10)).toBeNull();

    const result = analyzeTheoreticalPatchImpact({
      release: release([
        change("q-series", [
          {
            label: "Tempo de Recarga",
            previousValue: "10/9/8",
            newValue: "9/8/7",
            status: "AVAILABLE"
          }
        ])
      ]),
      championId: 61
    });
    expect(result.signals).toEqual([]);
    expect(result.unavailableSignals[0]).toMatchObject({
      dimension: "COOLDOWN",
      magnitude: null
    });
  });

  it("distingue ausência legítima de mudança de análise indisponível", () => {
    const result = analyzeTheoreticalPatchImpact({
      release: release([]),
      championId: 103
    });
    expect(result).toMatchObject({
      championId: 103,
      entityChanged: false,
      status: "AVAILABLE",
      coverage: 1,
      signals: [],
      unavailableSignals: [],
      patchChangeIds: []
    });
  });

  it("mantém coleção vazia disponível quando o release válido não alterou campeões", () => {
    const result = analyzeTheoreticalPatchImpacts({ release: release([]) });
    expect(result).toMatchObject({
      patch: "26.14",
      status: "AVAILABLE",
      impacts: []
    });
  });

  it("produz saída idêntica para o mesmo release, revisão e capacidades", () => {
    const input = {
      release: release([change("q-cooldown", [delta("Tempo de Recarga", 10, 8)])]),
      championId: 61,
      capabilityProfile: burstProfile()
    };
    expect(analyzeTheoreticalPatchImpact(input)).toEqual(
      analyzeTheoreticalPatchImpact(input)
    );
  });
});
