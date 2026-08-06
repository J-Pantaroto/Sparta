import type {
  PerformanceTrendPoint,
  PlayerProfileOverview,
  ProfileMetric,
  ProfileMetricKey
} from "@sparta/core";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CloudOff,
  Crosshair,
  Database,
  History,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wifi,
  WifiOff
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import type { Page } from "../app/navigation";
import { roleLabels } from "../app/labels";
import {
  fetchMyPlayerProfile,
  syncMyPlayerData,
  type PlayerSyncResult,
  type RiotAccountSummary
} from "../services/api-client";
import {
  Badge,
  Button,
  Card,
  ChampionAvatar,
  CoverageBadge,
  EmptyState,
  ErrorState,
  RecentMatchRow,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  SkeletonRows,
  TrendChart
} from "../ui";
import "./DashboardScreen.css";

type TrendMetric = "performance" | "kda" | "objectives" | "vision" | "farm";
type SyncState = "idle" | "syncing" | "success" | "error";

interface DashboardScreenProps {
  riotAccounts: RiotAccountSummary[];
  sessionToken: string;
  ddragonVersion: string;
  champSelectActive: boolean;
  leagueConnected: boolean;
  emailVerified: boolean;
  refreshRequest?: number;
  onNavigate: (page: Page) => void;
  onOpenMatch: (matchId: string) => void;
  onProfileState?: (state: {
    loading: boolean;
    apiAvailable: boolean;
    updatedAt: string | null;
  }) => void;
}

export function DashboardScreen({
  riotAccounts,
  sessionToken,
  ddragonVersion,
  champSelectActive,
  leagueConnected,
  emailVerified,
  refreshRequest = 0,
  onNavigate,
  onOpenMatch,
  onProfileState
}: DashboardScreenProps) {
  const account = riotAccounts[0];
  const [profile, setProfile] = useState<PlayerProfileOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<7 | 14 | 30>(14);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("performance");
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const loadProfile = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    onProfileState?.({ loading: true, apiAvailable: true, updatedAt: null });
    try {
      const data = await fetchMyPlayerProfile(sessionToken);
      if (sequence !== requestSequence.current) return;
      setProfile(data);
      setLoading(false);
      onProfileState?.({
        loading: false,
        apiAvailable: true,
        updatedAt: data.identity.updatedAt
      });
    } catch (cause) {
      if (sequence !== requestSequence.current) return;
      const message =
        cause instanceof Error ? cause.message : "Não foi possível carregar o perfil.";
      setError(message);
      setLoading(false);
      onProfileState?.({ loading: false, apiAvailable: false, updatedAt: null });
    }
  }, [sessionToken, onProfileState]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile, refreshRequest]);

  const filteredTrend = useMemo(() => {
    if (!profile) return [];
    const anchor = new Date(profile.generatedAt).getTime();
    const cutoff = anchor - periodDays * 24 * 60 * 60 * 1000;
    return profile.performanceTrend.filter(
      (point) => new Date(point.observedAt).getTime() >= cutoff
    );
  }, [profile, periodDays]);

  async function synchronize() {
    setSyncState("syncing");
    setSyncMessage(null);
    try {
      const result = await syncMyPlayerData(sessionToken);
      setSyncState("success");
      setSyncMessage(syncResultMessage(result));
      await loadProfile();
    } catch {
      setSyncState("error");
      setSyncMessage("A sincronização não foi concluída. Verifique a API e tente novamente.");
    }
  }

  if (!account) {
    return (
      <Card>
        <EmptyState
          icon={<UserRound size={22} />}
          title="Vínculo Riot necessário"
          description="Conclua o vínculo da sua conta para carregar o dashboard pessoal."
        />
      </Card>
    );
  }

  if (loading && !profile) return <DashboardSkeleton />;

  if (error && !profile) {
    return (
      <Card>
        <ErrorState
          title="Dashboard indisponível"
          description="A API do Sparta não respondeu. Seus dados existentes não foram substituídos."
          actions={
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} />}
              onClick={() => void loadProfile()}
            >
              Tentar novamente
            </Button>
          }
        />
      </Card>
    );
  }

  if (!profile) return null;

  const metrics = new Map(profile.recentPerformance.metrics.map((metric) => [metric.key, metric]));
  const headlineMetric = metrics.get("RECENT_PERFORMANCE");
  const featuredMetrics = [
    metrics.get("OBJECTIVES"),
    metrics.get("VISION"),
    metrics.get("CONSISTENCY"),
    metrics.get("TEAM_IMPACT"),
    metrics.get("SURVIVAL")
  ].filter((metric): metric is ProfileMetric => Boolean(metric));
  const topChampion = profile.topChampions[0];
  const recentMatches = profile.recentMatches.slice(0, 5);

  return (
    <div className="sp-dashboard">
      <DashboardHero
        profile={profile}
        headlineMetric={headlineMetric}
        topChampion={topChampion}
        ddragonVersion={ddragonVersion}
        onOpenProfile={() => onNavigate("profile")}
      />

      {(profile.status === "PARTIAL" || profile.status === "STALE") && (
        <div
          className={`sp-dashboard-notice sp-dashboard-notice--${profile.status.toLocaleLowerCase()}`}
          role="status"
        >
          <Database size={16} aria-hidden="true" />
          <div>
            <strong>
              {profile.status === "STALE" ? "Dados desatualizados" : "Cobertura parcial"}
            </strong>
            <span>
              {profile.status === "STALE"
                ? "O último histórico foi preservado. Sincronize para buscar observações novas."
                : "Algumas fontes ainda não existem para toda a amostra; cada seção mostra sua cobertura."}
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw size={14} />}
            loading={syncState === "syncing"}
            onClick={() => void synchronize()}
          >
            Sincronizar
          </Button>
        </div>
      )}

      {syncMessage && (
        <div
          className={`sp-dashboard-notice sp-dashboard-notice--${syncState}`}
          role={syncState === "error" ? "alert" : "status"}
        >
          {syncState === "success" ? <CheckCircle2 size={16} /> : <CloudOff size={16} />}
          <span>{syncMessage}</span>
        </div>
      )}

      <section className="sp-dashboard-section" aria-labelledby="dashboard-indices-title">
        <SectionHeader
          eyebrow="Leitura rápida"
          title="Índices pessoais"
          description="Índices do Sparta sobre a sua amostra observada — não são notas da Riot nem comparação global."
        />
        <div className="sp-dashboard-indices">
          {headlineMetric && (
            <DashboardHeadlineMetric metric={headlineMetric} trend={filteredTrend} />
          )}
          <div className="sp-dashboard-indices__secondary">
            {featuredMetrics.map((metric) => (
              <DashboardMiniMetric key={metric.key} metric={metric} />
            ))}
          </div>
        </div>
      </section>

      <div className="sp-dashboard-main-grid">
        <Card className="sp-dashboard-trend-card">
          <SectionHeader
            eyebrow="Histórico observado"
            title="Tendência recente"
            actions={
              <SegmentedControl<"7" | "14" | "30">
                ariaLabel="Período do gráfico"
                value={String(periodDays) as "7" | "14" | "30"}
                onChange={(value) => setPeriodDays(Number(value) as 7 | 14 | 30)}
                options={[
                  { value: "7", label: "7 dias" },
                  { value: "14", label: "14 dias" },
                  { value: "30", label: "30 dias" }
                ]}
              />
            }
          />
          <SegmentedControl<TrendMetric>
            ariaLabel="Métrica do gráfico"
            value={trendMetric}
            onChange={setTrendMetric}
            options={[
              { value: "performance", label: "Desempenho" },
              { value: "kda", label: "KDA" },
              { value: "objectives", label: "Objetivos" },
              { value: "vision", label: "Visão" },
              { value: "farm", label: "Farm" }
            ]}
          />
          <TrendChart points={filteredTrend} periodDays={periodDays} metric={trendMetric} compact />
        </Card>

        <SystemStatusCard
          profile={profile}
          apiAvailable={!error}
          leagueConnected={leagueConnected}
          emailVerified={emailVerified}
          riotLinked={Boolean(account)}
          syncState={syncState}
        />
      </div>

      <div className="sp-dashboard-content-grid">
        <Card>
          <SectionHeader
            eyebrow="Últimas observações"
            title="Partidas recentes"
            actions={
              <Button
                variant="ghost"
                size="sm"
                icon={<ArrowRight size={14} />}
                onClick={() => onNavigate("postgame")}
              >
                Ver todas
              </Button>
            }
          />
          {recentMatches.length === 0 ? (
            <EmptyState
              inline
              title="Nenhuma partida sincronizada"
              description="Sincronize sua conta após jogar para que as partidas apareçam aqui."
              actions={
                <Button variant="secondary" onClick={() => void synchronize()}>
                  Sincronizar agora
                </Button>
              }
            />
          ) : (
            <div className="sp-dashboard-matches">
              {recentMatches.map((match) => (
                <RecentMatchRow
                  key={match.matchId}
                  match={match}
                  ddragonVersion={ddragonVersion}
                  onOpen={onOpenMatch}
                />
              ))}
            </div>
          )}
        </Card>

        <div className="sp-dashboard-side-stack">
          <Card>
            <SectionHeader
              eyebrow="Experiência observada"
              title="Campeões em destaque"
              actions={
                <Button variant="ghost" size="sm" onClick={() => onNavigate("profile")}>
                  Perfil
                </Button>
              }
            />
            {profile.topChampions.length === 0 ? (
              <EmptyState inline title="Sem campeões observados" />
            ) : (
              <div className="sp-dashboard-champions">
                {profile.topChampions.slice(0, 4).map((champion) => (
                  <DashboardChampion
                    key={`${champion.championId}-${champion.role}`}
                    champion={champion}
                    ddragonVersion={ddragonVersion}
                  />
                ))}
              </div>
            )}
          </Card>

          <QuickActions
            leagueConnected={leagueConnected}
            champSelectActive={champSelectActive}
            hasMatch={recentMatches.length > 0}
            syncing={syncState === "syncing"}
            onNavigate={onNavigate}
            onSync={() => void synchronize()}
            onOpenLastMatch={() => recentMatches[0] && onOpenMatch(recentMatches[0].matchId)}
          />
        </div>
      </div>
    </div>
  );
}

function DashboardHero({
  profile,
  headlineMetric,
  topChampion,
  ddragonVersion,
  onOpenProfile
}: {
  profile: PlayerProfileOverview;
  headlineMetric?: ProfileMetric;
  topChampion?: PlayerProfileOverview["topChampions"][number];
  ddragonVersion: string;
  onOpenProfile: () => void;
}) {
  const role = profile.roleProfile.primaryRole
    ? roleLabels[profile.roleProfile.primaryRole]
    : "Posição indisponível";
  return (
    <header className="sp-dashboard-hero">
      <div className="sp-dashboard-hero__identity">
        {topChampion ? (
          <ChampionAvatar
            championId={topChampion.championId}
            ddragonVersion={ddragonVersion}
            size="xl"
            alt={`${topChampion.championName}, campeão mais observado no período`}
          />
        ) : (
          <span className="sp-dashboard-hero__initial" aria-label="Ícone de invocador indisponível">
            {profile.identity.riotId.charAt(0).toLocaleUpperCase()}
          </span>
        )}
        <div>
          <span className="sp-dashboard-hero__eyebrow">Sua visão geral</span>
          <h1 title={profile.identity.riotId}>{profile.identity.riotId}</h1>
          <p>
            {profile.identity.regionLabel} · {role}
          </p>
        </div>
      </div>
      <div className="sp-dashboard-hero__facts" aria-label="Resumo do jogador">
        <HeroValue label="Elo" value={rankLabel(profile)} muted={profile.ranked.tier === null} />
        <HeroValue label="Partidas" value={String(profile.recentPerformance.sampleSize)} />
        <HeroValue
          label="Win rate recente"
          value={
            profile.recentPerformance.winRate === null
              ? "Indisponível"
              : `${Math.round(profile.recentPerformance.winRate)}%`
          }
          muted={profile.recentPerformance.winRate === null}
        />
        <HeroValue
          label="Desempenho"
          value={
            headlineMetric?.value === null || !headlineMetric
              ? "Indisponível"
              : String(Math.round(headlineMetric.value))
          }
          muted={headlineMetric?.value === null || !headlineMetric}
        />
      </div>
      <div className="sp-dashboard-hero__action">
        <span>
          <Clock3 size={13} /> {formatSync(profile.identity.updatedAt)}
        </span>
        <Button variant="secondary" icon={<UserRound size={15} />} onClick={onOpenProfile}>
          Abrir perfil
        </Button>
      </div>
    </header>
  );
}

function HeroValue({
  label,
  value,
  muted = false
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <span
      className={
        muted ? "sp-dashboard-hero__fact sp-dashboard-hero__fact--muted" : "sp-dashboard-hero__fact"
      }
    >
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function DashboardHeadlineMetric({
  metric,
  trend
}: {
  metric: ProfileMetric;
  trend: PerformanceTrendPoint[];
}) {
  const angle = metric.value === null ? 0 : Math.max(0, Math.min(100, metric.value)) * 3.6;
  const delta = trendDelta(trend);
  return (
    <article className="sp-dashboard-score">
      <div
        className="sp-dashboard-score__dial"
        style={{ "--sp-dashboard-angle": `${angle}deg` } as CSSProperties}
        role="img"
        aria-label={`${metric.label}: ${metric.value === null ? "indisponível" : Math.round(metric.value)}`}
      >
        <span>{metric.value === null ? "—" : Math.round(metric.value)}</span>
      </div>
      <div>
        <span>Índice principal</span>
        <h3>{metric.label}</h3>
        <p>
          {delta === null
            ? "Sem dois períodos comparáveis"
            : `${delta >= 0 ? "+" : ""}${delta} pontos entre as metades da janela`}
        </p>
        <CoverageBadge
          status={metric.status}
          coverage={metric.coverage}
          reason={metric.unavailableReason}
        />
      </div>
    </article>
  );
}

function DashboardMiniMetric({ metric }: { metric: ProfileMetric }) {
  const value = metric.value === null ? null : Math.round(metric.value);
  const angle = value === null ? 0 : Math.max(0, Math.min(100, value)) * 3.6;
  return (
    <article
      className="sp-dashboard-mini-metric"
      title={`${metric.formula} Versão ${metric.algorithmVersion}.`}
    >
      <span
        className="sp-dashboard-mini-metric__ring"
        style={{ "--sp-dashboard-angle": `${angle}deg` } as CSSProperties}
        aria-hidden="true"
      />
      <div>
        <small>{metric.label}</small>
        <strong>
          {value === null ? "Indisponível" : `${value}${metric.unit === "PERCENT" ? "%" : ""}`}
        </strong>
        <span>
          {metric.availableSampleSize}/{metric.sampleSize} partidas
        </span>
      </div>
    </article>
  );
}

function DashboardChampion({
  champion,
  ddragonVersion
}: {
  champion: PlayerProfileOverview["topChampions"][number];
  ddragonVersion: string;
}) {
  const form =
    champion.recentForm === "improving"
      ? "Em alta"
      : champion.recentForm === "declining"
        ? "Em queda"
        : "Estável";
  return (
    <article className="sp-dashboard-champion">
      <ChampionAvatar
        championId={champion.championId}
        ddragonVersion={ddragonVersion}
        size="md"
        alt={champion.championName}
      />
      <div className="sp-dashboard-champion__name">
        <strong>{champion.championName}</strong>
        <span>
          {roleLabels[champion.role]} · {form}
        </span>
      </div>
      <div className="sp-dashboard-champion__stats">
        <strong>{champion.games}</strong>
        <span>jogos</span>
      </div>
      <div className="sp-dashboard-champion__stats">
        <strong>{Math.round(champion.winRate)}%</strong>
        <span>win rate</span>
      </div>
      <div className="sp-dashboard-champion__stats">
        <strong>{champion.kda.toFixed(2)}</strong>
        <span>KDA</span>
      </div>
      <Badge tone={champion.sampleStatus === "SMALL" ? "warning" : "neutral"}>
        {champion.sampleStatus === "SMALL" ? "Amostra pequena" : "Observado"}
      </Badge>
    </article>
  );
}

function SystemStatusCard({
  profile,
  apiAvailable,
  leagueConnected,
  emailVerified,
  riotLinked,
  syncState
}: {
  profile: PlayerProfileOverview;
  apiAvailable: boolean;
  leagueConnected: boolean;
  emailVerified: boolean;
  riotLinked: boolean;
  syncState: SyncState;
}) {
  return (
    <Card className="sp-dashboard-system">
      <SectionHeader
        eyebrow="Operação"
        title="Estado do sistema"
        description="Problemas aparecem por impacto; estados normais permanecem compactos."
      />
      <div className="sp-dashboard-system__list">
        <SystemRow
          icon={apiAvailable ? <ShieldCheck /> : <CloudOff />}
          label="API Sparta"
          value={apiAvailable ? "Disponível" : "Bloqueador"}
          tone={apiAvailable ? "ok" : "blocker"}
        />
        <SystemRow
          icon={leagueConnected ? <Wifi /> : <WifiOff />}
          label="League Client"
          value={leagueConnected ? "Conectado" : "Fechado"}
          tone={leagueConnected ? "ok" : "info"}
        />
        <SystemRow
          icon={<RefreshCw />}
          label="Sincronização"
          value={syncState === "syncing" ? "Em andamento" : formatSync(profile.identity.updatedAt)}
          tone={profile.status === "STALE" ? "attention" : "ok"}
        />
        <SystemRow
          icon={<UserRound />}
          label="Vínculo Riot"
          value={riotLinked ? "Vinculado" : "Bloqueador"}
          tone={riotLinked ? "ok" : "blocker"}
        />
        <SystemRow
          icon={<CheckCircle2 />}
          label="Email"
          value={emailVerified ? "Confirmado" : "Bloqueador"}
          tone={emailVerified ? "ok" : "blocker"}
        />
      </div>
    </Card>
  );
}

function SystemRow({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "ok" | "attention" | "blocker" | "info";
}) {
  return (
    <div className={`sp-dashboard-system__row sp-dashboard-system__row--${tone}`}>
      <span aria-hidden="true">{icon}</span>
      <strong>{label}</strong>
      <small>{value}</small>
    </div>
  );
}

function QuickActions({
  leagueConnected,
  champSelectActive,
  hasMatch,
  syncing,
  onNavigate,
  onSync,
  onOpenLastMatch
}: {
  leagueConnected: boolean;
  champSelectActive: boolean;
  hasMatch: boolean;
  syncing: boolean;
  onNavigate: (page: Page) => void;
  onSync: () => void;
  onOpenLastMatch: () => void;
}) {
  return (
    <Card>
      <SectionHeader eyebrow="Atalhos" title="Ações rápidas" />
      <div className="sp-dashboard-actions">
        <button type="button" onClick={() => onNavigate("select")}>
          <Crosshair size={18} />
          <span>
            <strong>{champSelectActive ? "Abrir seleção ativa" : "Champion Select"}</strong>
            <small>
              {leagueConnected
                ? "Cliente detectado"
                : "Modo manual; detecção automática indisponível"}
            </small>
          </span>
          <ArrowRight size={14} />
        </button>
        <button type="button" onClick={onSync} disabled={syncing}>
          <RefreshCw size={18} />
          <span>
            <strong>{syncing ? "Sincronizando" : "Sincronizar dados"}</strong>
            <small>Busca novas partidas da conta vinculada</small>
          </span>
          <ArrowRight size={14} />
        </button>
        <button type="button" onClick={() => onNavigate("profile")}>
          <Activity size={18} />
          <span>
            <strong>Visualizar perfil</strong>
            <small>Índices, campeões e cobertura completa</small>
          </span>
          <ArrowRight size={14} />
        </button>
        <button
          type="button"
          onClick={onOpenLastMatch}
          disabled={!hasMatch}
          title={!hasMatch ? "Nenhuma partida sincronizada" : undefined}
        >
          <Sparkles size={18} />
          <span>
            <strong>Abrir última partida</strong>
            <small>{hasMatch ? "Detalhe e pós-game existente" : "Indisponível sem partidas"}</small>
          </span>
          <ArrowRight size={14} />
        </button>
        <button type="button" onClick={() => onNavigate("drafts")}>
          <History size={18} />
          <span>
            <strong>Consultar histórico</strong>
            <small>Drafts e decisões preservadas</small>
          </span>
          <ArrowRight size={14} />
        </button>
      </div>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="sp-dashboard" role="status" aria-label="Carregando dashboard">
      <div className="sp-dashboard-hero">
        <Skeleton width="38%" height={36} />
        <Skeleton width="52%" height={16} />
      </div>
      <div className="sp-dashboard-indices">
        <Skeleton height={150} radius="var(--radius-lg)" />
        <SkeletonRows count={3} height={42} />
      </div>
      <div className="sp-dashboard-main-grid">
        <Skeleton height={360} radius="var(--radius-lg)" />
        <Skeleton height={360} radius="var(--radius-lg)" />
      </div>
    </div>
  );
}

function rankLabel(profile: PlayerProfileOverview): string {
  if (!profile.ranked.tier) return "Indisponível";
  return [
    profile.ranked.tier,
    profile.ranked.division,
    profile.ranked.leaguePoints === null ? null : `${profile.ranked.leaguePoints} LP`
  ]
    .filter(Boolean)
    .join(" ");
}

function formatSync(value: string | null): string {
  return value
    ? `Atualizado em ${new Date(value).toLocaleDateString("pt-BR")}`
    : "Atualização indisponível";
}

function trendDelta(points: PerformanceTrendPoint[]): number | null {
  if (points.length < 4) return null;
  const half = Math.floor(points.length / 2);
  const previous = points.slice(0, half);
  const recent = points.slice(half);
  const average = (values: PerformanceTrendPoint[]) =>
    values.reduce((sum, point) => sum + point.performanceIndex, 0) / values.length;
  return Math.round(average(recent) - average(previous));
}

function syncResultMessage(result: PlayerSyncResult): string {
  if (result.failed.length > 0)
    return `${result.imported} partida(s) importada(s); ${result.failed.length} não puderam ser sincronizadas.`;
  if (result.imported > 0) return `${result.imported} nova(s) partida(s) importada(s).`;
  return "Sincronização concluída; nenhuma partida nova encontrada.";
}

export const DASHBOARD_METRIC_KEYS: ProfileMetricKey[] = [
  "RECENT_PERFORMANCE",
  "OBJECTIVES",
  "VISION",
  "CONSISTENCY",
  "TEAM_IMPACT",
  "SURVIVAL"
];
