import type {
  AvailabilityStatus,
  PerformanceTrendPoint,
  PlayerProfileOverview,
  ProfileChampionSummary,
  ProfileInsight,
  ProfileMetric,
  ProfileRecentMatch
} from "@sparta/core";
import { Activity, ArrowUpRight, Clock3, Database, ShieldQuestion } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { roleLabels } from "../app/labels";
import { itemIconUrl } from "../services/datadragon";
import { Badge, type BadgeTone } from "./Badge";
import { ChampionAvatar } from "./ChampionAvatar";
import "./ProfileAnalytics.css";

const statusLabels: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Disponível",
  PARTIAL: "Parcial",
  STALE: "Desatualizado",
  UNAVAILABLE: "Indisponível"
};

const statusTones: Record<AvailabilityStatus, BadgeTone> = {
  AVAILABLE: "positive",
  PARTIAL: "warning",
  STALE: "warning",
  UNAVAILABLE: "neutral"
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function safeNumber(value: number | null, digits = 0): string {
  return value === null || !Number.isFinite(value) ? "Indisponível" : value.toFixed(digits);
}

function dateLabel(value: string | null): string {
  if (!value) return "Data indisponível";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleDateString("pt-BR");
}

export function CoverageBadge({
  status,
  coverage,
  reason
}: {
  status: AvailabilityStatus;
  coverage?: number;
  reason?: string;
}) {
  const coverageLabel = coverage === undefined ? "" : ` · cobertura ${percent(coverage)}`;
  return (
    <Badge
      tone={statusTones[status]}
      title={`${statusLabels[status]}${coverageLabel}${reason ? ` · ${reason}` : ""}`}
    >
      {statusLabels[status]}
      {coverage !== undefined ? ` · ${percent(coverage)}` : ""}
    </Badge>
  );
}

export function ProfileHero({
  profile,
  ddragonVersion
}: {
  profile: PlayerProfileOverview;
  ddragonVersion: string;
}) {
  const initial = profile.identity.riotId.trim().charAt(0).toLocaleUpperCase("pt-BR") || "S";
  const ranked = profile.ranked.tier
    ? `${profile.ranked.tier}${profile.ranked.division ? ` ${profile.ranked.division}` : ""}`
    : "Elo indisponível";
  return (
    <header className="sp-profile-hero">
      <div className="sp-profile-hero__identity">
        <div
          className="sp-profile-hero__avatar"
          role="img"
          aria-label="Ícone de invocador indisponível"
        >
          {profile.identity.profileIconId === null ? (
            <span aria-hidden="true">{initial}</span>
          ) : (
            <img
              src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/profileicon/${profile.identity.profileIconId}.png`}
              alt="Ícone de invocador"
            />
          )}
        </div>
        <div className="sp-profile-hero__name">
          <span className="sp-profile-hero__eyebrow">Perfil analítico</span>
          <h1 title={profile.identity.riotId}>{profile.identity.riotId}</h1>
          <p>{profile.identity.regionLabel}</p>
        </div>
      </div>
      <div className="sp-profile-hero__summary" aria-label="Resumo do perfil">
        <HeroFact label="Ranque atual" value={ranked} muted={profile.ranked.tier === null} />
        <HeroFact
          label="Posição principal"
          value={
            profile.roleProfile.primaryRole
              ? roleLabels[profile.roleProfile.primaryRole]
              : "Indisponível"
          }
          muted={profile.roleProfile.primaryRole === null}
        />
        <HeroFact
          label="Partidas observadas"
          value={String(profile.recentPerformance.sampleSize)}
        />
        <HeroFact
          label="Vitórias recentes"
          value={
            profile.recentPerformance.winRate === null
              ? "Indisponível"
              : `${Math.round(profile.recentPerformance.winRate)}%`
          }
          muted={profile.recentPerformance.winRate === null}
        />
      </div>
      <div className="sp-profile-hero__footer">
        <CoverageBadge status={profile.status} />
        <span>
          Última sincronização:{" "}
          {profile.identity.updatedAt
            ? new Date(profile.identity.updatedAt).toLocaleString("pt-BR")
            : "indisponível"}
        </span>
        {profile.identity.summonerLevel === null && <span>Nível não integrado</span>}
      </div>
    </header>
  );
}

function HeroFact({
  label,
  value,
  muted = false
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={`sp-profile-hero__fact${muted ? " sp-profile-hero__fact--muted" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function MetricCard({ metric }: { metric: ProfileMetric }) {
  const angle = metric.value === null ? 0 : Math.max(0, Math.min(100, metric.value)) * 3.6;
  const style = { "--sp-metric-angle": `${angle}deg` } as CSSProperties;
  const value =
    metric.value === null
      ? "—"
      : `${Math.round(metric.value)}${metric.unit === "PERCENT" ? "%" : ""}`;
  return (
    <article
      className={`sp-profile-metric sp-profile-metric--${metric.status.toLocaleLowerCase()}`}
    >
      <div
        className="sp-profile-metric__dial"
        style={style}
        role="img"
        aria-label={`${metric.label}: ${metric.value === null ? "indisponível" : value}`}
      >
        <span>{value}</span>
      </div>
      <div className="sp-profile-metric__body">
        <h3>{metric.label}</h3>
        <CoverageBadge
          status={metric.status}
          coverage={metric.coverage}
          reason={metric.unavailableReason}
        />
        <p>
          {metric.sampleSize} partida{metric.sampleSize === 1 ? "" : "s"} na amostra
        </p>
        <details>
          <summary>Como é calculado</summary>
          <p>{metric.formula}</p>
          <small>{metric.algorithmVersion}</small>
        </details>
      </div>
    </article>
  );
}

export type TrendChartMetric = "performance" | "kda" | "objectives" | "vision" | "farm";

const trendMetricConfig: Record<
  TrendChartMetric,
  {
    label: string;
    value: (point: PerformanceTrendPoint) => number | null;
    minimumMax: number;
    suffix: string;
  }
> = {
  performance: {
    label: "Índice de desempenho pessoal",
    value: (point) => point.performanceIndex,
    minimumMax: 100,
    suffix: ""
  },
  kda: { label: "KDA observado", value: (point) => point.kda, minimumMax: 10, suffix: "" },
  objectives: {
    label: "Participação em objetivos",
    value: (point) =>
      point.objectiveParticipation === null ? null : point.objectiveParticipation * 100,
    minimumMax: 100,
    suffix: "%"
  },
  vision: {
    label: "Visão por minuto",
    value: (point) => point.visionScorePerMinute,
    minimumMax: 3,
    suffix: ""
  },
  farm: {
    label: "Farm por minuto",
    value: (point) => point.csPerMinute,
    minimumMax: 12,
    suffix: ""
  }
};

export function TrendChart({
  points,
  periodDays,
  metric = "performance",
  compact = false
}: {
  points: PerformanceTrendPoint[];
  periodDays: number;
  metric?: TrendChartMetric;
  compact?: boolean;
}) {
  const ordered = [...points].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt)
  );
  if (ordered.length === 0) {
    return (
      <div className="sp-trend-empty" role="status">
        <Activity size={22} aria-hidden="true" />
        <strong>Nenhum jogo nos últimos {periodDays} dias</strong>
        <span>Zero continua sendo exibido quando observado; aqui não há pontos no período.</span>
      </div>
    );
  }

  const config = trendMetricConfig[metric];
  const available = ordered.flatMap((point, pointIndex) => {
    const value = config.value(point);
    return value === null || !Number.isFinite(value) ? [] : [{ point, pointIndex, value }];
  });
  if (available.length === 0) {
    return (
      <div className="sp-trend-empty" role="status">
        <Activity size={22} aria-hidden="true" />
        <strong>{config.label} indisponível no período</strong>
        <span>Existem partidas, mas essa métrica não foi observada nelas.</span>
      </div>
    );
  }

  const width = 760;
  const height = 220;
  const x = (index: number) => 28 + (index * (width - 56)) / Math.max(1, ordered.length - 1);
  const observedMax = Math.max(...available.map((entry) => entry.value));
  const axisMax =
    metric === "performance" || metric === "objectives"
      ? 100
      : Math.max(config.minimumMax, Math.ceil(observedMax / 2) * 2);
  const y = (value: number) =>
    18 + ((axisMax - Math.max(0, Math.min(axisMax, value))) * (height - 44)) / axisMax;
  const runs: (typeof available)[] = [];
  for (const entry of available) {
    const current = runs.at(-1);
    const previous = current?.at(-1);
    const gap = previous
      ? new Date(entry.point.observedAt).getTime() - new Date(previous.point.observedAt).getTime()
      : 0;
    if (
      !current ||
      !previous ||
      entry.pointIndex !== previous.pointIndex + 1 ||
      gap > 48 * 60 * 60 * 1000
    ) {
      runs.push([entry]);
    } else {
      current.push(entry);
    }
  }
  const figureId = `profile-trend-${metric}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => axisMax * ratio);

  return (
    <figure
      className={`sp-trend-chart${compact ? " sp-trend-chart--compact" : ""}`}
      aria-labelledby={`${figureId}-title`}
    >
      <figcaption id={`${figureId}-title`}>
        {config.label} · últimos {periodDays} dias
      </figcaption>
      <div className="sp-trend-chart__legend" aria-label="Legenda do resultado observado">
        <span>
          <i
            className="sp-trend-chart__legend-dot sp-trend-chart__legend-dot--win"
            aria-hidden="true"
          />
          Vitória
        </span>
        <span>
          <i
            className="sp-trend-chart__legend-dot sp-trend-chart__legend-dot--loss"
            aria-hidden="true"
          />
          Derrota
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-describedby={`${figureId}-description`}
      >
        <desc id={`${figureId}-description`}>
          Escala iniciada em zero e terminada em {axisMax}. Intervalos superiores a 48 horas sem
          partida e métricas ausentes não são conectados.
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
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        ))}
        {runs.map((run) => {
          const coordinates = run
            .map((entry) => `${x(entry.pointIndex)},${y(entry.value)}`)
            .join(" ");
          return run.length > 1 ? (
            <polyline
              key={run[0]?.point.matchId}
              className="sp-trend-chart__line"
              points={coordinates}
            />
          ) : null;
        })}
        {available.map(({ point, pointIndex, value }) => (
          <circle
            key={point.matchId}
            className={`sp-trend-chart__point sp-trend-chart__point--${point.won ? "win" : "loss"}`}
            cx={x(pointIndex)}
            cy={y(value)}
            r="5"
            tabIndex={0}
          >
            <title>{`${dateLabel(point.observedAt)} · ${config.label.toLocaleLowerCase()} ${safeNumber(value, 2)}${config.suffix} · ${point.won ? "vitória" : "derrota"}`}</title>
          </circle>
        ))}
      </svg>
      <ul className="sp-trend-chart__text-values" aria-label="Valores do gráfico">
        {available.map(({ point, value }) => (
          <li key={point.matchId}>
            <time dateTime={point.observedAt}>{dateLabel(point.observedAt)}</time>
            <span>
              {config.label} {safeNumber(value, 2)}
              {config.suffix}
            </span>
            <span>KDA {point.kda}</span>
            <span>{point.won ? "Vitória" : "Derrota"}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function ChampionPerformanceCard({
  champion,
  ddragonVersion
}: {
  champion: ProfileChampionSummary;
  ddragonVersion: string;
}) {
  return (
    <article className="sp-profile-champion">
      <ChampionAvatar
        championId={champion.championId}
        ddragonVersion={ddragonVersion}
        size="xl"
        alt={champion.championName}
      />
      <div className="sp-profile-champion__identity">
        <h3>{champion.championName}</h3>
        <span>
          {roleLabels[champion.role]} · última partida {dateLabel(champion.lastPlayedAt)}
        </span>
      </div>
      <div className="sp-profile-champion__stats">
        <Stat label="Partidas" value={String(champion.games)} />
        <Stat label="V / D" value={`${champion.wins} / ${champion.losses}`} />
        <Stat label="Win rate" value={`${Math.round(champion.winRate)}%`} />
        <Stat label="KDA" value={safeNumber(champion.kda, 2)} />
      </div>
      <div className="sp-profile-champion__footer">
        <Badge tone={champion.sampleStatus === "SMALL" ? "warning" : "neutral"}>
          {champion.sampleStatus === "SMALL" ? "Amostra pequena" : "Amostra suficiente"}
        </Badge>
        <span>
          Forma:{" "}
          {champion.recentForm === "stable"
            ? "sem variação"
            : champion.recentForm === "improving"
              ? "em alta"
              : "em queda"}
        </span>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function durationLabel(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "Duração indisponível";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function RecentMatchRow({
  match,
  ddragonVersion,
  onOpen
}: {
  match: ProfileRecentMatch;
  ddragonVersion: string;
  onOpen: (matchId: string) => void;
}) {
  const availableItems = match.items.filter((item) => item.itemId !== null);
  const keystone = match.runes.find((rune) => rune.isKeystone) ?? match.runes[0];
  return (
    <button
      type="button"
      className={`sp-recent-match sp-recent-match--${match.won ? "win" : "loss"}`}
      onClick={() => onOpen(match.matchId)}
      aria-label={`Abrir detalhes da partida ${match.matchId} com ${match.championName}`}
    >
      <ChampionAvatar
        championId={match.championId}
        ddragonVersion={ddragonVersion}
        size="lg"
        alt={match.championName}
      />
      <div className="sp-recent-match__identity">
        <strong>{match.championName}</strong>
        <span>
          {roleLabels[match.role]} · {match.won ? "Vitória" : "Derrota"}
        </span>
      </div>
      <div className="sp-recent-match__kda">
        <strong>
          {match.kills} / {match.deaths} / {match.assists}
        </strong>
        <span>{safeNumber((match.kills + match.assists) / Math.max(1, match.deaths), 2)} KDA</span>
      </div>
      <div className="sp-recent-match__loadout" aria-label="Configuração observada">
        {availableItems.length > 0 ? (
          availableItems
            .slice(0, 6)
            .map((item) => (
              <img
                key={item.slot}
                src={itemIconUrl(item.itemId as number, ddragonVersion)}
                alt={item.itemName ?? `Item ${item.itemId}`}
              />
            ))
        ) : (
          <span>Itens indisponíveis</span>
        )}
        {keystone && <Badge tone="neutral">{keystone.perkName ?? `Runa ${keystone.perkId}`}</Badge>}
        {match.spells.length > 0 && (
          <span>{match.spells.map((spell) => spell.spellName ?? spell.spellId).join(" + ")}</span>
        )}
      </div>
      <div className="sp-recent-match__context">
        <span>
          <Clock3 size={13} aria-hidden="true" />
          {durationLabel(match.durationSeconds)}
        </span>
        <span>{match.queueLabel}</span>
        <span>{dateLabel(match.observedAt)}</span>
      </div>
      <div className="sp-recent-match__objective">
        <small>Objetivos</small>
        <strong>
          {match.objectiveParticipation === null
            ? "Indisponível"
            : `${Math.round(match.objectiveParticipation * 100)}%`}
        </strong>
      </div>
      <div className="sp-recent-match__availability" title="Evidências disponíveis">
        {match.timelineAvailable && <Badge tone="positive">Timeline</Badge>}
        {(match.postGameAvailable || match.draftComparisonAvailable) && (
          <Badge tone="accent">Pós-game</Badge>
        )}
        {!match.timelineAvailable &&
          !match.postGameAvailable &&
          !match.draftComparisonAvailable && <Badge tone="neutral">Resumo</Badge>}
      </div>
      <ArrowUpRight size={18} aria-hidden="true" />
    </button>
  );
}

export function InsightCard({
  insight,
  tone
}: {
  insight: ProfileInsight;
  tone: "positive" | "attention";
}) {
  return (
    <article className={`sp-profile-insight sp-profile-insight--${tone}`}>
      <div className="sp-profile-insight__icon" aria-hidden="true">
        {tone === "positive" ? <Database size={18} /> : <ShieldQuestion size={18} />}
      </div>
      <div>
        <h3>{insight.title}</h3>
        <p>{insight.detail}</p>
        <dl>
          <div>
            <dt>Evidência</dt>
            <dd>{insight.evidence}</dd>
          </div>
          <div>
            <dt>Amostra</dt>
            <dd>{insight.sampleSize} partidas</dd>
          </div>
          <div>
            <dt>Período</dt>
            <dd>
              {dateLabel(insight.periodStart)} a {dateLabel(insight.periodEnd)}
            </dd>
          </div>
          <div>
            <dt>Cobertura</dt>
            <dd>{percent(insight.coverage)}</dd>
          </div>
        </dl>
        <small>Regra {insight.ruleVersion}</small>
      </div>
    </article>
  );
}

export function ProfileDataNotice({ children }: { children: ReactNode }) {
  return <div className="sp-profile-data-notice">{children}</div>;
}
