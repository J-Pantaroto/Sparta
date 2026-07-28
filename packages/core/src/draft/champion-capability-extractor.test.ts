import { describe, expect, it } from "vitest";
import { CHAMPION_CAPABILITY_KEYS } from "../types/champion-capability.js";
import {
  CHAMPION_CAPABILITY_ALGORITHM_VERSION,
  extractChampionCapabilityProfile
} from "./champion-capability-extractor.js";
import {
  buildChampionCapabilityManifest,
  validateChampionCapabilityProfile
} from "./champion-capability-manifest.js";

function input() {
  return {
    championId: 999,
    championKey: "Example",
    championName: "Exemplo",
    dataDragonVersion: "16.14.1",
    locale: "pt_BR",
    passive: {
      name: "Passiva",
      description: "Recebe Velocidade de Movimento ao atingir um inimigo."
    },
    spells: [
      {
        id: "ExampleQ",
        name: "Controle",
        description: "Atordoa o primeiro inimigo atingido."
      },
      {
        id: "ExampleW",
        name: "Proteção",
        description: "Concede um Escudo a um aliado."
      },
      {
        id: "ExampleE",
        name: "Avanço",
        description: "Avança rapidamente em uma direção."
      }
    ],
    attackRange: 550
  } as const;
}

function capability(
  profile: ReturnType<typeof extractChampionCapabilityProfile>,
  key: (typeof CHAMPION_CAPABILITY_KEYS)[number]
) {
  return profile.capabilities.find((entry) => entry.key === key)!;
}

describe("extractChampionCapabilityProfile", () => {
  it("preserva texto, habilidade real, regra, fonte e versões", () => {
    const profile = extractChampionCapabilityProfile(input());
    const hardCc = capability(profile, "HARD_CC");

    expect(hardCc).toMatchObject({
      status: "AVAILABLE",
      value: true,
      provenance: {
        sourceType: "CALCULATED",
        patch: "16.14.1",
        locale: "pt_BR",
        algorithmVersion: CHAMPION_CAPABILITY_ALGORITHM_VERSION
      },
      evidence: [
        {
          sourceType: "SPELL",
          sourceId: "ExampleQ",
          sourceName: "Controle",
          sourceText: "Atordoa o primeiro inimigo atingido.",
          extractionRule: "HARD_CC_STUN_EXPLICIT_PT_BR/v1"
        }
      ]
    });
    expect(validateChampionCapabilityProfile(profile)).toEqual([]);
  });

  it("não converte texto ausente em capacidade negativa ou valor neutro", () => {
    const profile = extractChampionCapabilityProfile({
      ...input(),
      passive: undefined,
      spells: []
    });
    const hardCc = capability(profile, "HARD_CC");

    expect(hardCc.status).toBe("UNAVAILABLE");
    expect(hardCc.value).toBeNull();
    expect(hardCc.evidence).toEqual([]);
    expect(hardCc.unavailableReason).toMatch(/evidência explícita/i);
  });

  it("hard CC não inventa confiabilidade, alvo ou área", () => {
    const profile = extractChampionCapabilityProfile(input());

    expect(capability(profile, "HARD_CC").value).toBe(true);
    expect(capability(profile, "CC_RELIABILITY").status).toBe("UNAVAILABLE");
    expect(capability(profile, "TARGETED_CC").status).toBe("UNAVAILABLE");
    expect(capability(profile, "AREA_CC").status).toBe("UNAVAILABLE");
  });

  it("dash não implica engage e escudo não implica peel", () => {
    const profile = extractChampionCapabilityProfile(input());

    expect(capability(profile, "DASH").value).toBe(true);
    expect(capability(profile, "MOBILITY").value).toBe(true);
    expect(capability(profile, "ENGAGE").status).toBe("UNAVAILABLE");
    expect(capability(profile, "PROTECTION").value).toBe(true);
    expect(capability(profile, "PEEL").status).toBe("UNAVAILABLE");
    expect(capability(profile, "FRONTLINE").status).toBe("UNAVAILABLE");
  });

  it("usa somente alcance estruturado como medida numérica objetiva", () => {
    const range = capability(
      extractChampionCapabilityProfile(input()),
      "RANGE_PROFILE"
    );

    expect(range.value).toBe(550);
    expect(range.evidence[0]).toMatchObject({
      sourceType: "CHAMPION_METADATA",
      sourceId: "stats.attackrange",
      sourceText: "550"
    });
  });

  it("calcula cobertura informativa sem completar dimensões incertas", () => {
    const profile = extractChampionCapabilityProfile(input());
    const available = profile.capabilities.filter(
      (entry) => entry.status === "AVAILABLE"
    ).length;

    expect(profile.availableCapabilities).toBe(available);
    expect(profile.totalCapabilities).toBe(CHAMPION_CAPABILITY_KEYS.length);
    expect(profile.coverage).toBe(
      Math.round((available / CHAMPION_CAPABILITY_KEYS.length) * 10_000) /
        10_000
    );
    expect(profile.status).toBe("PARTIAL");
  });

  it("não aplica regras textuais pt_BR a outro locale", () => {
    expect(() =>
      extractChampionCapabilityProfile({ ...input(), locale: "en_US" })
    ).toThrow(/locale não suportado/i);
  });
});

describe("manifesto de capacidades", () => {
  it("mantém resultado funcional e timestamp com o mesmo catálogo", () => {
    const profile = extractChampionCapabilityProfile(input());
    const first = buildChampionCapabilityManifest({
      profiles: [profile],
      dataDragonVersion: "16.14.1",
      now: "2026-07-28T03:00:00.000Z"
    });
    const second = buildChampionCapabilityManifest({
      profiles: [profile],
      dataDragonVersion: "16.14.1",
      now: "2026-07-29T03:00:00.000Z",
      previous: first.manifest
    });

    expect(second.report.unchanged).toBe(true);
    expect(second.manifest).toEqual(first.manifest);
  });

  it("rejeita evidência apontando para habilidade inexistente", () => {
    const profile = extractChampionCapabilityProfile(input());
    capability(profile, "HARD_CC").evidence[0]!.sourceId = "SpellInexistente";

    expect(validateChampionCapabilityProfile(profile)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "HARD_CC",
          problem: expect.stringMatching(/fonte inexistente/)
        })
      ])
    );
  });
});
