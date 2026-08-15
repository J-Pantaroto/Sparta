import { Activity } from "lucide-react";
import { useId } from "react";

export interface TemporalChartPoint {
  matchId: string;
  observedAt: string;
  value: number;
  won: boolean;
}

interface TemporalChartProps {
  /** Não precisa vir ordenado - o componente ordena por `observedAt`. */
  points: TemporalChartPoint[];
  label: string;
  unit?: string;
  decimals?: number;
  /** Eixo nunca fica menor que isso, mesmo se todo valor observado for baixo. */
  minimumAxisMax?: number;
  /** Quando definido, o eixo fica fixo nesse valor (métricas 0-100%). */
  fixedAxisMax?: number;
  captionLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  compact?: boolean;
}

function safeNumber(value: number, decimals: number): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "—";
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "Data desconhecida"
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Linha temporal genérica, por PARTIDA (não por dia) - cada ponto é um
 * `matchId` real, sem interpolação e sem gap-detection: diferente do
 * `TrendChart` do Perfil (que corta a linha quando faltam >48h entre
 * partidas, porque ali o eixo é um período de calendário fixo), aqui o
 * eixo é a própria sequência de partidas analisadas - conectar todos os
 * pontos em ordem é o retrato honesto de "evolução ao longo das
 * partidas", não uma suavização.
 *
 * Mesma gramática visual do `TrendChart` (grid discreto, `<desc>`
 * acessível, lista textual de valores como fallback sem depender de
 * hover) - SVG puro, sem biblioteca de gráfico.
 */
export function TemporalChart({
  points,
  label,
  unit = "",
  decimals = 2,
  minimumAxisMax = 1,
  fixedAxisMax,
  captionLabel,
  emptyTitle,
  emptyDescription,
  compact = false
}: TemporalChartProps) {
  const id = useId();
  const ordered = [...points]
    .filter((point) => Number.isFinite(point.value))
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));

  if (ordered.length === 0) {
    return (
      <div className="sp-trend-empty" role="status">
        <Activity size={22} aria-hidden="true" />
        <strong>{emptyTitle}</strong>
        <span>{emptyDescription}</span>
      </div>
    );
  }

  const width = 760;
  const height = compact ? 140 : 220;
  const padTop = 18;
  const padBottom = height - 26;
  const x = (index: number) => 28 + (index * (width - 56)) / Math.max(1, ordered.length - 1);
  const observedMax = Math.max(...ordered.map((point) => point.value));
  const axisMax = fixedAxisMax ?? Math.max(minimumAxisMax, observedMax * 1.15);
  const y = (value: number) =>
    padTop + ((axisMax - Math.max(0, Math.min(axisMax, value))) * (padBottom - padTop)) / axisMax;

  const coordinates = ordered.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const areaPath = `M${x(0)},${padBottom} L${coordinates.split(" ").join(" L")} L${x(ordered.length - 1)},${padBottom} Z`;
  // `useId` evita IDs ARIA duplicados quando a mesma métrica aparece mais
  // de uma vez na árvore (por exemplo, dois estados da tela durante uma
  // transição). O rótulo continua legível no prefixo para inspeção do DOM.
  const figureId = `temporal-chart-${label.replace(/\s+/g, "-").toLowerCase()}-${id.replace(/:/g, "")}`;
  const ticks = fixedAxisMax
    ? [0, 0.25, 0.5, 0.75, 1].map((ratio) => axisMax * ratio)
    : [0, 0.5, 1].map((ratio) => axisMax * ratio);

  return (
    <figure
      className={`sp-trend-chart${compact ? " sp-trend-chart--compact" : ""}`}
      aria-labelledby={`${figureId}-title`}
    >
      <figcaption id={`${figureId}-title`}>
        {label} · {captionLabel}
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-describedby={`${figureId}-description`}
      >
        <desc id={`${figureId}-description`}>
          {ordered.length} partidas reais, uma por ponto, na ordem em que foram jogadas. Escala de 0
          a {safeNumber(axisMax, decimals)}
          {unit}.
        </desc>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className="sp-trend-chart__grid"
              x1="28"
              x2={width - 28}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="sp-trend-chart__label" x="2" y={y(tick) + 4}>
              {safeNumber(tick, tick < 10 ? 1 : 0)}
              {unit}
            </text>
          </g>
        ))}
        <path className="sp-trend-chart__area" d={areaPath} />
        {ordered.length > 1 && <polyline className="sp-trend-chart__line" points={coordinates} />}
        {ordered.map((point, index) => (
          <circle
            key={point.matchId}
            className={`sp-trend-chart__point sp-trend-chart__point--${point.won ? "win" : "loss"}`}
            cx={x(index)}
            cy={y(point.value)}
            r="5"
            tabIndex={0}
          >
            <title>{`${dateLabel(point.observedAt)} · ${label.toLocaleLowerCase()} ${safeNumber(point.value, decimals)}${unit} · ${point.won ? "vitória" : "derrota"}`}</title>
          </circle>
        ))}
      </svg>
      <ul
        className="sp-trend-chart__text-values sp-trend-chart__text-values--compact"
        aria-label="Valores do gráfico"
      >
        {ordered.map((point) => (
          <li key={point.matchId}>
            <time dateTime={point.observedAt}>{dateLabel(point.observedAt)}</time>
            <span>
              {label} {safeNumber(point.value, decimals)}
              {unit}
            </span>
            <span>{point.won ? "Vitória" : "Derrota"}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Mini-versão sem eixo/legenda, pra indicadores secundários lado a lado com um chip de tendência. */
export function TemporalSparkline({
  points,
  fixedAxisMax,
  minimumAxisMax = 1
}: {
  points: TemporalChartPoint[];
  fixedAxisMax?: number;
  minimumAxisMax?: number;
}) {
  const ordered = [...points]
    .filter((point) => Number.isFinite(point.value))
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  if (ordered.length < 2) return null;

  const width = 160;
  const height = 40;
  const x = (index: number) => 3 + (index * (width - 6)) / Math.max(1, ordered.length - 1);
  const observedMax = Math.max(...ordered.map((point) => point.value));
  const axisMax = fixedAxisMax ?? Math.max(minimumAxisMax, observedMax * 1.15);
  const y = (value: number) =>
    4 + ((axisMax - Math.max(0, Math.min(axisMax, value))) * (height - 8)) / axisMax;
  const coordinates = ordered.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const first = ordered[0]!.value;
  const last = ordered[ordered.length - 1]!.value;

  return (
    <svg
      className="sp-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Série observada em ${ordered.length} partidas, do valor ${first.toFixed(2)} ao valor ${last.toFixed(2)}`}
    >
      <polyline points={coordinates} />
      <circle cx={x(ordered.length - 1)} cy={y(last)} r="2.5" />
    </svg>
  );
}
