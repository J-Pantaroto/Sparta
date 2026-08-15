import { useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  LogOut,
  RefreshCw,
  Settings,
  UserRound,
  Wifi,
  WifiOff
} from "lucide-react";
import "./AppShell.css";

export function AppShell({
  sidebar,
  topbar,
  children,
  collapsed = false
}: {
  sidebar: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <div className={`sp-shell${collapsed ? " sp-shell--collapsed" : ""}`}>
      {sidebar}
      <div className="sp-shell__workspace">
        {topbar}
        <main className="sp-content" id="sp-main-content" tabIndex={-1}>
          <div className="sp-content__inner" key={String(collapsed)}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

interface SidebarProps {
  footer?: ReactNode;
  children: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  leagueConnected?: boolean;
  version?: string;
}

export function Sidebar({
  footer,
  children,
  collapsed = false,
  onToggle,
  leagueConnected = false,
  version
}: SidebarProps) {
  return (
    <aside className="sp-sidebar" aria-label="Navegação do Sparta">
      <div className="sp-sidebar__brand-row">
        <div className="sp-sidebar__brand">
          <div className="sp-sidebar__mark" aria-hidden="true">
            S
          </div>
          <div className="sp-sidebar__brand-copy">
            <strong className="sp-sidebar__wordmark">Sparta GG</strong>
            <span className="sp-sidebar__tagline">Draft & performance</span>
          </div>
        </div>
        {onToggle && (
          <button
            type="button"
            className="sp-sidebar__toggle"
            onClick={onToggle}
            aria-label={collapsed ? "Expandir navegação" : "Recolher navegação"}
            title={collapsed ? "Expandir navegação" : "Recolher navegação"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>
      <nav className="sp-sidebar__nav" aria-label="Navegação principal">
        {children}
      </nav>
      <div
        className="sp-sidebar__runtime"
        title={leagueConnected ? "League Client detectado" : "League Client fechado"}
      >
        {leagueConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span>{leagueConnected ? "League conectado" : "League fechado"}</span>
      </div>
      {footer}
      {version && <span className="sp-sidebar__version">Sparta {version}</span>}
    </aside>
  );
}

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
  description?: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  live?: boolean;
  badge?: ReactNode;
  collapsed?: boolean;
  disabledReason?: string;
}

export function SidebarNavItem({
  label,
  description,
  icon,
  active,
  onClick,
  live = false,
  badge,
  collapsed = false,
  disabledReason
}: SidebarNavItemProps) {
  const hint = disabledReason ?? (description ? `${label} — ${description}` : label);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      aria-disabled={disabledReason ? true : undefined}
      disabled={Boolean(disabledReason)}
      title={collapsed || disabledReason ? hint : undefined}
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
  collapsed?: boolean;
}

export function PlayerSummary({ name, meta, collapsed = false }: PlayerSummaryProps) {
  const initial = name.trim().charAt(0).toLocaleUpperCase() || "S";
  return (
    <div className="sp-player" title={collapsed ? `${name} — ${meta}` : undefined}>
      <span className="sp-player__art" aria-hidden="true">
        {initial}
      </span>
      <span className="sp-player__text">
        <strong className="sp-player__name" title={name}>
          {name}
        </strong>
        <span className="sp-player__meta" title={meta}>
          {meta}
        </span>
      </span>
    </div>
  );
}

interface TopbarProps {
  title: string;
  context: string;
  accountName: string;
  apiAvailable: boolean;
  leagueConnected: boolean;
  lastSync?: string | null;
  canRefresh?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onAccount: () => void;
  onSettings: () => void;
  onLogout: () => void;
}

export function Topbar({
  title,
  context,
  accountName,
  apiAvailable,
  leagueConnected,
  lastSync,
  canRefresh = false,
  refreshing = false,
  onRefresh,
  onAccount,
  onSettings,
  onLogout
}: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sp-topbar">
      <a className="sp-skip-link" href="#sp-main-content">
        Ir para o conteúdo
      </a>
      <div className="sp-topbar__context">
        <strong>{title}</strong>
        <span>{context}</span>
      </div>
      <div className="sp-topbar__actions">
        {lastSync && (
          <span className="sp-topbar__sync" title={new Date(lastSync).toLocaleString("pt-BR")}>
            Atualizado {new Date(lastSync).toLocaleDateString("pt-BR")}
          </span>
        )}
        <SystemPill
          available={apiAvailable}
          label={apiAvailable ? "API disponível" : "API indisponível"}
          icon={apiAvailable ? <Cloud size={13} /> : <CloudOff size={13} />}
        />
        <SystemPill
          available={leagueConnected}
          label={leagueConnected ? "League conectado" : "League fechado"}
          icon={leagueConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
        />
        {canRefresh && onRefresh && (
          <button
            type="button"
            className="sp-topbar__icon-button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={refreshing ? "Atualizando dados" : "Atualizar dados da tela"}
            title={refreshing ? "Atualizando dados" : "Atualizar dados da tela"}
          >
            <RefreshCw size={16} className={refreshing ? "sp-icon--rotating" : undefined} />
          </button>
        )}
        <div className="sp-account-menu">
          <button
            type="button"
            className="sp-account-menu__trigger"
            onClick={() => setMenuOpen((current) => !current)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="Menu da conta"
          >
            <span aria-hidden="true">
              {accountName.trim().charAt(0).toLocaleUpperCase() || "S"}
            </span>
            <strong>{accountName}</strong>
          </button>
          {menuOpen && (
            <div className="sp-account-menu__popover" role="menu">
              <button type="button" role="menuitem" onClick={onAccount}>
                <UserRound size={16} /> Conta e segurança
              </button>
              <button type="button" role="menuitem" onClick={onSettings}>
                <Settings size={16} /> Configurações
              </button>
              <button type="button" role="menuitem" onClick={onLogout}>
                <LogOut size={16} /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function SystemPill({
  available,
  label,
  icon
}: {
  available: boolean;
  label: string;
  icon: ReactNode;
}) {
  return (
    <span
      className={`sp-system-pill sp-system-pill--${available ? "available" : "offline"}`}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}
