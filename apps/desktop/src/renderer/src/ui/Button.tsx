import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "confirmed";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ocupa toda a largura disponivel (formularios, paineis estreitos). */
  block?: boolean;
  /** Troca o conteudo por um spinner e desabilita - acao em andamento. */
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

/**
 * Botao unico do app. Antes cada tela criava o seu: alguns eram `<button>`
 * HTML sem classe nenhuma (sem estilo, feedback real do usuario), outros
 * herdavam estilo por posicao no DOM (`.recommendation button`), o que
 * quebrava assim que o botao mudava de lugar.
 */
export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  loading = false,
  icon,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`sp-btn sp-btn--${variant} sp-btn--${size}${block ? " sp-btn--block" : ""}`}
    >
      {loading ? <span className="sp-btn__spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  /** Obrigatorio: sem rotulo visivel, o nome acessivel vem daqui. */
  label: string;
  icon: ReactNode;
  size?: "sm" | "md";
  active?: boolean;
}

/** Botao so-icone. `label` vira `aria-label` e `title` (tooltip nativo). */
export function IconButton({ label, icon, size = "md", active = false, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={`sp-icon-btn sp-icon-btn--${size}${active ? " sp-icon-btn--active" : ""}`}
    >
      {icon}
    </button>
  );
}
