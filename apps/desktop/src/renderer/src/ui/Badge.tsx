import type { ReactNode } from "react";
import "./Badge.css";

export type BadgeTone = "neutral" | "accent" | "positive" | "warning" | "negative";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  size?: "sm" | "md";
  /** Cantos retos - pra rotulo de conteudo (role, patch), nao de estado. */
  square?: boolean;
  icon?: ReactNode;
  title?: string;
}

export function Badge({ children, tone = "neutral", size = "sm", square = false, icon, title }: BadgeProps) {
  return (
    <span
      className={`sp-badge sp-badge--${tone} sp-badge--${size}${square ? " sp-badge--square" : ""}`}
      title={title}
    >
      {icon}
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  /** live = conectado/ativo, warning = degradado, offline = sem conexao. */
  state: "live" | "warning" | "offline";
  children: ReactNode;
}

/**
 * Indicador de conexao/estado de um modulo (ex. deteccao do League Client).
 * O ponto pulsa so no estado "live" - movimento marca "isto esta
 * acontecendo agora", nao decora os outros estados.
 */
export function StatusBadge({ state, children }: StatusBadgeProps) {
  return (
    <span className={`sp-status sp-status--${state}`}>
      <span className="sp-status__dot" aria-hidden="true" />
      {children}
    </span>
  );
}
