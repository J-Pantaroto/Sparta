import { SCORE_STRENGTH_THRESHOLD, SCORE_WEAKNESS_THRESHOLD } from "@sparta/core";

interface ScoreBadgeProps {
  score: number;
  size?: "md" | "sm";
}

/**
 * Anel colorido (CSS conic-gradient puro, sem lib de grafico) mostrando um
 * score 0-100. Mostra o numero, nao uma letra de tier (S/A/B/C) - o Sparta
 * nao tem base estatistica de percentil real pra calibrar tiers (mesma
 * ressalva de docs/scoring-model.md), entao um numero colorido comunica
 * "bom/neutro/ruim" sem fingir uma precisao que o dado nao sustenta.
 * Reusa os mesmos limiares de dimension-signals.ts (nao inventa novos).
 */
export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= SCORE_STRENGTH_THRESHOLD ? "var(--color-green)" : clamped <= SCORE_WEAKNESS_THRESHOLD ? "var(--color-red)" : "var(--color-yellow)";
  const dimension = size === "sm" ? 36 : 52;
  const fontSize = size === "sm" ? 13 : 16;

  return (
    <div
      className="score-badge"
      style={{
        width: dimension,
        height: dimension,
        fontSize,
        background: `conic-gradient(${color} ${clamped * 3.6}deg, var(--color-border) 0deg)`
      }}
    >
      <span>{Math.round(clamped)}</span>
    </div>
  );
}
