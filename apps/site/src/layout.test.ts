import { describe, expect, it } from "vitest";
import { RIOT_DISCLAIMER, renderFooter } from "./layout";

/**
 * Etapa 31L.1, seção 8: o rodapé global (presente nas 9 páginas via
 * `layout.ts`) precisa trazer a referência discreta de não-afiliação em
 * toda página, sem depender de rede nem de JS de terceiros - o texto
 * completo mora em termos.html (ver `disclaimers-content.test.ts`).
 */
describe("rodapé global - referência à Riot Games", () => {
  it("nunca afirma afiliação, endosso ou patrocínio da Riot Games", () => {
    expect(RIOT_DISCLAIMER).toContain("não é afiliado, endossado nem patrocinado pela Riot Games");
  });

  it("aponta pros Termos de Uso, onde o aviso legal completo mora", () => {
    expect(RIOT_DISCLAIMER).toMatch(/Termos de Uso/);
  });

  it("renderFooter() inclui o disclaimer e o link pros Termos de uso em toda página", () => {
    const html = renderFooter();
    expect(html).toContain(RIOT_DISCLAIMER);
    expect(html).toContain('href="/termos.html"');
  });

  it("o rodapé não contém link pra localhost nem pro GitHub como substituto de site", () => {
    const html = renderFooter().toLowerCase();
    expect(html).not.toContain("localhost");
    expect(html).not.toContain("github.com");
  });
});
