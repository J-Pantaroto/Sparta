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

function splitRuns(points: PerformanceTrendPoint[]): PerformanceTrendPoint[][] {
  const runs: PerformanceTrendPoint[][] = [];
  for (const point of points) {
    const current = runs.at(-1);
    const previous = current?.at(-1);
    const gap = previous
      ? new Date(point.observedAt).getTime() - new Date(previous.observedAt).getTime()
      : 0;
    if (!current || gap > 48 * 60 * 60 * 1000) runs.push([point]);
    else current.push(point);
  }
  return runs;
}

export function TrendChart({
  points,
  periodDays
}: {
  points: PerformanceTrendPoint[];
  periodDays: number;
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

  const width = 760;
  const height = 220;
  const x = (index: number) => 28 + (index * (width - 56)) / Math.max(1, ordered.length - 1);
  const y = (value: number) =>
    18 + ((100 - Math.max(0, Math.min(100, value))) * (height - 44)) / 100;
  const index = new Map(ordered.map((point, pointIndex) => [point.matchId, pointIndex]));
  const runs = splitRuns(ordered);

  return (
    <figure className="sp-trend-chart" aria-labelledby="profile-trend-title">
      <figcaption id="profile-trend-title">
        Índice de desempenho pessoal · últimos {periodDays} dias
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
        aria-describedby="profile-trend-description"
      >
        <desc id="profile-trend-description">
          Escala fixa de zero a cem. Intervalos superiores a 48 horas sem partida não são
          conectados.
        </desc>
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              className="sp-trend-chart__grid"
              x1="28"
              x2={width - 28}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="sp-trend-chart__label" x="2" y={y(tick) + 4}>
              {tick}
            </text>
          </g>
        ))}
        {runs.map((run) => {
          const coordinates = run
            .map((point) => `${x(index.get(point.matchId) ?? 0)},${y(point.performanceIndex)}`)
            .join(" ");
          return run.length > 1 ? (
            <polyline key={run[0]?.matchId} className="sp-trend-chart__line" points={coordinates} />
          ) : null;
        })}
        {ordered.map((point, pointIndex) => (
          <circle
            key={point.matchId}
            className={`sp-trend-chart__point sp-trend-chart__point--${point.won ? "win" : "loss"}`}
            cx={x(pointIndex)}
            cy={y(point.performanceIndex)}
            r="5"
            tabIndex={0}
          >
            <title>{`${dateLabel(point.observedAt)} · índice ${point.performanceIndex} · KDA ${point.kda} · ${point.won ? "vitória" : "derrota"}`}</title>
          </circle>
        ))}
      </svg>
      <ul className="sp-trend-chart__text-values" aria-label="Valores do gráfico">
        {ordered.map((point) => (
          <li key={point.matchId}>
            <time dateTime={point.observedAt}>{dateLabel(point.observedAt)}</time>
            <span>Índice {point.performanceIndex}</span>
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
