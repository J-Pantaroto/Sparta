import { describe, expect, it } from "vitest";
import {
  classifyOfficialPatchChange,
  IncompatiblePatchNotesError,
  parseOfficialPatchNotes,
  parseStructuredPatchDelta,
  RIOT_PATCH_NOTES_PARSER_VERSION
} from "./parser.js";
import { assertOfficialPatchNotesUrl, UnsupportedPatchNotesSourceError } from "./source.js";

const sourceUrl =
  "https://www.leagueoflegends.com/pt-br/news/game-updates/league-of-legends-patch-26-14-notes/";

function page(block: string, attributes = "") {
  return `
    <html><head>
      <script type="application/ld+json">
        {"@type":"NewsArticle","datePublished":"2026-07-14T18:00:00.000Z"}
      </script>
    </head><body>
      <h1 ${attributes}>Notas da Atualização 26.14 do League of Legends</h1>
      <header><h2 id="patch-champions">Campeões</h2></header>
      <div class="content-border">${block}</div>
    </body></html>`;
}

function championBlock(summary: string, details: string, attributes = "") {
  return `
    <div class="patch-change-block decorative generated-827" ${attributes}>
      <h3 class="change-title" id="generated-champion-id">Orianna</h3>
      <blockquote class="context"><p>${summary}</p></blockquote>
      <h4>Q – Comando: Atacar</h4>
      <ul>${details}</ul>
    </div>`;
}

describe("parser oficial de patch notes", () => {
  it("usa intenção editorial explícita e nunca a direção isolada do número", () => {
    expect(
      classifyOfficialPatchChange({
        summary: "Vamos fortalecer esta Campeã.",
        details: ["Dano: 10 ⇒ 8"]
      })
    ).toBe("BUFF");
    expect(
      classifyOfficialPatchChange({
        summary: "Vamos enfraquecer esta Campeã.",
        details: ["Recarga: 10 ⇒ 8"]
      })
    ).toBe("NERF");
    expect(classifyOfficialPatchChange({ summary: "", details: ["Dano: 10 ⇒ 8"] })).toBe(
      "UNCLASSIFIED"
    );
  });

  it("mantém compensações como ajuste e bugfix como bugfix", () => {
    expect(
      classifyOfficialPatchChange({
        summary: "Vamos reduzir a defesa e aumentar o dano como compensação.",
        details: ["Defesa: 20 ⇒ 10", "Dano: 10 ⇒ 20"]
      })
    ).toBe("ADJUSTMENT");
    expect(
      classifyOfficialPatchChange({
        heading: "Correções de bugs",
        summary: "",
        details: ["Agora aplica o efeito corretamente."]
      })
    ).toBe("BUGFIX");
  });

  it("estrutura somente escalares explícitos e preserva o texto não seguro", () => {
    expect(parseStructuredPatchDelta("Tempo de Recarga: 10s ⇒ 8s")).toEqual({
      label: "Tempo de Recarga",
      previousValue: "10s",
      newValue: "8s",
      numericPreviousValue: 10,
      numericNewValue: 8,
      numericDelta: -2,
      unit: "s",
      status: "AVAILABLE"
    });
    expect(parseStructuredPatchDelta("Dano: 10/20/30 ⇒ 12/24/36")).toMatchObject({
      previousValue: "10/20/30",
      newValue: "12/24/36"
    });
    expect(parseStructuredPatchDelta("Agora acerta o alvo primário.")).toEqual({
      label: "Agora acerta o alvo primário.",
      status: "PARTIAL"
    });
  });

  it("gera hash determinístico sem whitespace, atributos visuais ou ids do site", () => {
    const first = parseOfficialPatchNotes({
      html: page(
        championBlock("Vamos fortalecer Orianna.", "<li>Dano: 10 ⇒ <strong>12</strong></li>"),
        'class="visual-a" data-generated-id="123"'
      ),
      patch: "26.14",
      locale: "pt_BR",
      sourceUrl,
      collectedAt: "2026-07-28T18:00:00.000Z"
    });
    const second = parseOfficialPatchNotes({
      html: page(
        championBlock(
          "  Vamos   fortalecer Orianna. ",
          "<li class='paint-only'> Dano: 10 ⇒ <strong>12</strong> </li>",
          'style="color:red" data-id="other"'
        ),
        'class="visual-b" data-generated-id="999"'
      ),
      patch: "26.14",
      locale: "pt_BR",
      sourceUrl,
      collectedAt: "2026-07-29T18:00:00.000Z"
    });

    expect(first.sourceHash).toBe(second.sourceHash);
    expect(first.changes[0]?.id).toBe(second.changes[0]?.id);
    expect(first.parserVersion).toBe(RIOT_PATCH_NOTES_PARSER_VERSION);
    expect(first.collectedAt).not.toBe(second.collectedAt);
  });

  it("preserva nome e evidência quando a entidade ainda não foi resolvida", () => {
    const release = parseOfficialPatchNotes({
      html: page(
        championBlock(
          "Vamos fortalecer Orianna.",
          "<li>Dano: 10 ⇒ 12</li><li>Agora acerta o alvo primário.</li>"
        )
      ),
      patch: "26.14",
      locale: "pt_BR",
      sourceUrl,
      collectedAt: "2026-07-28T18:00:00.000Z"
    });
    expect(release.changes[0]).toMatchObject({
      entityType: "CHAMPION",
      entityName: "Orianna",
      entityResolution: { status: "UNRESOLVED" },
      officialSummary: "Vamos fortalecer Orianna.",
      officialDetails: ["Dano: 10 ⇒ 12", "Agora acerta o alvo primário."]
    });
  });

  it("aceita release válido sem mudanças e rejeita estrutura incompatível", () => {
    const validEmpty = parseOfficialPatchNotes({
      html: page(""),
      patch: "26.14",
      locale: "pt_BR",
      sourceUrl,
      collectedAt: "2026-07-28T18:00:00.000Z"
    });
    expect(validEmpty.status).toBe("AVAILABLE");
    expect(validEmpty.changes).toEqual([]);

    expect(() =>
      parseOfficialPatchNotes({
        html: "<h1>Notas da Atualização 26.14</h1><h2>Skins</h2>",
        patch: "26.14",
        locale: "pt_BR",
        sourceUrl,
        collectedAt: "2026-07-28T18:00:00.000Z"
      })
    ).toThrow(IncompatiblePatchNotesError);
  });
});

describe("allowlist oficial", () => {
  it("aceita apenas a área oficial de game updates", () => {
    expect(assertOfficialPatchNotesUrl(sourceUrl).hostname).toBe("www.leagueoflegends.com");
    expect(() =>
      assertOfficialPatchNotesUrl("https://example.com/pt-br/news/game-updates/patch-notes/")
    ).toThrow(UnsupportedPatchNotesSourceError);
    expect(() =>
      assertOfficialPatchNotesUrl("https://www.leagueoflegends.com/pt-br/champions/orianna/")
    ).toThrow(UnsupportedPatchNotesSourceError);
  });
});
