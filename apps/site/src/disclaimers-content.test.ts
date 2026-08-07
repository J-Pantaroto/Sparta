import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SITE_ROOT = resolve(__dirname, "../");

const ALL_PAGES = [
  "index.html",
  "como-funciona.html",
  "funcionalidades.html",
  "privacidade.html",
  "termos.html",
  "excluir-conta.html",
  "seguranca.html",
  "status.html",
  "404.html"
];

const RIOT_FAN_CONTENT_DISCLAIMER_EN =
  'Sparta GG was created under Riot Games\' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.';

const RIOT_DEVELOPER_API_DISCLAIMER_EN =
  "Sparta GG is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.";

function readPage(name: string): string {
  return readFileSync(resolve(SITE_ROOT, name), "utf-8");
}

/**
 * O HTML fonte quebra o texto do callout em várias linhas indentadas (só
 * formatação do arquivo) - um navegador renderiza isso como texto corrido.
 * Normaliza espaço em branco antes de comparar, senão a comparação verbatim
 * falharia por causa só de quebra de linha, não de conteúdo divergente.
 */
function normalizeWhitespace(html: string): string {
  return html.replace(/\s+/g, " ");
}

/** Remove comentários HTML - usado pra provar que o aviso não está escondido dentro de um. */
function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

describe("Etapa 31L.1 - os dois avisos legais da Riot Games no site", () => {
  it.each(ALL_PAGES)("%s não aponta pra localhost nem usa GitHub como site institucional", (page) => {
    const html = readPage(page).toLowerCase();
    expect(html).not.toContain("localhost");
    expect(html).not.toContain("github.com");
  });

  it("termos.html contém, verbatim, os dois avisos legais oficiais da Riot Games", () => {
    const html = normalizeWhitespace(readPage("termos.html"));
    expect(html).toContain(RIOT_FAN_CONTENT_DISCLAIMER_EN);
    expect(html).toContain(RIOT_DEVELOPER_API_DISCLAIMER_EN);
  });

  it("os dois avisos coexistem em termos.html - nenhum substitui o outro", () => {
    const html = readPage("termos.html");
    expect(html).toContain('id="riot-legal-fan-content"');
    expect(html).toContain('id="riot-legal-developer-api"');
    expect(html).toMatch(/11\.1 Pol[ií]tica de conte[uú]do de f[ãa]/);
    expect(html).toMatch(/11\.2 Pol[ií]tica de desenvolvedor/);
  });

  it("nenhum dos dois avisos está escondido dentro de um comentário HTML", () => {
    const visible = normalizeWhitespace(stripHtmlComments(readPage("termos.html")));
    expect(visible).toContain(RIOT_FAN_CONTENT_DISCLAIMER_EN);
    expect(visible).toContain(RIOT_DEVELOPER_API_DISCLAIMER_EN);
  });

  it("termos.html não é indexável como página secreta - segue com robots padrão do site", () => {
    const html = readPage("termos.html");
    expect(html).not.toMatch(/name="robots"\s+content="noindex/i);
  });
});
