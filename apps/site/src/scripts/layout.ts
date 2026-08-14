/**
 * Cabecalho, navegacao e rodape compartilhados entre as 9 paginas - sem
 * framework e sem include em tempo de build: cada HTML tem um
 * `<header id="sp-header">` e um `<footer id="sp-footer">` vazios, preenchidos
 * aqui no load. Mantem o site estatico e evita duplicar a casca em 9 arquivos.
 *
 * Nada aqui e essencial pro conteudo aparecer: o texto de cada pagina vive no
 * proprio HTML. Este modulo monta so a navegacao, o rodape e a animacao de
 * entrada - e a animacao so e ativada se o proprio JS conseguir rodar.
 */

interface NavLink {
  href: string;
  label: string;
}

/*
 * Toda rota publica e sem `.html`. O servidor resolve `/pagina` para
 * `pagina.html` por reescrita interna (ver `infra/Caddyfile`), e a versao
 * com extensao responde 301 pra ca - entao nenhum link daqui deve voltar a
 * usar `.html`, sob pena de gerar um salto de redirect desnecessario.
 */

/** Navegacao principal - somente paginas que existem de verdade. */
const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Início" },
  { href: "/como-funciona", label: "Como funciona" },
  { href: "/funcionalidades", label: "Funcionalidades" },
  { href: "/status", label: "Status" }
];

const FOOTER_PRODUTO: NavLink[] = [
  { href: "/como-funciona", label: "Como funciona" },
  { href: "/funcionalidades", label: "Funcionalidades" },
  { href: "/status", label: "Status" }
];

/** Confianca: o que o usuario consulta antes de decidir se entrega dados. */
const FOOTER_CONFIANCA: NavLink[] = [
  { href: "/privacidade", label: "Privacidade" },
  { href: "/seguranca", label: "Segurança" },
  { href: "/termos", label: "Termos de uso" }
];

const FOOTER_CONTA: NavLink[] = [{ href: "/excluir-conta", label: "Excluir conta" }];

const SUPORTE_EMAIL = "suporte@spartagg.com.br";

/*
 * Referência curta e discreta no rodapé de todas as páginas - o texto legal
 * COMPLETO dos dois avisos obrigatórios da Riot (política de conteúdo de fã
 * "Legal Jibber Jabber" + política de desenvolvedor específica de League of
 * Legends, que são exigências distintas e não substituem uma à outra, ver
 * `docs/riot-policy-compliance-matrix.md`) mora só em termos.html - aqui é
 * só a referência que aponta pra lá, igual a qualquer outro rodapé legal.
 */
export const RIOT_DISCLAIMER =
  "Sparta GG não é afiliado, endossado nem patrocinado pela Riot Games. " +
  "Consulte os Termos de Uso para o aviso legal completo.";

function currentPath(): string {
  const path = window.location.pathname;
  if (path === "/" || path.endsWith("/index.html")) return "/";
  return path;
}

function brand(): string {
  return `
    <a class="sp-brand" href="/">
      <img src="/img/favicon.png" alt="" width="26" height="26" />
      Sparta GG
    </a>
  `;
}

export function renderHeader(): string {
  const active = currentPath();
  const items = NAV_LINKS.map((link) => {
    const isActive = link.href === active;
    return `<a href="${link.href}"${isActive ? ' aria-current="page"' : ""}>${link.label}</a>`;
  }).join("");

  return `
    <div class="sp-container sp-container--wide sp-header__row">
      ${brand()}
      <button
        type="button"
        class="sp-nav__toggle"
        id="sp-nav-toggle"
        aria-expanded="false"
        aria-controls="sp-nav"
      >Menu</button>
      <nav class="sp-nav" id="sp-nav" aria-label="Navegação principal">${items}</nav>
      <a class="sp-btn sp-btn--ghost" href="/status">Ver status</a>
    </div>
  `;
}

function footerColumn(titulo: string, links: NavLink[]): string {
  const items = links
    .map((link) => `<li><a href="${link.href}">${link.label}</a></li>`)
    .join("");
  return `
    <div class="sp-footer__col">
      <h2>${titulo}</h2>
      <ul>${items}</ul>
    </div>
  `;
}

export function renderFooter(): string {
  const year = new Date().getFullYear();

  return `
    <div class="sp-container sp-container--wide">
      <div class="sp-footer__grid">
        <div class="sp-footer__brand">
          ${brand()}
          <p>
            Análise pessoal e apoio à tomada de decisão no League of Legends, a partir do seu
            próprio histórico de partidas. Projeto independente.
          </p>
        </div>
        ${footerColumn("Produto", FOOTER_PRODUTO)}
        ${footerColumn("Confiança", FOOTER_CONFIANCA)}
        ${footerColumn("Conta", FOOTER_CONTA)}
        <div class="sp-footer__col">
          <h2>Suporte</h2>
          <ul>
            <li><a href="/suporte">Central de suporte</a></li>
            <li><a href="mailto:${SUPORTE_EMAIL}">${SUPORTE_EMAIL}</a></li>
          </ul>
        </div>
      </div>
      <div class="sp-footer__legal">
        <p>© ${year} Sparta GG. Projeto independente, não afiliado à Riot Games.</p>
        <p>${RIOT_DISCLAIMER}</p>
      </div>
    </div>
  `;
}

/** Alterna o menu mobile mantendo `aria-expanded` fiel ao estado real. */
function wireNavToggle(): void {
  const toggle = document.getElementById("sp-nav-toggle");
  const nav = document.getElementById("sp-nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

/**
 * Entrada suave dos blocos. A guarda importante esta no CSS: o estado
 * escondido so existe sob `html[data-reveal-ready]`, e esse atributo so e
 * escrito aqui. Se este modulo nao rodar, nada fica invisivel.
 */
function wireReveal(): void {
  const alvos = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (alvos.length === 0) return;

  const semMovimento =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (semMovimento || typeof IntersectionObserver !== "function") return;

  document.documentElement.setAttribute("data-reveal-ready", "");

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
  );

  alvos.forEach((alvo) => observer.observe(alvo));
}

function mount(): void {
  const header = document.getElementById("sp-header");
  const footer = document.getElementById("sp-footer");
  if (header) header.innerHTML = renderHeader();
  if (footer) footer.innerHTML = renderFooter();

  wireNavToggle();
  wireReveal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
