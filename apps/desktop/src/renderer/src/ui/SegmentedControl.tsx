import type { ReactNode } from "react";
import "./SegmentedControl.css";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Numero ao lado do rotulo (ex. quantos campeoes naquele role). */
  count?: number;
  disabled?: boolean;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  ariaLabel: string;
}

/**
 * Escolha unica entre poucas opcoes (filtro de role, quantidade de
 * partidas). Usa `aria-pressed` em botoes de verdade em vez de um
 * `<select>` quando as opcoes cabem na tela - menos cliques e o estado
 * fica visivel sem abrir nada.
 */
export function SegmentedControl<T extends string>({ value, onChange, options, ariaLabel }: SegmentedControlProps<T>) {
  return (
    <div className="sp-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="sp-segmented__option"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className="sp-segmented__count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  ariaLabel: string;
}

/** Abas de conteudo dentro de uma tela (nao de navegacao entre telas). */
export function Tabs<T extends string>({ value, onChange, options, ariaLabel }: TabsProps<T>) {
  return (
    <div className="sp-tabs" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          className="sp-tabs__tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
