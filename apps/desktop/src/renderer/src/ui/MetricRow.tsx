import { hasDisplayableValue, type RecommendationMetric } from "@sparta/core";
import { AlertTriangle, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { StatBar } from "./StatBar";
import "./MetricRow.css";

interface MetricRowProps {
  metric: RecommendationMetric;
  label: ReactNode;
  /** Origem resumida ("derivado", "oficial"...), quando vale mostrar. */
  sourceLabel?: string;
}

/**
 * Renderiza uma métrica respeitando o estado dela.
 *
 * - `AVAILABLE`   → barra normal com o valor.
 * - `PARTIAL`     → barra + marca de "parcial".
 * - `STALE`       → barra dessaturada + marca de "desatualizado" + motivo.
 * - `UNAVAILABLE` → **sem barra**: "Indisponível" e o motivo.
 *
 * A regra que importa: ausência nunca vira número. Não existe caminho neste
 * componente que desenhe uma barra a partir de `value === null`.
 */
export function MetricRow({ metric, label, sourceLabel }: MetricRowProps) {
  if (!hasDisplayableValue(metric)) {
    return (
      <div className="sp-metric">
        <div className="sp-metric__head">
          <span className="sp-metric__label">{label}</span>
          <span className="sp-metric__absent">Indisponível</span>
        </div>
        <div className="sp-metric__empty-track" aria-hidden="true" />
        {metric.unavailableReason && <span className="sp-metric__reason">{metric.unavailableReason}</span>}
      </div>
    );
  }

  const isStale = metric.status === "STALE";
  const isPartial = metric.status === "PARTIAL";
  const value = metric.value as number;

  return (
    <div className={`sp-metric${isStale ? " sp-metric--stale" : ""}`}>
      <StatBar
        label={
          <>
            {label}
            {isStale && (
              <span className="sp-metric__flag">
                <Clock size={10} /> desatualizado
              </span>
            )}
            {isPartial && (
              <span className="sp-metric__flag">
                <AlertTriangle size={10} /> parcial
              </span>
            )}
          </>
        }
        value={value}
        value_label={Math.round(value).toString()}
        invert={metric.key === "EXECUTION_RISK"}
      />
      {isStale && metric.staleReason && <span className="sp-metric__reason">{metric.staleReason}</span>}
      {metric.explanation && <span className="sp-metric__reason">{metric.explanation}</span>}
      {sourceLabel && <span className="sp-metric__source">{sourceLabel}</span>}
    </div>
  );
}
