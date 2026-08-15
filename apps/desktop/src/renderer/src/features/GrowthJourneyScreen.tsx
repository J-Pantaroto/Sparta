import type {
  GrowthJourney,
  PerformanceTrendPoint,
  PlayerProfileOverview,
  WeaknessTrend
} from "@sparta/core";
import {
  Activity,
  ChartNoAxesCombined,
  Clock,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
  UserPlus
} from "lucide-react";
import { confidenceLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import {
  fetchGrowthJourney,
  fetchMyPlayerProfile,
  type RiotAccountSummary
} from "../services/api-client";
import { ThemedPageHero } from "../theme/ThemedPageHero";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  InlineStat,
  InlineStats,
  Loading,
  PageLayout,
  PageSection,
  SectionHeader,
  SignalChip,
  StatBar,
  TemporalChart,
  TemporalSparkline,
  type TemporalChartPoint
} from "../ui";
import "./GrowthJourneyScreen.css";

const MIN_TEMPORAL_POINTS = 3;

const trendLabels: Record<WeaknessTrend["trend"], string> = {
  improving: "Melhorando",
  worsening: "Piorando",
  stable: "Sem mudança",
  new: "Novo",
  resolved: "Resolvido"
};

interface TemporalIndicatorDefinition {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  value: (point: PerformanceTrendPoint) => number | null;
}

const temporalIndicators: TemporalIndicatorDefinition[] = [
  {
    key: "kda",
    label: "KDA observado",
    unit: "",
    decimals: 2,
    value: (point) => point.kda
  },
  {
    key: "farm",
    label: "Farm por minuto",
    unit: "",
    decimals: 2,
    value: (point) => point.csPerMinute
  },
  {
    key: "vision",
    label: "Visão por minuto",
    unit: "",
    decimals: 2,
    value: (point) => point.visionScorePerMinute
  },
  {
    key: "objectives",
    label: "Participação em objetivos",
    unit: "%",
    decimals: 0,
    value: (point) =>
      point.objectiveParticipation === null ? null : point.objectiveParticipation * 100
  }
];

function temporalPoints(
  points: PerformanceTrendPoint[],
  value: (point: PerformanceTrendPoint) => number | null
): TemporalChartPoint[] {
  return points.flatMap((point) => {
    const observed = value(point);
    return observed === null || !Number.isFinite(observed)
      ? []
      : [
          {
            matchId: point.matchId,
            observedAt: point.observedAt,
            value: observed,
            won: point.won
          }
        ];
  });
}

function formatObservedValue(value: number, unit: string, decimals: number): string {
  return `${value.toFixed(decimals)}${unit}`;
}

/**
 * Progressão pessoal apoiada em duas fontes já existentes e factuais:
 * `PlayerProfileOverview.performanceTrend` fornece uma observação por
 * partida; `GrowthJourney` continua fornecendo a comparação agregada entre
 * os dois blocos de relatórios pós-game. Esta tela só apresenta os valores
 * recebidos — não cria pontos intermediários, média móvel ou nova métrica.
 */
export function GrowthJourneyScreen({
  riotAccounts,
  sessionToken
}: {
  riotAccounts: RiotAccountSummary[];
  sessionToken: string | null;
}) {
  const account = riotAccounts[0];
  const journey = useAsyncData<{ puuid: string } & GrowthJourney>(
    () => (account && sessionToken ? fetchGrowthJourney(sessionToken, account.puuid) : undefined),
    [account?.puuid, sessionToken]
  );
  const profile = useAsyncData<PlayerProfileOverview>(
    () => (account && sessionToken ? fetchMyPlayerProfile(sessionToken) : undefined),
    [account?.puuid, sessionToken]
  );

  if (!account) {
    return (
      <PageLayout>
        <ThemedPageHero eyebrow="Evolução" title="Jornada de progresso" />
        <Card>
          <EmptyState
            icon={<UserPlus size={22} />}
            title="Nenhuma conta Riot vinculada"
            description="Vincule sua conta pra acompanhar sua evolução."
          />
        </Card>
      </PageLayout>
    );
  }

  const trends = journey.data?.weaknessTrends ?? [];
  const comparable = trends.filter((trend) => trend.hasComparison);
  const improving = comparable.filter(
    (trend) => trend.trend === "improving" || trend.trend === "resolved"
  );
  const worsening = comparable.filter(
    (trend) => trend.trend === "worsening" || trend.trend === "new"
  );
  const steady = comparable.filter((trend) => trend.trend === "stable");
  const pending = trends.filter((trend) => !trend.hasComparison);
  const performancePoints = profile.data
    ? temporalPoints(profile.data.performanceTrend, (point) => point.performanceIndex)
    : [];
  const hasTemporalHistory = performancePoints.length >= MIN_TEMPORAL_POINTS;

  // "Foco sugerido" não é um cálculo novo: é o ponto fraco que mais aparece
  // nas partidas recentes, que é exatamente o que `recentRate` mede.
  const focus = [...trends].sort((a, b) => b.recentRate - a.recentRate)[0];

  return (
    <PageLayout>
      <ThemedPageHero
        eyebrow="Evolução"
        title="Jornada de progresso"
        subtitle="Uma leitura temporal das partidas pessoais observadas, sem comparação global."
        meta={
          (journey.data || profile.data) && (
            <InlineStats>
              <InlineStat
                label="Relatórios pós-game"
                value={journey.data?.matchesAnalyzed ?? "Indisponível"}
                muted={!journey.data}
              />
              <InlineStat
                label="Partidas na série"
                value={profile.data?.performanceTrend.length ?? "Indisponível"}
                muted={!profile.data}
              />
              <InlineStat
                label="Pontos com comparação"
                value={journey.data ? comparable.length : "Indisponível"}
                muted={!journey.data || comparable.length === 0}
              />
            </InlineStats>
          )
        }
      />

      <PageSection>
        <SectionHeader
          eyebrow="Visão temporal principal"
          title="Evolução partida a partida"
          description="Cada ponto é uma partida real do histórico pessoal, na ordem observada. A linha não interpola partidas ausentes nem suaviza os valores."
        />
        {(profile.status === "loading" || profile.status === "idle") && (
          <Card>
            <Loading block label="Carregando histórico temporal" />
          </Card>
        )}
        {profile.status === "error" && (
          <Card>
            <ErrorState
              inline
              title="Histórico temporal indisponível"
              description={profile.error ?? "A série pessoal não pôde ser consultada."}
            />
          </Card>
        )}
        {profile.data && !hasTemporalHistory && (
          <Card>
            <EmptyState
              icon={<ChartNoAxesCombined size={22} />}
              title="Histórico insuficiente para medir evolução"
              description={`${performancePoints.length} ${
                performancePoints.length === 1 ? "partida possui" : "partidas possuem"
              } índice temporal observado. O gráfico aparece a partir de ${MIN_TEMPORAL_POINTS}, sem fabricar pontos intermediários.`}
            />
          </Card>
        )}
        {profile.data && hasTemporalHistory && (
          <Card className="sp-growth__primary-chart">
            <div className="sp-growth__chart-legend" aria-label="Legenda dos pontos do gráfico">
              <span>
                <i
                  className="sp-growth__legend-dot sp-growth__legend-dot--win"
                  aria-hidden="true"
                />
                Vitória
              </span>
              <span>
                <i
                  className="sp-growth__legend-dot sp-growth__legend-dot--loss"
                  aria-hidden="true"
                />
                Derrota
              </span>
            </div>
            <TemporalChart
              points={performancePoints}
              label="Índice de desempenho pessoal"
              decimals={0}
              fixedAxisMax={100}
              captionLabel={`${performancePoints.length} partidas observadas`}
              emptyTitle="Histórico insuficiente para medir evolução"
              emptyDescription="Nenhum índice pessoal foi observado."
            />
            <p className="sp-growth__source-note">
              Fonte: série <code>performanceTrend</code> do perfil analítico. O índice já existia no
              histórico; esta tela não o recalcula.
            </p>
          </Card>
        )}
      </PageSection>

      {profile.data && hasTemporalHistory && (
        <PageSection>
          <SectionHeader
            eyebrow="Indicadores observados"
            title="Como os sinais variaram"
            description="Séries auxiliares com os mesmos jogos do histórico. O primeiro e o último valor são fatos distintos, não um veredito estatístico."
          />
          <div className="sp-growth__indicators">
            {temporalIndicators.map((definition) => {
              const points = temporalPoints(profile.data!.performanceTrend, definition.value);
              return points.length >= MIN_TEMPORAL_POINTS ? (
                <TemporalIndicator key={definition.key} definition={definition} points={points} />
              ) : (
                <Card
                  key={definition.key}
                  className="sp-growth__indicator sp-growth__indicator--empty"
                >
                  <strong>{definition.label}</strong>
                  <span>Histórico insuficiente neste sinal</span>
                  <small>
                    {points.length} de {MIN_TEMPORAL_POINTS} observações necessárias para desenhar a
                    série.
                  </small>
                </Card>
              );
            })}
          </div>
        </PageSection>
      )}

      {(journey.status === "loading" || journey.status === "idle") && (
        <Card>
          <Loading block label="Carregando pontos acompanhados" />
        </Card>
      )}
      {journey.status === "error" && (
        <Card>
          <ErrorState
            inline
            title="Pontos acompanhados indisponíveis"
            description={journey.error ?? undefined}
          />
        </Card>
      )}

      {journey.data && trends.length === 0 && (
        <Card>
          <EmptyState
            icon={<Target size={22} />}
            title="Ainda sem pontos acompanhados"
            description="Analise partidas no Pós-game: cada relatório alimenta esta tela com os pontos fracos que se repetem."
          />
        </Card>
      )}

      {focus && (
        <Card tone="feature">
          <SectionHeader
            eyebrow={
              <>
                <Target size={12} /> Foco sugerido
              </>
            }
            title={focus.label}
            description={`Aparece em ${focus.recentRate}% das partidas recentes analisadas — é o ponto que mais se repete hoje.`}
            actions={<Badge tone="neutral">confiança {confidenceLabels[focus.confidence]}</Badge>}
          />
        </Card>
      )}

      {worsening.length > 0 && (
        <TrendGroup
          title="Piorando"
          description="Apareceram mais nas partidas recentes do que no período anterior."
          trends={worsening}
        />
      )}
      {improving.length > 0 && (
        <TrendGroup
          title="Melhorando"
          description="Apareceram menos nas partidas recentes do que no período anterior."
          trends={improving}
        />
      )}
      {steady.length > 0 && (
        <TrendGroup
          title="Sem mudança relevante"
          description="A taxa mudou pouco entre os dois períodos."
          trends={steady}
        />
      )}

      {pending.length > 0 && (
        <Card>
          <SectionHeader
            eyebrow={
              <>
                <Clock size={12} /> Ainda sem comparação
              </>
            }
            title="Acompanhando, mas sem histórico suficiente"
            description="O Sparta precisa de um segundo bloco de partidas mais antigas pra dizer se melhorou ou piorou. Até lá, mostra só a taxa recente."
          />
          <div className="sp-growth__rates">
            {pending.map((trend) => (
              <StatBar
                key={trend.code}
                label={trend.label}
                value={trend.recentRate}
                invert
                value_label={`${trend.recentRate}% das partidas recentes`}
              />
            ))}
          </div>
        </Card>
      )}
    </PageLayout>
  );
}

function TemporalIndicator({
  definition,
  points
}: {
  definition: TemporalIndicatorDefinition;
  points: TemporalChartPoint[];
}) {
  const ordered = [...points].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt)
  );
  const first = ordered[0]!;
  const last = ordered.at(-1)!;
  return (
    <Card className="sp-growth__indicator">
      <div className="sp-growth__indicator-heading">
        <Activity size={16} aria-hidden="true" />
        <strong>{definition.label}</strong>
      </div>
      <TemporalSparkline points={ordered} />
      <dl>
        <div>
          <dt>Primeira</dt>
          <dd>{formatObservedValue(first.value, definition.unit, definition.decimals)}</dd>
        </div>
        <div>
          <dt>Mais recente</dt>
          <dd>{formatObservedValue(last.value, definition.unit, definition.decimals)}</dd>
        </div>
        <div>
          <dt>Amostra</dt>
          <dd>{ordered.length} partidas</dd>
        </div>
      </dl>
    </Card>
  );
}

function TrendGroup({
  title,
  description,
  trends
}: {
  title: string;
  description: string;
  trends: WeaknessTrend[];
}) {
  return (
    <Card>
      <SectionHeader eyebrow="Comparação entre blocos" title={title} description={description} />
      <div className="sp-growth__trend-list">
        {trends.map((trend) => (
          <article className="sp-growth__trend" key={trend.code}>
            <div className="sp-growth__trend-heading">
              <strong>{trend.label}</strong>
              <div className="sp-growth__trend-signals">
                <TrendChip trend={trend.trend} />
                <Badge tone="neutral">confiança {confidenceLabels[trend.confidence]}</Badge>
              </div>
            </div>
            <div className="sp-growth__rates">
              {/* `invert`: aqui número ALTO é ruim (taxa de presença de um
                  ponto fraco), o oposto das barras de desempenho. */}
              <StatBar
                label="Recente"
                value={trend.recentRate}
                invert
                value_label={`${trend.recentRate}%`}
              />
              <StatBar
                label="Anterior"
                value={trend.previousRate}
                invert
                value_label={`${trend.previousRate}%`}
              />
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function TrendChip({ trend }: { trend: WeaknessTrend["trend"] }) {
  // "resolved" também é boa notícia (o ponto sumiu) e "new" é má notícia
  // (apareceu um ponto que não existia) - mesma cor semântica dos pares.
  const good = trend === "improving" || trend === "resolved";
  const bad = trend === "worsening" || trend === "new";
  const Icon = good ? TrendingUp : bad ? TrendingDown : Minus;
  return (
    <SignalChip pill tone={good ? "positive" : bad ? "negative" : "info"}>
      <span className="sp-growth__trend-chip">
        <Icon size={12} />
        {trendLabels[trend]}
      </span>
    </SignalChip>
  );
}
