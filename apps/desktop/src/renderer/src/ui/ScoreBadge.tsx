import { SCORE_STRENGTH_THRESHOLD, SCORE_WEAKNESS_THRESHOLD } from "@sparta/core";
import type { ReactNode } from "react";
import "./ScoreBadge.css";

type ScoreSize = "xs" | "sm" | "md" | "lg";

/** Cor semantica de um score 0-100, pelos limiares ja usados no dominio. */
export function scoreColor(score: number): string {
  if (score >= SCORE_STRENGTH_THRESHOLD) return "var(--color-green)";
  if (score <= SCORE_WEAKNESS_THRESHOLD) return "var(--color-red)";
  return "var(--color-yellow)";
}

interface ScoreBadgeProps {
  score: number;
  size?: ScoreSize;
  title?: string;
}

/**
 * Anel colorido com um score 0-100. Reusa os limiares exportados de
 * `dimension-signals.ts` (nao inventa limiar proprio) - a mesma faixa que
 * decide "ponto forte / neutro / ponto fraco" no resto do produto.
 */
export function ScoreBadge({ score, size = "md", title }: ScoreBadgeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = scoreColor(clamped);

  return (
    <div className={`sp-score sp-score--${size}`} title={title} role="img" aria-label={`Score ${Math.round(clamped)} de 100`}>
      <span
        className="sp-score__ring"
        aria-hidden="true"
        style={{ background: `conic-gradient(${color} ${clamped * 3.6}deg, var(--border-default) 0deg)` }}
      />
      <span className="sp-score__value">{Math.round(clamped)}</span>
    </div>
  );
}

/** Score com rotulo embaixo - pra comparar varios lado a lado. */
export function ScoreBlock({
  score,
  label,
  size = "sm",
  title
}: {
  score: number;
  label: ReactNode;
  size?: ScoreSize;
  title?: string;
}) {
  return (
    <div className="sp-score-block">
      <ScoreBadge score={score} size={size} title={title} />
      <span className="sp-score-block__label">{label}</span>
    </div>
  );
}
