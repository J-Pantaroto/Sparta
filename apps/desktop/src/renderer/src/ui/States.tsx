import { AlertCircle } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import "./States.css";

interface LoadingProps {
  label?: string;
  /** Centralizado com respiro, pra quando ocupa a area toda de um painel. */
  block?: boolean;
}

export function Loading({ label = "Carregando...", block = false }: LoadingProps) {
  return (
    <div className={`sp-loading${block ? " sp-loading--block" : ""}`} role="status">
      <span className="sp-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: string;
  style?: CSSProperties;
}

/** Bloco de shimmer com a forma do conteudo que vai chegar. */
export function Skeleton({ width = "100%", height = 14, radius, style }: SkeletonProps) {
  return (
    <span
      className="sp-skeleton"
      aria-hidden="true"
      style={{ display: "block", width, height, borderRadius: radius, ...style }}
    />
  );
}

/** Grade de quadrados - grids de icone de campeao/skin enquanto carregam. */
export function SkeletonGrid({ count = 24, size = 40 }: { count?: number; size?: number }) {
  return (
    <div className="sp-skeleton-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} width={size} height={size} radius="var(--radius-sm)" />
      ))}
    </div>
  );
}

/** Linhas de altura fixa - listas/tabelas enquanto carregam. */
export function SkeletonRows({ count = 5, height = 56 }: { count?: number; height?: number }) {
  return (
    <div className="sp-skeleton-rows" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height={height} radius="var(--radius-md)" />
      ))}
    </div>
  );
}

interface StateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Menos respiro - quando o estado vive dentro de um card, nao da tela. */
  inline?: boolean;
}

/**
 * Ausencia de conteudo com explicacao e (quando existe) o proximo passo -
 * antes o app mostrava so um paragrafo solto, sem indicar o que fazer.
 */
export function EmptyState({ icon, title, description, actions, inline = false }: StateProps) {
  return (
    <div className={`sp-state${inline ? " sp-state--inline" : ""}`}>
      {icon && <div className="sp-state__icon">{icon}</div>}
      <p className="sp-state__title">{title}</p>
      {description && <p className="sp-state__description">{description}</p>}
      {actions && <div className="sp-state__actions">{actions}</div>}
    </div>
  );
}

export function ErrorState({ title = "Algo deu errado", description, actions, inline = false }: Partial<StateProps>) {
  return (
    <div className={`sp-state sp-state--error${inline ? " sp-state--inline" : ""}`} role="alert">
      <div className="sp-state__icon">
        <AlertCircle size={22} />
      </div>
      <p className="sp-state__title">{title}</p>
      {description && <p className="sp-state__description">{description}</p>}
      {actions && <div className="sp-state__actions">{actions}</div>}
    </div>
  );
}
