import { describe, expect, it } from "vitest";
import { opaqueIdentifier, redactRequestUrl, requestLogSerializer } from "./log-redaction.js";

/** PUUID real em formato, mas de conta inexistente. */
const PUUID = "eLIuQxvvwJOArYCRv-4vnXPr2uR2lA2bhrIMbTpmvy-wclYb0WMxaapZPNLOQJRKhE5ydRoI1XSXBA";

describe("redação de identificador no caminho", () => {
  it("substitui o PUUID por um rótulo opaco", () => {
    const url = redactRequestUrl(`/players/${PUUID}/recent-matches`);

    expect(url).not.toContain(PUUID);
    expect(url).toMatch(/^\/players\/pid_[0-9a-f]{12}\/recent-matches$/);
  });

  it("preserva a query string", () => {
    const url = redactRequestUrl(`/players/${PUUID}/recent-matches?limit=10`);

    expect(url).toContain("?limit=10");
    expect(url).not.toContain(PUUID);
  });

  it("cobre caminhos aninhados sob o identificador", () => {
    const url = redactRequestUrl(`/players/${PUUID}/champions/103/roles/MID/loadout-evidence`);

    expect(url).not.toContain(PUUID);
    expect(url).toContain("/champions/103/roles/MID/loadout-evidence");
  });

  it("não altera caminhos sem identificador de jogador", () => {
    for (const url of [
      "/health",
      "/calibration/releases",
      "/recommendation-engine/active-release",
      "/drafts/recommendations"
    ]) {
      expect(redactRequestUrl(url)).toBe(url);
    }
  });

  it("o rótulo é estável para o mesmo identificador e distinto entre identificadores", () => {
    expect(opaqueIdentifier(PUUID)).toBe(opaqueIdentifier(PUUID));
    expect(opaqueIdentifier(PUUID)).not.toBe(opaqueIdentifier(PUUID + "x"));
  });

  it("o rótulo não contém nenhum trecho do identificador original", () => {
    const rotulo = opaqueIdentifier(PUUID);
    // Qualquer subsequência de 8 caracteres do original não pode aparecer.
    for (let i = 0; i + 8 <= PUUID.length; i += 1) {
      expect(rotulo).not.toContain(PUUID.slice(i, i + 8));
    }
  });
});

describe("serializador de requisição", () => {
  it("não emite headers — é por onde Authorization e cookie viajariam", () => {
    const serializado = requestLogSerializer({
      method: "GET",
      url: "/health",
      ip: "127.0.0.1",
      id: "req-1"
    });

    expect(serializado).not.toHaveProperty("headers");
    expect(JSON.stringify(serializado)).not.toMatch(/authorization|cookie|bearer/i);
  });

  it("emite request id, método, url redigida e origem", () => {
    const serializado = requestLogSerializer({
      method: "GET",
      url: `/players/${PUUID}/growth-journey`,
      ip: "127.0.0.1",
      id: "req-7"
    });

    expect(serializado.id).toBe("req-7");
    expect(serializado.method).toBe("GET");
    expect(serializado.remoteAddress).toBe("127.0.0.1");
    expect(String(serializado.url)).not.toContain(PUUID);
  });
});
