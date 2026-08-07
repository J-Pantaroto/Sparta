/**
 * Cabecalho, navegacao e rodape compartilhados entre as 9 paginas - sem
 * framework, sem build-time include: cada HTML tem um <header id="sp-header">
 * e <footer id="sp-footer"> vazios, preenchidos aqui no load. Mantem o site
 * inteiramente estatico (nenhum JS e necessario para o conteudo em si
 * aparecer - so a casca de navegacao).
 */

interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Início" },
  { href: "/como-funciona.html", label: "Como funciona" },
  { href: "/funcionalidades.html", label: "Funcionalidades" },
  { href: "/status.html", label: "Status" }
];

const FOOTER_LINKS: NavLink[] = [
  { href: "/privacidade.html", label: "Privacidade" },
  { href: "/termos.html", label: "Termos de uso" },
  { href: "/seguranca.html", label: "Segurança" },
  { href: "/excluir-conta.html", label: "Excluir conta" },
  { href: "/status.html", label: "Status" }
];

const RIOT_DISCLAIMER =
  "Sparta GG foi criado sob a política “Legal Jibber Jabber” da Riot Games, " +
  "usando recursos de propriedade da Riot Games. A Riot Games não endossa nem " +
  "patrocina este projeto.";

function currentPath(): string {
  const path = window.location.pathname;
  if (path === "/" || path.endsWith("/index.html")) return "/";
  return path;
}

function renderHeader(): string {
  const active = currentPath();
  const items = NAV_LINKS.map((link) => {
    const isActive = link.href === active;
    return `<a href="${link.href}"${isActive ? ' aria-current="page"' : ""}>${link.label}</a>`;
  }).join("");

  return `
    <div class="sp-container sp-header__row">
      <a class="sp-brand" href="/">
        <img src="/img/favicon.png" alt="" width="28" height="28" />
        Sparta GG
      </a>
      <button type="button" class="sp-nav__toggle" id="sp-nav-toggle" aria-expanded="false" aria-controls="sp-nav">
        Menu
      </button>
      <nav class="sp-nav" id="sp-nav" aria-label="Navegação principal">
        ${items}
      </nav>
    </div>
  `;
}

function renderFooter(): string {
  const year = new Date().getFullYear();
  const links = FOOTER_LINKS.map((link) => `<a href="${link.href}">${link.label}</a>`).join("");

  return `
    <div class="sp-container">
      <div class="sp-footer__grid">
        <span>© ${year} Sparta GG. Projeto independente, não afiliado à Riot Games.</span>
        <div class="sp-footer__links">${links}</div>
      </div>
      <p class="sp-footer__disclaimer">${RIOT_DISCLAIMER}</p>
    </div>
  `;
}

function mount() {
  const header = document.getElementById("sp-header");
  const footer = document.getElementById("sp-footer");
  if (header) header.innerHTML = renderHeader();
  if (footer) footer.innerHTML = renderFooter();

  const toggle = document.getElementById("sp-nav-toggle");
  const nav = document.getElementById("sp-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
