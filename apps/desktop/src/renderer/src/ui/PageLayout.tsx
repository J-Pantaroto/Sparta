import type { CSSProperties, ReactNode } from "react";
import "./PageLayout.css";

export function PageLayout({ children }: { children: ReactNode }) {
  return <div className="sp-page">{children}</div>;
}

interface PageHeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Splash do tema. Sem ela o heroi cai numa superficie lisa, sem quebrar. */
  artUrl?: string;
  /** Conteudo a direita (score, acao principal). */
  aside?: ReactNode;
  /** Linha de contexto abaixo do titulo (badges, status, atalhos). */
  meta?: ReactNode;
  /** "feature" e mais alto - o heroi que abre o app (Dashboard). */
  variant?: "compact" | "feature";
}

/**
 * Cabecalho de tela. E o unico lugar onde a splash art aparece em tamanho
 * grande: o resto do app usa so a cor extraida dela, pra nao transformar
 * cada tela num wallpaper com texto por cima.
 */
export function PageHero({ eyebrow, title, subtitle, artUrl, aside, meta, variant = "compact" }: PageHeroProps) {
  return (
    <header
      className={`sp-hero sp-hero--${variant}`}
      style={artUrl ? { backgroundImage: `url(${artUrl})` } : undefined}
    >
      <div className="sp-hero__main">
        {eyebrow && <div className="sp-hero__eyebrow">{eyebrow}</div>}
        <h1 className="sp-hero__title">{title}</h1>
        {subtitle && <p className="sp-hero__subtitle">{subtitle}</p>}
        {meta && <div className="sp-hero__meta">{meta}</div>}
      </div>
      {aside && <div className="sp-hero__aside">{aside}</div>}
    </header>
  );
}

export function PageSection({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section className="sp-section" style={style}>
      {children}
    </section>
  );
}

/** Grade de colunas iguais. Reduz sozinha em janelas estreitas. */
export function Grid({ cols = 3, children, style }: { cols?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="sp-grid" style={{ ["--sp-grid-cols" as string]: cols, ...style }}>
      {children}
    </div>
  );
}

interface ColumnsProps {
  main: ReactNode;
  aside: ReactNode;
  /** Largura da coluna lateral. */
  asideWidth?: string;
  /** Lateral a esquerda (filtros) em vez de a direita (detalhe). */
  asideFirst?: boolean;
  /** Lateral acompanha o scroll - detalhe sempre visivel num workspace. */
  stickyAside?: boolean;
}

/** Conteudo principal + painel lateral, virando uma coluna em telas estreitas. */
export function Columns({ main, aside, asideWidth, asideFirst = false, stickyAside = false }: ColumnsProps) {
  const asideNode = <div className={stickyAside ? "sp-columns__sticky" : undefined}>{aside}</div>;
  return (
    <div
      className={`sp-columns${asideFirst ? " sp-columns--aside-first" : ""}`}
      style={asideWidth ? ({ ["--sp-aside" as string]: asideWidth } as CSSProperties) : undefined}
    >
      {asideFirst ? asideNode : <div>{main}</div>}
      {asideFirst ? <div>{main}</div> : asideNode}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="sp-toolbar">{children}</div>;
}

export function ToolbarSpacer() {
  return <span className="sp-toolbar__spacer" />;
}

/** Numeros em linha, comparaveis de relance (rotulo pequeno + valor forte). */
export function InlineStats({ children }: { children: ReactNode }) {
  return <div className="sp-inline-stats">{children}</div>;
}

export function InlineStat({ label, value, muted = false }: { label: ReactNode; value: ReactNode; muted?: boolean }) {
  return (
    <div className="sp-inline-stat">
      <span className="sp-inline-stat__label">{label}</span>
      <span className={`sp-inline-stat__value${muted ? " sp-inline-stat__value--muted" : ""}`}>{value}</span>
    </div>
  );
}
