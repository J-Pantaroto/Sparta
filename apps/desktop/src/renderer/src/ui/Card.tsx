import type { CSSProperties, ReactNode } from "react";
import "./Card.css";

type CardTone = "default" | "flat" | "feature" | "inset";
type CardPad = "none" | "sm" | "md" | "lg";

interface CardBaseProps {
  tone?: CardTone;
  pad?: CardPad;
  selected?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  id?: string;
  className?: string;
}

function cardClass(tone: CardTone, pad: CardPad, selected: boolean, interactive: boolean): string {
  return [
    "sp-card",
    tone !== "default" ? `sp-card--${tone}` : "",
    `sp-card--pad-${pad}`,
    selected ? "sp-card--selected" : "",
    interactive ? "sp-card--interactive" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Superficie de conteudo com nivel de importancia explicito (`tone`) - o
 * `.panel` antigo dava exatamente o mesmo peso visual a todo bloco da tela,
 * o que deixava tudo parecendo uma pilha de caixas iguais.
 */
export function Card({
  tone = "default",
  pad = "md",
  selected = false,
  children,
  style,
  id,
  className
}: CardBaseProps) {
  return (
    <section
      className={`${cardClass(tone, pad, selected, false)}${className ? ` ${className}` : ""}`}
      style={style}
      id={id}
    >
      {children}
    </section>
  );
}

interface InteractiveCardProps extends CardBaseProps {
  onClick: () => void;
  /** Marca o item como o selecionado do grupo pra leitores de tela. */
  ariaCurrent?: boolean;
  label?: string;
}

/** Card clicavel. E um `<button>` de verdade: foco e Enter/Espaco de graca. */
export function InteractiveCard({
  tone = "default",
  pad = "md",
  selected = false,
  onClick,
  ariaCurrent,
  label,
  children,
  style,
  className
}: InteractiveCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={(ariaCurrent ?? selected) ? "true" : undefined}
      aria-label={label}
      className={`${cardClass(tone, pad, selected, true)}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {children}
    </button>
  );
}

interface SectionHeaderProps {
  title: ReactNode;
  /** Rotulo curto acima do titulo, na cor do tema. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function SectionHeader({ title, eyebrow, description, actions }: SectionHeaderProps) {
  return (
    <div className="sp-section-header">
      <div className="sp-section-header__text">
        {eyebrow && <span className="sp-section-header__eyebrow">{eyebrow}</span>}
        <h2 className="sp-section-header__title">{title}</h2>
        {description && <p className="sp-section-header__description">{description}</p>}
      </div>
      {actions && <div className="sp-section-header__actions">{actions}</div>}
    </div>
  );
}
