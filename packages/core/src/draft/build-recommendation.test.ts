import { describe, expect, it } from "vitest";
import { deriveDamageStyle, recommendBuild, summarizeEnemyDamageLean } from "./build-recommendation.js";
import type { ChampionClassProfile, ItemSummary } from "../types/domain.js";

const mageChampion: ChampionClassProfile = {
  championId: 103,
  championName: "Ahri",
  tags: ["Mage", "Assassin"],
  attack: 3,
  defense: 4,
  magic: 8,
  difficulty: 5
};

const marksmanChampion: ChampionClassProfile = {
  championId: 222,
  championName: "Jinx",
  tags: ["Marksman"],
  attack: 8,
  defense: 2,
  magic: 1,
  difficulty: 6
};

const tankChampion: ChampionClassProfile = {
  championId: 54,
  championName: "Malphite",
  tags: ["Tank"],
  attack: 5,
  defense: 9,
  magic: 5,
  difficulty: 4
};

function enemy(name: string, attack: number, magic: number): ChampionClassProfile {
  return { championId: name.length, championName: name, tags: [], attack, defense: 5, magic, difficulty: 5 };
}

const items: ItemSummary[] = [
  { itemId: 1001, name: "Boots", tags: ["Boots"], goldTotal: 300 },
  { itemId: 3006, name: "Berserker's Greaves", tags: ["AttackSpeed", "Boots"], goldTotal: 1100 },
  { itemId: 3047, name: "Plated Steelcaps", tags: ["Armor", "Boots"], goldTotal: 1000 },
  { itemId: 3111, name: "Mercury's Treads", tags: ["Boots", "SpellBlock", "Tenacity"], goldTotal: 1100 },
  { itemId: 3158, name: "Ionian Boots of Lucidity", tags: ["Boots", "CooldownReduction"], goldTotal: 900 },
  { itemId: 3089, name: "Rabadon's Deathcap", tags: ["SpellDamage"], goldTotal: 3600 },
  { itemId: 3135, name: "Void Staff", tags: ["SpellDamage", "MagicPenetration"], goldTotal: 2800 },
  { itemId: 3157, name: "Zhonya's Hourglass", tags: ["SpellDamage"], goldTotal: 2600 },
  { itemId: 3031, name: "Infinity Edge", tags: ["Damage", "CriticalStrike"], goldTotal: 3400 },
  { itemId: 3072, name: "Bloodthirster", tags: ["Damage", "LifeSteal"], goldTotal: 3400 },
  { itemId: 6672, name: "Kraken Slayer", tags: ["Damage", "AttackSpeed"], goldTotal: 3400 },
  { itemId: 3065, name: "Spirit Visage", tags: ["SpellBlock", "Health", "AbilityHaste"], goldTotal: 2900 },
  { itemId: 3075, name: "Thornmail", tags: ["Armor", "Health"], goldTotal: 2700 },
  { itemId: 1052, name: "Amplifying Tome", tags: ["SpellDamage"], goldTotal: 435, into: ["3089"] }
];

describe("deriveDamageStyle", () => {
  it("identifica campeao Mage puro como AP", () => {
    expect(deriveDamageStyle({ ...mageChampion, tags: ["Mage"] })).toBe("AP");
  });

  it("identifica campeao Marksman como AD", () => {
    expect(deriveDamageStyle(marksmanChampion)).toBe("AD");
  });

  it("desempata campeao hibrido Mage+Assassin pela nota magic/attack mais alta", () => {
    expect(deriveDamageStyle(mageChampion)).toBe("AP");
  });

  it("campeao so Tank sem tag de dano desempata por attack vs magic", () => {
    expect(deriveDamageStyle(tankChampion)).toBe("MIXED");
  });
});

describe("summarizeEnemyDamageLean", () => {
  it("retorna undefined sem nenhum inimigo conhecido", () => {
    expect(summarizeEnemyDamageLean([])).toBeUndefined();
  });

  it("identifica lean magico quando a media de magic supera attack pelo threshold", () => {
    const result = summarizeEnemyDamageLean([enemy("A", 3, 9), enemy("BB", 2, 8)]);
    expect(result?.lean).toBe("MAGIC");
  });

  it("identifica lean fisico quando a media de attack supera magic pelo threshold", () => {
    const result = summarizeEnemyDamageLean([enemy("A", 9, 2), enemy("BB", 8, 3)]);
    expect(result?.lean).toBe("PHYSICAL");
  });

  it("considera equilibrado quando a diferenca fica abaixo do threshold", () => {
    const result = summarizeEnemyDamageLean([enemy("A", 5, 5), enemy("BB", 6, 5)]);
    expect(result?.lean).toBe("BALANCED");
  });
});

describe("recommendBuild", () => {
  it("campeao AP contra time inimigo fisico-heavy recomenda armadura e itens magicos", () => {
    const result = recommendBuild({
      ownChampion: mageChampion,
      enemyChampions: [enemy("A", 9, 2), enemy("BB", 8, 2), enemy("CCC", 8, 3), enemy("DDDD", 9, 1), enemy("EEEEE", 8, 2)],
      items
    });

    expect(result.boots?.name).toBe("Plated Steelcaps");
    expect(result.coreItems.length).toBeGreaterThan(0);
    expect(result.coreItems.every((item) => item.name !== "Amplifying Tome")).toBe(true);
    expect(result.situationalItems.some((item) => item.name === "Thornmail")).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "partial_enemy_team")).toBe(false);
  });

  it("campeao AP contra time inimigo magico-heavy recomenda resistencia magica", () => {
    const result = recommendBuild({
      ownChampion: mageChampion,
      enemyChampions: [enemy("A", 2, 9), enemy("BB", 2, 8), enemy("CCC", 3, 8), enemy("DDDD", 1, 9), enemy("EEEEE", 2, 8)],
      items
    });

    expect(result.boots?.name).toBe("Mercury's Treads");
    expect(result.situationalItems.some((item) => item.name === "Spirit Visage")).toBe(true);
  });

  it("campeao AD contra time equilibrado usa bota de conforto e sem itens situacionais", () => {
    const result = recommendBuild({
      ownChampion: marksmanChampion,
      enemyChampions: [enemy("A", 5, 5), enemy("BB", 6, 5)],
      items
    });

    expect(result.boots?.name).toBe("Berserker's Greaves");
    expect(result.coreItems.length).toBeGreaterThan(0);
    expect(result.situationalItems).toHaveLength(0);
  });

  it("sem inimigos conhecidos ainda recomenda itens core e emite warning honesto", () => {
    const result = recommendBuild({ ownChampion: marksmanChampion, enemyChampions: [], items });

    expect(result.coreItems.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.code === "no_enemy_data")).toBe(true);
    expect(result.situationalItems).toHaveLength(0);
  });

  it("time inimigo parcial gera warning especifico sem travar a recomendacao", () => {
    const result = recommendBuild({ ownChampion: marksmanChampion, enemyChampions: [enemy("A", 8, 2)], items });

    expect(result.warnings.some((warning) => warning.code === "partial_enemy_team")).toBe(true);
    expect(result.coreItems.length).toBeGreaterThan(0);
  });

  it("sem dado do proprio campeao devolve recomendacao vazia com warning, nunca inventa", () => {
    const result = recommendBuild({ ownChampion: undefined, enemyChampions: [], items });

    expect(result.coreItems).toHaveLength(0);
    expect(result.boots).toBeUndefined();
    expect(result.warnings.some((warning) => warning.code === "no_champion_data")).toBe(true);
  });
});
