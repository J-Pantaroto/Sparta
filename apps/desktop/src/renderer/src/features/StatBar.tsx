import { RATIO_STRENGTH_THRESHOLD, RATIO_WEAKNESS_THRESHOLD, SCORE_STRENGTH_THRESHOLD, SCORE_WEAKNESS_THRESHOLD } from "@sparta/core";

interface StatBarProps {
  label: string;
  value: number;
  variant?: "score" | "ratio";
  detail?: string;
}

/**
 * Barra horizontal pura CSS (sem lib de grafico). Duas variantes:
 * - "score" (padrao): valor ja 0-100 (ex. PickRecommendation.metrics,
 *   ChampionPerformanceScore.components) - largura = valor, cor pelos
 *   limiares SCORE_STRENGTH_THRESHOLD/SCORE_WEAKNESS_THRESHOLD.
 * - "ratio": valor/baseline (centro neutro 1.0, ex. Pos-game vs
 *   roleBaselines) - largura mapeada de 0..2x pra 0-100%, com o centro
 *   (50%) marcando a baseline; cor pelos limiares RATIO_STRENGTH_THRESHOLD/
 *   RATIO_WEAKNESS_THRESHOLD. Ambos os pares de limiar ja existem em
 *   dimension-signals.ts, nao inventados aqui.
 */
export function StatBar({ label, value, variant = "score", detail }: StatBarProps) {
  const isRatio = variant === "ratio";
  const widthPercent = isRatio ? Math.max(0, Math.min(100, (value / 2) * 100)) : Math.max(0, Math.min(100, value));
  const color = isRatio
    ? value >= RATIO_STRENGTH_THRESHOLD
      ? "var(--color-green)"
      : value <= RATIO_WEAKNESS_THRESHOLD
        ? "var(--color-red)"
        : "var(--color-yellow)"
    : value >= SCORE_STRENGTH_THRESHOLD
      ? "var(--color-green)"
      : value <= SCORE_WEAKNESS_THRESHOLD
        ? "var(--color-red)"
        : "var(--color-yellow)";

  return (
    <div className="stat-bar">
      <div className="stat-bar-header">
        <span>{label}</span>
        {detail && <small>{detail}</small>}
      </div>
      <div className={`stat-bar-track${isRatio ? " centered" : ""}`}>
        <div className="stat-bar-fill" style={{ width: `${widthPercent}%`, background: color }} />
      </div>
    </div>
  );
}
