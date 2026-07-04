import type { ReactNode } from "react";

export interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
}

export function MetricCard({ label, value, detail, icon }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card__header">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}
