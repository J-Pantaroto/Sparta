import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SITE_ROOT = resolve(__dirname, "../");
const REPO_ROOT = resolve(SITE_ROOT, "../../");

const ler = (rel: string) => readFileSync(resolve(SITE_ROOT, rel), "utf-8");

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

/** Cada rota publica limpa e o arquivo estatico que a serve. */
const ROTAS = {
  "/como-funciona": "como-funciona.html",
  "/funcionalidades": "funcionalidades.html",
  "/privacidade": "privacidade.html",
  "/termos": "termos.html",
  "/seguranca": "seguranca.html",
  "/excluir-conta": "excluir-conta.html",
  "/status": "status.html",
  "/suporte": "suporte.html"
} as const;

const CADDYFILE = readFileSync(resolve(REPO_ROOT, "infra/Caddyfile"), "utf-8");
const LAYOUT = ler("src/scripts/layout.ts");
const SITEMAP = ler("public/sitemap.xml");
const VITE = ler("vite.config.ts");

describe("URLs públicas limpas", () => {
  it.each(Object.entries(ROTAS))(
    "%s é servida por um arquivo estático existente",
    (_rota, arquivo) => {
      expect(() => ler(arquivo)).not.toThrow();
      expect(VITE).toContain(arquivo);
    }
  );

  it("nenhuma página gera link interno com .html", () => {
    const ofensores: string[] = [];
    for (const pagina of PAGINAS) {
      for (const m of ler(pagina).match(/href="\/[^"]*\.html"/g) ?? []) {
        ofensores.push(`${pagina}: ${m}`);
      }
    }
    expect(ofensores).toEqual([]);
  });

  it("o layout compartilhado (nav e footer) não usa .html em link algum", () => {
    // links ja renderizados no template
    expect(LAYOUT).not.toMatch(/href="\/[a-z0-9-]*\.html"/);
    // e as definicoes de rota dos arrays de navegacao/rodape
    expect(LAYOUT).not.toMatch(/href:\s*"\/[a-z0-9-]*\.html"/);
    // `currentPath()` ainda testa `endsWith("/index.html")` de proposito: e
    // guarda defensiva pra marcar a home como ativa, nao um link.
  });

  it.each(Object.entries(ROTAS))("%s tem canonical na URL limpa", (rota, arquivo) => {
    const html = ler(arquivo);
    expect(html).toContain(`rel="canonical" href="https://spartagg.com.br${rota}"`);
    expect(html).toContain(`property="og:url" content="https://spartagg.com.br${rota}"`);
  });

  it("nenhum canonical ou og:url aponta para .html", () => {
    for (const pagina of PAGINAS) {
      expect(ler(pagina)).not.toMatch(/spartagg\.com\.br\/[a-z0-9-]+\.html/);
    }
  });

  it("o sitemap lista somente URLs limpas e inclui /suporte", () => {
    expect(SITEMAP).not.toMatch(/\.html<\/loc>/);
    expect(SITEMAP).toContain("<loc>https://spartagg.com.br/suporte</loc>");
    for (const rota of Object.keys(ROTAS)) {
      expect(SITEMAP).toContain(`<loc>https://spartagg.com.br${rota}</loc>`);
    }
  });
});

describe("Caddy: redirects legados e ausência de laço", () => {
  it("redireciona /index.html para a raiz", () => {
    expect(CADDYFILE).toMatch(/redir\s+\/index\.html\s+\/\s+301/);
  });

  it("redireciona qualquer /pagina.html para /pagina com 301", () => {
    expect(CADDYFILE).toMatch(/redir\s+@legado\s+\/\{re\.legado\.1\}\s+301/);
  });

  /*
   * O laco so existiria se a rota limpa respondesse com outro redirect de
   * volta pro .html. Ela e resolvida por `try_files`, que faz reescrita
   * INTERNA (200) - e `try_files` roda depois de `redir` na ordem de
   * diretivas do Caddy, entao a reescrita nao reentra no redirect.
   */
  it("a rota limpa é resolvida por reescrita interna, não por redirect", () => {
    expect(CADDYFILE).toMatch(/try_files\s+\{path\}\s+\{path\}\.html/);
    expect(CADDYFILE).not.toMatch(/redir\s+\{path\}\.html/);
  });

  it("o regex de redirect não permite open redirect protocol-relative", () => {
    // `^/([^/].*)\.html$` impede que `//evil.com/x.html` vire `//evil.com/x`.
    expect(CADDYFILE).toContain("path_regexp legado ^/([^/].*)\\.html$");
  });

  it("404.html fica fora do redirect (é página de erro, não rota)", () => {
    expect(CADDYFILE).toMatch(/not path \/404\.html/);
  });

  it("o hardening existente foi preservado", () => {
    expect(CADDYFILE).toContain("Strict-Transport-Security");
    expect(CADDYFILE).toContain("X-Content-Type-Options");
    expect(CADDYFILE).toContain("X-Frame-Options");
    expect(CADDYFILE).toContain("handle_errors");
    expect(CADDYFILE).toContain("respond /healthz 200");
    expect(CADDYFILE).toMatch(/redir https:\/\/spartagg\.com\.br\{uri\} permanent/);

    // A CSP precisa ser checada na DIRETIVA, nao no arquivo inteiro: o
    // comentario acima dela cita "unsafe-inline" justamente para explicar
    // por que ela nao usa isso.
    const csp = CADDYFILE.split("\n").find(
      (linha) => linha.includes("Content-Security-Policy") && linha.includes("default-src")
    );
    expect(csp).toBeDefined();
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("default-src 'self'");
  });
});

describe("Central de Suporte", () => {
  const suporte = ler("suporte.html");

  it("existe e é indexável", () => {
    expect(suporte).toMatch(/<h1[^>]*>\s*Central de Suporte\s*<\/h1>/);
    expect(suporte).toMatch(/name="robots" content="index, follow"/);
  });

  it("mostra o endereço de suporte", () => {
    expect(suporte).toContain("suporte@spartagg.com.br");
  });

  it("tem CTA mailto funcional", () => {
    expect(suporte).toMatch(/href="mailto:suporte@spartagg\.com\.br\?subject=[^"]+"/);
    expect(suporte).toMatch(/href="mailto:suporte@spartagg\.com\.br"/);
  });

  it("cobre as categorias de atendimento", () => {
    for (const cat of [
      "Problemas técnicos",
      "Conta e acesso",
      "Privacidade e dados",
      "Exclusão de conta",
      "Segurança",
      "Outros assuntos"
    ]) {
      expect(suporte).toContain(cat);
    }
  });

  it("aponta para as páginas dedicadas quando elas existem", () => {
    expect(suporte).toContain('href="/excluir-conta"');
    expect(suporte).toContain('href="/seguranca"');
    expect(suporte).toContain('href="/privacidade"');
  });

  /*
   * Nada de formulario nesta etapa: nao existe backend de tickets, e um
   * formulario que nao envia nada e pior que nenhum formulario.
   */
  it("não simula formulário nem sistema de tickets", () => {
    expect(suporte).not.toMatch(/<form[\s>]/i);
    expect(suporte).not.toMatch(/<input[\s>]/i);
    expect(suporte).not.toMatch(/<textarea[\s>]/i);
    expect(suporte).not.toMatch(/<button[\s>]/i);
  });

  it("não inventa SLA de resposta", () => {
    const texto = suporte.replace(/<[^>]+>/g, " ");
    expect(texto).not.toMatch(/em at[ée]\s+\d+\s*(horas?|h|dias?|minutos?)/i);
    expect(texto).not.toMatch(/respondemos em/i);
    // e diz explicitamente que ainda nao ha prazo comprometido
    expect(texto).toMatch(/não existe um prazo de resposta comprometido publicamente/);
  });

  it("está no rodapé de todas as páginas, via layout compartilhado", () => {
    expect(LAYOUT).toContain('href="/suporte"');
    expect(LAYOUT).toContain("Central de suporte");
  });
});

describe("Área autenticada permanece deliberadamente ausente", () => {
  it.each(["/login", "/criar-conta", "/register", "/conta", "/conta/tickets"])(
    "nenhuma página linka para %s",
    (rota) => {
      for (const pagina of PAGINAS) {
        expect(ler(pagina)).not.toContain(`href="${rota}"`);
      }
      expect(LAYOUT).not.toContain(`href="${rota}"`);
    }
  );

  it("não existe arquivo de página para login/conta", () => {
    for (const arquivo of ["login.html", "conta.html", "criar-conta.html"]) {
      expect(() => ler(arquivo)).toThrow();
    }
  });
});
