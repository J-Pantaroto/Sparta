import { describe, expect, it } from "vitest";
import { deriveChampionTag, deriveDamageProfile, mergeChampionTags } from "./champion-tag-derivation.js";
import type { ChampionClassProfile, ChampionTag } from "../types/domain.js";

function profile(overrides: Partial<ChampionClassProfile> = {}): ChampionClassProfile {
  return {
    championId: 1,
    championName: "Teste",
    tags: ["Mage"],
    attack: 3,
    defense: 4,
    magic: 8,
    difficulty: 5,
    ...overrides
  };
}

describe("deriveDamageProfile", () => {
  it("classifica mago puro como AP e atirador puro como AD", () => {
    expect(deriveDamageProfile(profile({ tags: ["Mage"] }))).toBe("AP");
    expect(deriveDamageProfile(profile({ tags: ["Marksman"], attack: 8, magic: 2 }))).toBe("AD");
  });

  it("desempata hibrido pelas notas publicadas, nao pela ordem das tags", () => {
    expect(deriveDamageProfile(profile({ tags: ["Mage", "Assassin"], attack: 3, magic: 9 }))).toBe("AP");
    expect(deriveDamageProfile(profile({ tags: ["Mage", "Assassin"], attack: 9, magic: 3 }))).toBe("AD");
  });

  it("marca UTILITY so pra suporte sem dano expressivo dos dois tipos", () => {
    expect(deriveDamageProfile(profile({ tags: ["Support"], attack: 2, magic: 3 }))).toBe("UTILITY");
    // Suporte que tambem e mago continua AP - o dano magico e real.
    expect(deriveDamageProfile(profile({ tags: ["Support", "Mage"], attack: 2, magic: 8 }))).toBe("AP");
  });

  it("cai em MIXED quando tank/suporte tem attack e magic proximos", () => {
    expect(deriveDamageProfile(profile({ tags: ["Tank"], attack: 6, magic: 6 }))).toBe("MIXED");
  });
});

describe("deriveChampionTag", () => {
  it("mantem todos os atributos entre 0 e 1", () => {
    const casos: ChampionClassProfile[] = [
      profile({ tags: ["Tank"], defense: 10, difficulty: 10 }),
      profile({ tags: ["Assassin"], defense: 0, difficulty: 0 }),
      profile({ tags: ["Marksman", "Assassin"], defense: 2, difficulty: 7 }),
      profile({ tags: [] })
    ];

    casos.forEach((caso) => {
      const tag = deriveChampionTag(caso);
      const valores = [
        tag.blindSafety,
        tag.difficulty,
        tag.engage,
        tag.peel,
        tag.frontline,
        tag.pickoff,
        tag.waveclear,
        tag.scaling,
        tag.earlyPressure
      ];
      valores.forEach((valor) => {
        expect(valor).toBeGreaterThanOrEqual(0);
        expect(valor).toBeLessThanOrEqual(1);
      });
    });
  });

  it("da mais linha de frente a tanque que a atirador", () => {
    const tanque = deriveChampionTag(profile({ tags: ["Tank"], defense: 8 }));
    const atirador = deriveChampionTag(profile({ tags: ["Marksman"], defense: 2 }));
    expect(tanque.frontline).toBeGreaterThan(atirador.frontline);
    expect(atirador.scaling).toBeGreaterThan(tanque.scaling);
  });

  it("combina hibrido pelo maior valor de cada dimensao, nao pela media", () => {
    const suporteTanque = deriveChampionTag(profile({ tags: ["Support", "Tank"], defense: 7 }));
    const soSuporte = deriveChampionTag(profile({ tags: ["Support"], defense: 7 }));
    const soTanque = deriveChampionTag(profile({ tags: ["Tank"], defense: 7 }));

    // Protege como suporte E segura a frente como tanque.
    expect(suporteTanque.peel).toBe(soSuporte.peel);
    expect(suporteTanque.frontline).toBe(soTanque.frontline);
  });

  it("usa o menor blindSafety entre as classes - a mais arriscada manda", () => {
    const assassinoTanque = deriveChampionTag(profile({ tags: ["Tank", "Assassin"], difficulty: 0 }));
    const soTanque = deriveChampionTag(profile({ tags: ["Tank"], difficulty: 0 }));
    expect(assassinoTanque.blindSafety).toBeLessThan(soTanque.blindSafety);
  });

  it("penaliza blindSafety conforme a dificuldade publicada", () => {
    const facil = deriveChampionTag(profile({ tags: ["Mage"], difficulty: 1 }));
    const dificil = deriveChampionTag(profile({ tags: ["Mage"], difficulty: 10 }));
    expect(dificil.blindSafety).toBeLessThan(facil.blindSafety);
  });

  it("nao inventa roles - a Data Dragon nao publica rota", () => {
    expect(deriveChampionTag(profile()).roles).toEqual([]);
  });

  it("campeao sem classe reconhecida fica neutro em vez de receber perfil inventado", () => {
    const tag = deriveChampionTag(profile({ tags: ["Coisa"] }));
    expect(tag.engage).toBe(0.5);
    expect(tag.peel).toBe(0.5);
    expect(tag.tags).toEqual([]);
  });

  it("gera etiquetas descritivas a partir dos proprios valores", () => {
    const atirador = deriveChampionTag(profile({ tags: ["Marksman"], defense: 2 }));
    expect(atirador.tags).toContain("marksman");
    expect(atirador.tags).toContain("scaling");
    expect(atirador.tags).not.toContain("frontline");
  });
});

describe("mergeChampionTags", () => {
  const derivado: ChampionTag = { ...deriveChampionTag(profile({ championId: 61, championName: "Orianna" })) };
  const curado: ChampionTag = {
    championId: 61,
    championName: "Orianna",
    roles: ["MID"],
    damageProfile: "AP",
    tags: ["control_mage"],
    blindSafety: 0.82,
    difficulty: 0.7,
    engage: 0.4,
    peel: 0.6,
    frontline: 0.1,
    pickoff: 0.5,
    waveclear: 0.9,
    scaling: 0.85,
    earlyPressure: 0.45
  };

  it("preserva a entrada curada por cima da derivada", () => {
    const resultado = mergeChampionTags([derivado], [curado]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toEqual(curado);
  });

  it("mantem os derivados que nao tem curadoria", () => {
    const outro = deriveChampionTag(profile({ championId: 103, championName: "Ahri" }));
    const resultado = mergeChampionTags([derivado, outro], [curado]);
    expect(resultado.map((tag) => tag.championName)).toEqual(["Ahri", "Orianna"]);
  });
});
