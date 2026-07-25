import {
  RATIO_STRENGTH_THRESHOLD,
  RATIO_WEAKNESS_THRESHOLD,
  SCORE_STRENGTH_THRESHOLD,
  SCORE_WEAKNESS_THRESHOLD
} from "@sparta/core";
import type { ReactNode } from "react";
import "./StatBar.css";

interface StatBarProps {
  label: ReactNode;
  value: number;
  /**
   * "score": valor ja 0-100 (metricas de recomendacao, componentes de
   * desempenho) - largura = valor.
   * "ratio": valor / baseline do role, centro neutro em 1.0 - largura
   * mapeada de 0..2x, com o meio da barra marcando a baseline.
   */
  variant?: "score" | "ratio";
  /** Texto a direita do rotulo (o numero legivel por humanos). */
  value_label?: ReactNode;
  /**
   * So pra "score": inverte de que lado fica cada cor, pra metricas onde
   * numero ALTO e ruim (ex. taxa de presenca de um ponto fraco). A largura
   * continua sendo o valor real - so o significado da cor troca.
   */
  invert?: boolean;
  size?: "md" | "lg";
}

function barColor(value: number, variant: "score" | "ratio", invert: boolean): string {
  if (variant === "ratio") {
    if (value >= RATIO_STRENGTH_THRESHOLD) return "var(--color-green)";
    if (value <= RATIO_WEAKNESS_THRESHOLD) return "var(--color-red)";
    return "var(--color-yellow)";
  }
  const good = invert ? value <= SCORE_WEAKNESS_THRESHOLD : value >= SCORE_STRENGTH_THRESHOLD;
  const bad = invert ? value >= SCORE_STRENGTH_THRESHOLD : value <= SCORE_WEAKNESS_THRESHOLD;
  if (good) return "var(--color-green)";
  if (bad) return "var(--color-red)";
  return "var(--color-yellow)";
}

/**
 * Barra de comparacao. As cores saem dos limiares ja exportados por
 * `dimension-signals.ts` - os mesmos que o dominio usa pra classificar
 * ponto forte/fraco, entao a leitura visual bate com o texto.
 */
export function StatBar({ label, value, variant = "score", value_label, invert = false, size = "md" }: StatBarProps) {
  const isRatio = variant === "ratio";
  const widthPercent = isRatio
    ? Math.max(0, Math.min(100, (value / 2) * 100))
    : Math.max(0, Math.min(100, value));

  return (
    <div className={`sp-statbar${size === "lg" ? " sp-statbar--lg" : ""}`}>
      <div className="sp-statbar__header">
        <span className="sp-statbar__label">{label}</span>
        {value_label !== undefined && <span className="sp-statbar__value">{value_label}</span>}
      </div>
      <div className={`sp-statbar__track${isRatio ? " sp-statbar__track--centered" : ""}`}>
        <div
          className="sp-statbar__fill"
          style={{ width: `${widthPercent}%`, background: barColor(value, variant, invert) }}
        />
      </div>
    </div>
  );
}
