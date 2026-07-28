import { describe, expect, it } from "vitest";
import type { ChampionTag } from "../types/domain.js";
import { CHAMPION_TAG_DIMENSIONS, deriveReviewState, isChampionTagOutdated } from "../types/champion-tag-provenance.js";
import { CHAMPION_TAG_DERIVATION_VERSION } from "./champion-tag-derivation.js";
import {
  buildChampionTagManifest,
  entryProvenance,
  parseChampionTagManifest,
  serializeChampionTagManifest,
  toChampionTags,
  validateChampionTagEntries,
  type ChampionTagManifest,
  type ChampionTagManifestEntry
} from "./champion-tag-manifest.js";

const NOW = "2026-07-27T21:00:00.000Z";

function derived(championName: string, championId: number, overrides: Partial<ChampionTag> = {}): ChampionTag {
  return {
    championId,
    championName,
    roles: [],
    damageProfile: "AD",
    tags: ["fighter"],
    blindSafety: 0.7,
    difficulty: 0.4,
    engage: 0.6,
    peel: 0.3,
    frontline: 0.65,
    pickoff: 0.45,
    waveclear: 0.5,
    scaling: 0.55,
    earlyPressure: 0.65,
    ...overrides
  };
}

function entry(championName: string, championId: number, overrides: Partial<ChampionTagManifestEntry> = {}): ChampionTagManifestEntry {
  const base = derived(championName, championId);
  return {
    championId,
    championName,
    roles: base.roles,
    damageProfile: base.damageProfile,
    tags: base.tags,
    blindSafety: base.blindSafety,
    difficulty: base.difficulty,
    engage: base.engage,
    peel: base.peel,
    frontline: base.frontline,
    pickoff: base.pickoff,
    waveclear: base.waveclear,
    scaling: base.scaling,
    earlyPressure: base.earlyPressure,
    ...overrides
  };
}

const METADATA = {
  dataDragonVersion: "16.14.1",
  locale: "pt_BR",
  sourceResource: "champion.json",
  algorithmVersion: CHAMPION_TAG_DERIVATION_VERSION,
  difficultyNormalizationAlgorithmVersion:
    "champion-difficulty-normalization/1.0.0",
  generatedAt: NOW
};

function build(previous: ChampionTagManifest, derivedTags: ChampionTag[], version = "16.14.1") {
  return buildChampionTagManifest({
    derived: derivedTags,
    previous,
    dataDragonVersion: version,
    locale: "pt_BR",
    now: NOW
  });
}

describe("manifesto de ChampionTag - overrides", () => {
  it("regeneração preserva a dimensão sobrescrita à mão", () => {
    const previous: ChampionTagManifest = {
      metadata: METADATA,
      champions: [
        entry("Aatrox", 266, {
          pickoff: 0.99,
          review: { overrides: { pickoff: { reason: "revisado a mão" } } }
        })
      ]
    };

    const { manifest, report } = build(previous, [derived("Aatrox", 266)]);

    expect(manifest.champions[0].pickoff).toBe(0.99);
    expect(report.preservedOverrides).toBe(1);
    expect(report.championsWithOverrides).toBe(1);
  });

  it("override de uma dimensão não congela as outras: elas recebem a derivação nova", () => {
    const previous: ChampionTagManifest = {
      metadata: METADATA,
      champions: [
        entry("Aatrox", 266, {
          pickoff: 0.99,
          engage: 0.11,
          review: { overrides: { pickoff: {} } }
        })
      ]
    };

    // Derivação nova traz engage diferente do que estava no arquivo.
    const { manifest } = build(previous, [derived("Aatrox", 266, { engage: 0.8 })]);

    expect(manifest.champions[0].pickoff).toBe(0.99);
    expect(manifest.champions[0].engage).toBe(0.8);
  });

  it("override de uma dimensão não altera a origem declarada das demais", () => {
    const previous: ChampionTagManifest = {
      metadata: METADATA,
      champions: [entry("Aatrox", 266, { pickoff: 0.99, review: { overrides: { pickoff: {} } } })]
    };

    const { manifest } = build(previous, [derived("Aatrox", 266)]);
    const provenance = entryProvenance(manifest.champions[0], manifest.metadata);

    expect(provenance?.reviewState).toBe("PARTIALLY_REVIEWED");
    expect(provenance?.reviewedDimensions).toEqual(["pickoff"]);
    // As outras oito continuam derivadas: não aparecem na lista revisada.
    expect(provenance?.reviewedDimensions).not.toContain("engage");
  });

  it("motivo e data do override sobrevivem à regeneração", () => {
    const previous: ChampionTagManifest = {
      metadata: METADATA,
      champions: [
        entry("Aatrox", 266, {
          pickoff: 0.99,
          review: { overrides: { pickoff: { reason: "classe não descreve o kit", reviewedAt: "2026-07-27" } } }
        })
      ]
    };

    const { manifest } = build(previous, [derived("Aatrox", 266)]);
    expect(manifest.champions[0].review?.overrides.pickoff).toEqual({
      reason: "classe não descreve o kit",
      reviewedAt: "2026-07-27"
    });
  });

  it("edição sem override registrado é avisada, não descartada em silêncio", () => {
    const previous: ChampionTagManifest = {
      metadata: METADATA,
      champions: [entry("Aatrox", 266, { engage: 0.11 })]
    };

    const { report } = build(previous, [derived("Aatrox", 266, { engage: 0.6 })]);
    expect(report.unregisteredEdits).toEqual([{ championName: "Aatrox", dimension: "engage" }]);
  });
});

describe("manifesto de ChampionTag - estado de revisão", () => {
  it("sem override, o estado é UNREVIEWED e a lista revisada é vazia", () => {
    const provenance = entryProvenance(entry("Aatrox", 266), METADATA);
    expect(provenance?.reviewState).toBe("UNREVIEWED");
    expect(provenance?.reviewedDimensions).toEqual([]);
  });

  it("com todas as dimensões sobrescritas, o estado é REVIEWED", () => {
    const overrides = Object.fromEntries(CHAMPION_TAG_DIMENSIONS.map((dimension) => [dimension, {}]));
    const provenance = entryProvenance(entry("Aatrox", 266, { review: { overrides } }), METADATA);
    expect(provenance?.reviewState).toBe("REVIEWED");
    expect(provenance?.reviewedDimensions).toHaveLength(CHAMPION_TAG_DIMENSIONS.length);
  });

  it("o estado é sempre derivado da lista, nunca declarado à parte", () => {
    expect(deriveReviewState([])).toBe("UNREVIEWED");
    expect(deriveReviewState(["pickoff"])).toBe("PARTIALLY_REVIEWED");
    expect(deriveReviewState([...CHAMPION_TAG_DIMENSIONS])).toBe("REVIEWED");
  });

  it("estado de revisão não vira confiança numérica em lugar nenhum", () => {
    const overrides = Object.fromEntries(CHAMPION_TAG_DIMENSIONS.map((dimension) => [dimension, {}]));
    const revisado = entryProvenance(entry("Aatrox", 266, { review: { overrides } }), METADATA);
    const semRevisao = entryProvenance(entry("Ahri", 103), METADATA);

    expect(revisado?.source.confidence).toBeUndefined();
    expect(semRevisao?.source.confidence).toBeUndefined();
  });
});

describe("manifesto de ChampionTag - origem", () => {
  it("entrada derivada nunca é declarada como oficial da Riot", () => {
    const provenance = entryProvenance(entry("Aatrox", 266), METADATA);
    expect(provenance?.source.sourceType).toBe("DERIVED");
    expect(provenance?.source.sourceType).not.toBe("OFFICIAL");
  });

  it("entrada revisada também não vira oficial", () => {
    const overrides = Object.fromEntries(CHAMPION_TAG_DIMENSIONS.map((dimension) => [dimension, {}]));
    const provenance = entryProvenance(entry("Aatrox", 266, { review: { overrides } }), METADATA);
    expect(provenance?.source.sourceType).toBe("DERIVED");
  });

  it("carrega versão da fonte, locale, recurso, versão do algoritmo e data", () => {
    const provenance = entryProvenance(entry("Aatrox", 266), METADATA);
    expect(provenance?.source.patch).toBe("16.14.1");
    expect(provenance?.source.locale).toBe("pt_BR");
    expect(provenance?.source.resource).toBe("champion.json");
    expect(provenance?.source.algorithmVersion).toBe(CHAMPION_TAG_DERIVATION_VERSION);
    expect(provenance?.source.collectedAt).toBe(NOW);
  });

  it("versão ausente nos metadados permanece ausente, nunca preenchida", () => {
    const provenance = entryProvenance(entry("Aatrox", 266), { locale: "pt_BR" });
    expect(provenance?.source.patch).toBeUndefined();
    expect(provenance?.source.algorithmVersion).toBeUndefined();
  });
});

describe("manifesto de ChampionTag - formato antigo", () => {
  const legado = [
    {
      championId: 103,
      championName: "Ahri",
      roles: ["MID"],
      damageProfile: "AP",
      tags: ["pickoff"],
      blindSafety: 0.74,
      difficulty: 0.55,
      engage: 0.45,
      peel: 0.35,
      frontline: 0.05,
      pickoff: 0.85,
      waveclear: 0.72,
      scaling: 0.62,
      earlyPressure: 0.6,
      source: "manual"
    }
  ];

  it("array plano continua sendo lido, com os valores intactos", () => {
    const manifest = parseChampionTagManifest(legado);
    expect(manifest.champions).toHaveLength(1);
    expect(manifest.champions[0].pickoff).toBe(0.85);
    expect(manifest.champions[0].roles).toEqual([]);
  });

  it("registro histórico sai sem proveniência - origem não informada", () => {
    const tags = toChampionTags(parseChampionTagManifest(legado));
    expect(tags[0].provenance).toBeUndefined();
  });

  it("`source: manual` do formato antigo NÃO é promovido a revisado", () => {
    const manifest = parseChampionTagManifest(legado);
    const provenance = entryProvenance(manifest.champions[0], manifest.metadata);
    expect(provenance).toBeUndefined();
    expect(manifest.metadata).toBeUndefined();
  });

  it("conteúdo irreconhecível vira lista vazia em vez de exceção", () => {
    expect(parseChampionTagManifest({ nada: true }).champions).toEqual([]);
    expect(parseChampionTagManifest(null).champions).toEqual([]);
  });
});

describe("manifesto de ChampionTag - gerador", () => {
  it("detecta campeão novo e campeão que sumiu da fonte", () => {
    const previous: ChampionTagManifest = { metadata: METADATA, champions: [entry("Aatrox", 266), entry("Ahri", 103)] };
    const { report } = build(previous, [derived("Aatrox", 266), derived("Briar", 233)]);

    expect(report.added).toEqual(["Briar"]);
    expect(report.removed).toEqual(["Ahri"]);
  });

  it("valida a faixa 0-1 das dimensões numéricas", () => {
    const issues = validateChampionTagEntries([
      entry("Aatrox", 266, { pickoff: 1.4 }),
      entry("Ahri", 103, { engage: Number.NaN })
    ]);

    expect(issues.map((issue) => issue.dimension).sort()).toEqual(["engage", "pickoff"]);
    expect(issues.find((issue) => issue.dimension === "engage")?.problem).toMatch(/finito/);
  });

  it("resultado funcional é determinístico e ordenado por nome", () => {
    const previous: ChampionTagManifest = { champions: [] };
    const primeiro = build(previous, [derived("Zed", 238), derived("Ahri", 103)]).manifest;
    const segundo = build(previous, [derived("Ahri", 103), derived("Zed", 238)]).manifest;

    expect(primeiro.champions.map((entry) => entry.championName)).toEqual(["Ahri", "Zed"]);
    expect(serializeChampionTagManifest(primeiro)).toBe(serializeChampionTagManifest(segundo));
  });

  it("sem mudança funcional, a data de geração anterior é mantida", () => {
    const previous: ChampionTagManifest = { metadata: METADATA, champions: [entry("Aatrox", 266)] };
    const { manifest, report } = buildChampionTagManifest({
      derived: [derived("Aatrox", 266)],
      previous,
      dataDragonVersion: "16.14.1",
      locale: "pt_BR",
      now: "2027-01-01T00:00:00.000Z"
    });

    expect(report.unchanged).toBe(true);
    expect(manifest.metadata?.generatedAt).toBe(NOW);
  });

  it("versão nova da fonte marca o arquivo como mudado e atualiza a data", () => {
    const previous: ChampionTagManifest = { metadata: METADATA, champions: [entry("Aatrox", 266)] };
    const { manifest, report } = buildChampionTagManifest({
      derived: [derived("Aatrox", 266)],
      previous,
      dataDragonVersion: "16.15.1",
      locale: "pt_BR",
      now: "2027-01-01T00:00:00.000Z"
    });

    expect(report.unchanged).toBe(false);
    expect(manifest.metadata?.dataDragonVersion).toBe("16.15.1");
    expect(manifest.metadata?.generatedAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("registra a versão real da fonte e do algoritmo nos metadados", () => {
    const { manifest } = build({ champions: [] }, [derived("Aatrox", 266)], "16.20.1");
    expect(manifest.metadata?.dataDragonVersion).toBe("16.20.1");
    expect(manifest.metadata?.algorithmVersion).toBe(CHAMPION_TAG_DERIVATION_VERSION);
    expect(manifest.metadata?.sourceResource).toBe("champion.json");
  });

  it("roles permanece vazio quando a derivação não traz rota", () => {
    const { manifest } = build({ champions: [] }, [derived("Aatrox", 266)]);
    expect(manifest.champions[0].roles).toEqual([]);
  });

  it("roles legado não sobrevive como ChampionTag", () => {
    const previous: ChampionTagManifest = {
      metadata: METADATA,
      champions: [entry("Ahri", 103, { roles: ["MID"] })]
    };

    const { manifest } = build(previous, [derived("Ahri", 103)]);
    expect(manifest.champions[0].roles).toEqual([]);
  });
});

describe("manifesto de ChampionTag - desatualização", () => {
  const atual = { dataDragonVersion: "16.14.1", algorithmVersion: CHAMPION_TAG_DERIVATION_VERSION };

  it("versão da fonte diferente marca como desatualizado", () => {
    const provenance = entryProvenance(entry("Aatrox", 266), { ...METADATA, dataDragonVersion: "16.10.1" });
    expect(isChampionTagOutdated(provenance, atual)).toBe(true);
  });

  it("versão do algoritmo diferente marca como desatualizado", () => {
    const provenance = entryProvenance(entry("Aatrox", 266), { ...METADATA, algorithmVersion: "champion-tag-derivation/0.9.0" });
    expect(isChampionTagOutdated(provenance, atual)).toBe(true);
  });

  it("versão ausente não é tratada como desatualizada - só como desconhecida", () => {
    const provenance = entryProvenance(entry("Aatrox", 266), { locale: "pt_BR" });
    expect(isChampionTagOutdated(provenance, atual)).toBe(false);
  });

  it("sem proveniência nenhuma, não afirma desatualização", () => {
    expect(isChampionTagOutdated(undefined, atual)).toBe(false);
  });
});

describe("manifesto de ChampionTag - conversão pro domínio", () => {
  it("preserva os valores exatos das dimensões", () => {
    const manifest: ChampionTagManifest = { metadata: METADATA, champions: [entry("Aatrox", 266, { pickoff: 0.42 })] };
    const [tag] = toChampionTags(manifest);

    expect(tag.pickoff).toBe(0.42);
    expect(tag.championId).toBe(266);
    expect(tag.championName).toBe("Aatrox");
  });

  it("anexa a proveniência sem alterar nenhuma dimensão", () => {
    const manifest: ChampionTagManifest = { metadata: METADATA, champions: [entry("Aatrox", 266)] };
    const [comMetadata] = toChampionTags(manifest);
    const [semMetadata] = toChampionTags({ champions: [entry("Aatrox", 266)] });

    const semProveniencia = (tag: typeof comMetadata) => {
      const copia = { ...tag };
      delete copia.provenance;
      return copia;
    };
    expect(semProveniencia(comMetadata)).toEqual(semProveniencia(semMetadata));
    expect(comMetadata.provenance).toBeDefined();
    expect(semMetadata.provenance).toBeUndefined();
  });
});
