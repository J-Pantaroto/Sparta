import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SITE_ROOT = resolve(__dirname, "../");

const PAGINAS = [
  "index.html",
  "como-funciona.html",
  "funcionalidades.html",
  "privacidade.html",
  "termos.html",
  "seguranca.html",
  "excluir-conta.html",
  "status.html",
  "suporte.html",
  "404.html"
];

/**
 * Rotas publicas canonicas - todas SEM `.html`. O arquivo no disco continua
 * sendo `pagina.html`; quem faz a ponte e o `try_files` do Caddy. Qualquer
 * href interno fora deste conjunto e link morto.
 */
const ROTAS_VALIDAS = new Set([
  "/",
  "/como-funciona",
  "/funcionalidades",
  "/privacidade",
  "/termos",
  "/seguranca",
  "/excluir-conta",
  "/status",
  "/suporte"
]);

function ler(nome: string): string {
  return readFileSync(resolve(SITE_ROOT, nome), "utf-8");
}

const LAYOUT = readFileSync(resolve(SITE_ROOT, "src/scripts/layout.ts"), "utf-8");
const CSS = ["src/styles/site.css", "src/styles/base.css"]
  .map((f) => readFileSync(resolve(SITE_ROOT, f), "utf-8"))
  .join("\n");

describe("Spartan Signal - invariantes do design system", () => {
  /*
   * O mais importante da suite: a CSP de producao e `style-src 'self'` SEM
   * `unsafe-inline`, entao o navegador descarta atributo `style=`. O site
   * publicado tinha 21 deles e renderizava sem esses estilos. Se algum
   * voltar, ele quebra em producao e passa despercebido em dev.
   */
  it.each(PAGINAS)("%s não usa estilo inline (a CSP de produção descarta)", (pagina) => {
    const inline = ler(pagina).match(/\sstyle="[^"]*"/g) ?? [];
    expect(inline).toEqual([]);
  });

  it.each(PAGINAS)("%s não tem bloco <style> (mesma restrição da CSP)", (pagina) => {
    expect(ler(pagina)).not.toMatch(/<style[\s>]/i);
  });

  it("toda classe sp- usada no HTML ou no layout existe no CSS", () => {
    const usadas = new Set<string>();
    for (const fonte of [...PAGINAS.map(ler), LAYOUT]) {
      for (const attr of fonte.match(/class="([^"]+)"/g) ?? []) {
        for (const c of attr.slice(7, -1).split(/\s+/)) {
          if (c.startsWith("sp-")) usadas.add(c);
        }
      }
    }
    const definidas = new Set((CSS.match(/\.(sp-[a-zA-Z0-9_-]+)/g) ?? []).map((m) => m.slice(1)));
    expect([...usadas].filter((c) => !definidas.has(c))).toEqual([]);
  });

  it("nenhum href interno aponta para página inexistente", () => {
    const mortos: string[] = [];
    for (const [nome, html] of PAGINAS.map((p) => [p, ler(p)] as const)) {
      for (const m of html.match(/href="([^"]+)"/g) ?? []) {
        const href = m.slice(6, -1);
        if (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#")) continue;
        if (href.startsWith("/img/") || href.startsWith("/src/")) continue;
        if (!ROTAS_VALIDAS.has(href)) mortos.push(`${nome} -> ${href}`);
      }
    }
    expect(mortos).toEqual([]);
  });

  /*
   * A release 0.9.0 foi retirada de circulacao (Etapa 31A) e nao ha binario
   * publico. Enquanto isso, nenhum CTA pode parecer um download funcionando.
   */
  it("nenhuma página oferece download enquanto não existe release pública", () => {
    const ofertas: string[] = [];
    for (const pagina of PAGINAS) {
      for (const a of ler(pagina).match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []) {
        if (/baixar|download/i.test(a.replace(/<[^>]+>/g, ""))) ofertas.push(`${pagina}: ${a.slice(0, 60)}`);
      }
      expect(ler(pagina)).not.toMatch(/href="[^"]*\.(exe|msi|dmg|zip)"/i);
    }
    expect(ofertas).toEqual([]);
  });

  it("toda captura declara width e height (evita layout shift)", () => {
    const semDimensao: string[] = [];
    for (const pagina of PAGINAS) {
      for (const img of ler(pagina).match(/<img\b[^>]*>/g) ?? []) {
        if (!/\bwidth="\d+"/.test(img) || !/\bheight="\d+"/.test(img)) {
          semDimensao.push(`${pagina}: ${img.slice(0, 70)}`);
        }
      }
    }
    expect(semDimensao).toEqual([]);
  });

  it("toda imagem tem alt (vazio só quando é decorativa)", () => {
    const semAlt: string[] = [];
    for (const pagina of PAGINAS) {
      for (const img of ler(pagina).match(/<img\b[^>]*>/g) ?? []) {
        if (!/\balt="/.test(img)) semAlt.push(`${pagina}: ${img.slice(0, 70)}`);
      }
    }
    expect(semAlt).toEqual([]);
  });

  it.each(PAGINAS)("%s tem exatamente um h1", (pagina) => {
    expect((ler(pagina).match(/<h1[\s>]/g) ?? []).length).toBe(1);
  });

  /*
   * O 404 fica de fora de proposito: nao e um recurso real, entao declarar
   * canonical apontaria um endereco que nao existe. Ele e `noindex` - e isso
   * e verificado no teste seguinte.
   */
  it.each(PAGINAS.filter((p) => p !== "404.html"))(
    "%s declara canonical e og:url",
    (pagina) => {
      const html = ler(pagina);
      expect(html).toMatch(/rel="canonical"/);
      expect(html).toMatch(/property="og:url"/);
    }
  );

  it("404.html é noindex e não declara canonical", () => {
    const html = ler("404.html");
    expect(html).toMatch(/name="robots"\s+content="[^"]*noindex/i);
    expect(html).not.toMatch(/rel="canonical"/);
  });
});
