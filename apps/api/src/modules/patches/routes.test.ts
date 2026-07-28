import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatchRelease } from "@sparta/core";

const mocks = vi.hoisted(() => ({
  findRelease: vi.fn(),
  listReleases: vi.fn(),
  findFailure: vi.fn(),
  findCapabilityProfile: vi.fn(),
  findAllCapabilityProfiles: vi.fn()
}));

vi.mock("./patch-repository.js", () => ({
  findPatchRelease: mocks.findRelease,
  listPatchReleases: mocks.listReleases,
  findLatestPatchFailure: mocks.findFailure
}));
vi.mock("../catalog/champion-capability-repository.js", () => ({
  findChampionCapabilityProfile: mocks.findCapabilityProfile,
  findAllChampionCapabilityProfiles: mocks.findAllCapabilityProfiles
}));

import { buildApp } from "../../app.js";

const release: PatchRelease = {
  patch: "26.14",
  title: "Notas da Atualização 26.14",
  locale: "pt_BR",
  publishedAt: "2026-07-14T18:00:00.000Z",
  collectedAt: "2026-07-28T18:00:00.000Z",
  sourceUrl:
    "https://www.leagueoflegends.com/pt-br/news/game-updates/league-of-legends-patch-26-14-notes/",
  sourceHash: "hash",
  parserVersion: "parser/1",
  revision: 2,
  status: "PARTIAL",
  changes: [
    {
      id: "orianna-q",
      entityType: "CHAMPION",
      entityId: 61,
      entityName: "Orianna",
      entityResolution: { status: "RESOLVED" },
      changeType: "BUFF",
      affectedComponent: "Q",
      officialSummary: "Vamos fortalecer Orianna.",
      officialDetails: ["Dano: 10 ⇒ 12"],
      structuredChanges: [
        {
          label: "Dano",
          previousValue: "10",
          newValue: "12",
          numericPreviousValue: 10,
          numericNewValue: 12,
          numericDelta: 2,
          status: "AVAILABLE"
        }
      ],
      status: "AVAILABLE",
      provenance: { sourceType: "OFFICIAL" }
    }
  ],
  provenance: { sourceType: "OFFICIAL", status: "PARTIAL" }
};

describe("consultas de Patch Intelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listReleases.mockResolvedValue([]);
    mocks.findRelease.mockResolvedValue(null);
    mocks.findFailure.mockResolvedValue(null);
    mocks.findCapabilityProfile.mockResolvedValue(undefined);
    mocks.findAllCapabilityProfiles.mockResolvedValue([]);
  });

  it("distingue catálogo sem release de uma lista válida vazia de mudanças", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/patches?locale=pt_BR" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "UNAVAILABLE",
      releases: [],
      unavailableReason: expect.any(String)
    });
    await app.close();
  });

  it("distingue patch não importado, página indisponível e parser incompatível", async () => {
    const app = await buildApp();
    let response = await app.inject({ method: "GET", url: "/patches/26.14" });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("PATCH_NOT_IMPORTED");

    mocks.findFailure.mockResolvedValue({
      status: "PAGE_UNAVAILABLE",
      errorCode: "NETWORK_UNAVAILABLE",
      attemptedAt: new Date("2026-07-28T18:00:00.000Z"),
      sourceUrl: release.sourceUrl
    });
    response = await app.inject({ method: "GET", url: "/patches/26.14" });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("PATCH_PAGE_UNAVAILABLE");

    mocks.findFailure.mockResolvedValue({
      status: "PARSER_INCOMPATIBLE",
      errorCode: "PATCH_PARSER_INCOMPATIBLE",
      attemptedAt: new Date("2026-07-28T19:00:00.000Z"),
      sourceUrl: release.sourceUrl
    });
    response = await app.inject({ method: "GET", url: "/patches/26.14" });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("PATCH_PARSER_INCOMPATIBLE");
    await app.close();
  });

  it("preserva status parcial ou stale no release válido", async () => {
    mocks.findRelease.mockResolvedValue(release);
    const app = await buildApp();
    const partial = await app.inject({ method: "GET", url: "/patches/26.14" });
    expect(partial.statusCode).toBe(200);
    expect(partial.json().status).toBe("PARTIAL");

    mocks.findRelease.mockResolvedValue({
      ...release,
      status: "STALE",
      staleReason: "Falha de atualização."
    });
    const stale = await app.inject({ method: "GET", url: "/patches/26.14" });
    expect(stale.json()).toMatchObject({
      status: "STALE",
      staleReason: "Falha de atualização."
    });
    await app.close();
  });

  it("lista vazia por campeão significa somente nenhuma mudança num release válido", async () => {
    mocks.findRelease.mockResolvedValue(release);
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/patches/26.14/champions/103"
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      championId: 103,
      entityChanged: false,
      changes: [],
      release: { status: "PARTIAL" },
      theoreticalImpact: {
        entityChanged: false,
        signals: [],
        patchChangeIds: []
      }
    });
    await app.close();
  });

  it("retorna somente a evidência oficial do campeão solicitado", async () => {
    mocks.findRelease.mockResolvedValue(release);
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/patches/26.14/champions/61"
    });
    expect(response.json()).toMatchObject({
      entityChanged: true,
      changes: [{ entityName: "Orianna", changeType: "BUFF" }],
      theoreticalImpact: {
        status: "UNAVAILABLE",
        signals: [],
        unavailableSignals: [{ direction: "UNKNOWN" }]
      }
    });
    await app.close();
  });

  it("expõe impactos teóricos versionados sem criar score de força", async () => {
    mocks.findRelease.mockResolvedValue({
      ...release,
      status: "AVAILABLE",
      changes: [
        {
          ...release.changes[0],
          changeType: "NERF",
          officialDetails: ["Tempo de Recarga: 10 ⇒ 8"],
          structuredChanges: [
            {
              label: "Tempo de Recarga",
              previousValue: "10",
              newValue: "8",
              numericPreviousValue: 10,
              numericNewValue: 8,
              numericDelta: -2,
              status: "AVAILABLE"
            }
          ]
        }
      ]
    });
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/patches/26.14/impacts"
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      patch: "26.14",
      status: "AVAILABLE",
      algorithmVersion: "theoretical-patch-impact/1.0.0",
      impacts: [
        {
          championId: 61,
          coverage: 1,
          signals: [
            {
              dimension: "COOLDOWN",
              direction: "POSITIVE",
              magnitude: "MODERATE"
            }
          ]
        }
      ]
    });
    expect(response.body).not.toMatch(/patchPowerScore|META_STRENGTH|totalScore/);
    await app.close();
  });
});
