import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDataDragonChampionDetails } from "./client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchDataDragonChampionDetails", () => {
  it("lê passiva, habilidades e metadados do recurso oficial completo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            Example: {
              key: "999",
              id: "Example",
              name: "Exemplo",
              title: "o Exemplo",
              tags: ["Mage"],
              passive: {
                name: "Passiva",
                description: "Texto oficial."
              },
              spells: [
                {
                  id: "ExampleQ",
                  name: "Habilidade",
                  description: "Atordoa o alvo."
                }
              ],
              stats: { attackrange: 550 }
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDataDragonChampionDetails(
      "16.14.1",
      "Example",
      "pt_BR"
    );

    expect(result.spells[0]).toMatchObject({
      id: "ExampleQ",
      name: "Habilidade"
    });
    expect(result.passive?.name).toBe("Passiva");
    expect(result.stats?.attackrange).toBe(550);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ddragon.leagueoflegends.com/cdn/16.14.1/data/pt_BR/champion/Example.json",
      expect.objectContaining({ signal: expect.any(globalThis.AbortSignal) })
    );
  });

  it("rejeita habilidade sem identificador rastreável", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              Example: {
                key: "999",
                id: "Example",
                name: "Exemplo",
                title: "o Exemplo",
                tags: [],
                spells: [{ name: "Sem id" }]
              }
            }
          }),
          { status: 200 }
        )
      )
    );

    await expect(
      fetchDataDragonChampionDetails("16.14.1", "Example")
    ).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });

  it("rejeita detalhe de outro campeão no recurso solicitado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              Other: {
                key: "1",
                id: "Other",
                name: "Outro",
                title: "outro",
                tags: [],
                spells: []
              }
            }
          }),
          { status: 200 }
        )
      )
    );

    await expect(
      fetchDataDragonChampionDetails("16.14.1", "Example")
    ).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
});
