import type { ReactNode } from "react";
import "./AppShell.css";

export function AppShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="sp-shell">
      {sidebar}
      <main className="sp-content">
        <div className="sp-content__inner">{children}</div>
      </main>
    </div>
  );
}

interface SidebarProps {
  /** Identidade do usuario, fixada no rodape. */
  footer?: ReactNode;
  children: ReactNode;
}

export function Sidebar({ footer, children }: SidebarProps) {
  return (
    <aside className="sp-sidebar">
      <div className="sp-sidebar__brand">
        <div className="sp-sidebar__mark" aria-hidden="true">
          S
        </div>
        <div>
          <strong className="sp-sidebar__wordmark">Sparta</strong>
          <span className="sp-sidebar__tagline">Draft & performance</span>
        </div>
      </div>
      <nav className="sp-sidebar__nav" aria-label="Navegação principal">
        {children}
      </nav>
      {footer}
    </aside>
  );
}

/** Bloco de itens de navegacao com um rotulo de categoria. */
export function SidebarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sp-navgroup">
      <p className="sp-navgroup__label">{label}</p>
      {children}
    </div>
  );
}

interface SidebarNavItemProps {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  /** Ponto verde pulsante - o modulo esta acontecendo agora (LCU ao vivo). */
  live?: boolean;
  badge?: ReactNode;
}

export function SidebarNavItem({ label, icon, active, onClick, live = false, badge }: SidebarNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`sp-navitem${active ? " sp-navitem--active" : ""}`}
    >
      <span className="sp-navitem__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sp-navitem__label">{label}</span>
      {live && <span className="sp-navitem__pulse" title="Detectado ao vivo" />}
      {badge}
    </button>
  );
}

interface PlayerSummaryProps {
  name: string;
  meta: string;
  /** Splash do tema atual, recortada como retrato. */
  artUrl?: string;
}

export function PlayerSummary({ name, meta, artUrl }: PlayerSummaryProps) {
  return (
    <div className="sp-player">
      <div
        className="sp-player__art"
        aria-hidden="true"
        style={artUrl ? { backgroundImage: `url(${artUrl})` } : undefined}
      />
      <div className="sp-player__text">
        <strong className="sp-player__name" title={name}>
          {name}
        </strong>
        <span className="sp-player__meta" title={meta}>
          {meta}
        </span>
      </div>
    </div>
  );
}
