import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

const { findProfileMock } = vi.hoisted(() => ({
  findProfileMock: vi.fn()
}));

vi.mock("./champion-capability-repository.js", () => ({
  findChampionCapabilityProfile: findProfileMock
}));

describe("GET /catalog/champions/:championId/capabilities", () => {
  beforeEach(() => {
    findProfileMock.mockReset();
  });

  it("expõe evidência, indisponibilidade, versões e cobertura", async () => {
    findProfileMock.mockResolvedValue({
      championId: 61,
      championKey: "Orianna",
      championName: "Orianna",
      dataDragonVersion: "16.14.1",
      locale: "pt_BR",
      algorithmVersion: "champion-capability-extraction/1.0.0",
      status: "PARTIAL",
      coverage: 0.087,
      availableCapabilities: 2,
      totalCapabilities: 23,
      sourceReferences: [],
      capabilities: [
        {
          key: "HARD_CC",
          status: "AVAILABLE",
          value: true,
          evidence: [
            {
              sourceType: "SPELL",
              sourceId: "OrianaDetonateCommand",
              sourceName: "Comando: Onda de Choque",
              sourceText: "Texto oficial.",
              extractionRule: "HARD_CC_STUN_EXPLICIT_PT_BR/v1"
            }
          ],
          provenance: { sourceType: "CALCULATED" }
        },
        {
          key: "CC_RELIABILITY",
          status: "UNAVAILABLE",
          value: null,
          evidence: [],
          provenance: { sourceType: "CALCULATED" },
          unavailableReason: "Sem evidência suficiente."
        }
      ]
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/catalog/champions/61/capabilities"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      dataDragonVersion: "16.14.1",
      algorithmVersion: "champion-capability-extraction/1.0.0",
      coverage: 0.087,
      capabilities: [
        {
          key: "HARD_CC",
          evidence: [
            {
              sourceId: "OrianaDetonateCommand",
              extractionRule: "HARD_CC_STUN_EXPLICIT_PT_BR/v1"
            }
          ]
        },
        { key: "CC_RELIABILITY", status: "UNAVAILABLE", value: null }
      ]
    });
    await app.close();
  });

  it("catálogo antigo sem perfil responde indisponível sem afetar outras rotas", async () => {
    findProfileMock.mockResolvedValue(undefined);
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/catalog/champions/61/capabilities"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      status: "UNAVAILABLE",
      unavailableReason:
        "Perfil de capacidades indisponível no catálogo local."
    });
    await app.close();
  });
});
