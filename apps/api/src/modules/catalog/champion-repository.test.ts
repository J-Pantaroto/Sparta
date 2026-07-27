import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsertMock, championTagFindManyMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  championTagFindManyMock: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: { champion: { upsert: upsertMock }, championTag: { findMany: championTagFindManyMock } }
}));

vi.mock("@sparta/riot", () => ({
  fetchDataDragonVersions: vi.fn().mockResolvedValue(["14.14.1"]),
  fetchDataDragonChampions: vi.fn().mockResolvedValue([
    { key: "61", id: "Orianna", name: "Orianna", title: "a Donzela Mecânica", tags: ["Mage"] },
    { key: "103", id: "Ahri", name: "Ahri", title: "a Raposa de Nove Caudas", tags: ["Mage", "Assassin"] },
    { key: "266", id: "Aatrox", name: "Aatrox", title: "a Espada das Trevas", tags: ["Fighter"] }
  ])
}));

vi.mock("../../db/api-cache.js", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined)
}));

import { findAllChampionTags, syncChampionCatalog } from "./champion-repository.js";

describe("champion-repository", () => {
  beforeEach(() => {
    upsertMock.mockClear();
  });

  it("mapeia key (id numerico) e id (slug) do Data Dragon para id/key do Sparta", async () => {
    const result = await syncChampionCatalog();

    expect(result).toEqual({ version: "14.14.1", count: 3 });
    expect(upsertMock).toHaveBeenCalledTimes(3);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 61 },
        create: expect.objectContaining({ id: 61, key: "Orianna", name: "Orianna", roles: [] })
      })
    );
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 266 },
        create: expect.objectContaining({ id: 266, key: "Aatrox", name: "Aatrox" })
      })
    );
  });
});

describe("findAllChampionTags - proveniência (Etapa 8)", () => {
  const linhaBase = {
    championId: 266,
    champion: { name: "Aatrox", roles: [] },
    damageProfile: "AD",
    tags: ["fighter"],
    blindSafety: 0.6,
    difficulty: 0.4,
    engage: 0.6,
    peel: 0.3,
    frontline: 0.56,
    pickoff: 0.45,
    waveclear: 0.5,
    scaling: 0.55,
    earlyPressure: 0.65
  };

  const semProveniencia = {
    dataDragonVersion: null,
    locale: null,
    sourceResource: null,
    algorithmVersion: null,
    generatedAt: null,
    reviewState: null,
    reviewedDimensions: [] as string[]
  };

  beforeEach(() => {
    championTagFindManyMock.mockReset();
  });

  it("linha histórica (colunas nulas) sai sem proveniência - origem não informada", async () => {
    championTagFindManyMock.mockResolvedValue([{ ...linhaBase, ...semProveniencia }]);

    const [tag] = await findAllChampionTags();

    expect(tag.provenance).toBeUndefined();
    // E não é classificada como revisada nem como derivada por default.
    expect(tag.pickoff).toBe(0.45);
  });

  it("linha com proveniência carrega versão da fonte, algoritmo e estado de revisão", async () => {
    championTagFindManyMock.mockResolvedValue([
      {
        ...linhaBase,
        dataDragonVersion: "16.14.1",
        locale: "pt_BR",
        sourceResource: "champion.json",
        algorithmVersion: "champion-tag-derivation/1.0.0",
        generatedAt: new Date("2026-07-27T21:00:00.000Z"),
        reviewState: "UNREVIEWED",
        reviewedDimensions: []
      }
    ]);

    const [tag] = await findAllChampionTags();

    expect(tag.provenance?.source.sourceType).toBe("DERIVED");
    expect(tag.provenance?.source.patch).toBe("16.14.1");
    expect(tag.provenance?.source.locale).toBe("pt_BR");
    expect(tag.provenance?.source.algorithmVersion).toBe("champion-tag-derivation/1.0.0");
    expect(tag.provenance?.reviewState).toBe("UNREVIEWED");
  });

  it("estado é recalculado da lista persistida, não copiado da coluna", async () => {
    championTagFindManyMock.mockResolvedValue([
      {
        ...linhaBase,
        dataDragonVersion: "16.14.1",
        locale: "pt_BR",
        sourceResource: "champion.json",
        algorithmVersion: "champion-tag-derivation/1.0.0",
        generatedAt: new Date("2026-07-27T21:00:00.000Z"),
        // Coluna diz REVIEWED, mas só uma dimensão está na lista.
        reviewState: "REVIEWED",
        reviewedDimensions: ["pickoff"]
      }
    ]);

    const [tag] = await findAllChampionTags();

    expect(tag.provenance?.reviewState).toBe("PARTIALLY_REVIEWED");
    expect(tag.provenance?.reviewedDimensions).toEqual(["pickoff"]);
  });

  it("dimensão desconhecida persistida é descartada em vez de virar chave inválida", async () => {
    championTagFindManyMock.mockResolvedValue([
      {
        ...linhaBase,
        dataDragonVersion: "16.14.1",
        locale: "pt_BR",
        sourceResource: "champion.json",
        algorithmVersion: "champion-tag-derivation/1.0.0",
        generatedAt: new Date("2026-07-27T21:00:00.000Z"),
        reviewState: "PARTIALLY_REVIEWED",
        reviewedDimensions: ["pickoff", "dimensaoInexistente"]
      }
    ]);

    const [tag] = await findAllChampionTags();
    expect(tag.provenance?.reviewedDimensions).toEqual(["pickoff"]);
  });

  it("nenhuma confiança numérica é inventada", async () => {
    championTagFindManyMock.mockResolvedValue([
      {
        ...linhaBase,
        dataDragonVersion: "16.14.1",
        locale: "pt_BR",
        sourceResource: "champion.json",
        algorithmVersion: "champion-tag-derivation/1.0.0",
        generatedAt: new Date("2026-07-27T21:00:00.000Z"),
        reviewState: "REVIEWED",
        reviewedDimensions: ["pickoff"]
      }
    ]);

    const [tag] = await findAllChampionTags();
    expect(tag.provenance?.source.confidence).toBeUndefined();
  });
});
