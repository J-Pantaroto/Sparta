import type { GrowthJourney, WeaknessTrend } from "@sparta/core";
import { Clock, Minus, Target, TrendingDown, TrendingUp, UserPlus } from "lucide-react";
import { confidenceLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchGrowthJourney, type RiotAccountSummary } from "../services/api-client";
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
  SectionHeader,
  SignalChip,
  StatBar
} from "../ui";

const trendLabels: Record<WeaknessTrend["trend"], string> = {
  improving: "Melhorando",
  worsening: "Piorando",
  stable: "Sem mudança",
  new: "Novo",
  resolved: "Resolvido"
};

/**
 * Progressão dos pontos fracos identificados no Pós-game. Tudo aqui deriva
 * de relatórios já persistidos - a tela não calcula nada por conta própria.
 *
 * As linhas são agrupadas por direção (melhorando / piorando / ainda sem
 * comparação) em vez de virem numa lista única: "estável" repetido em toda
 * linha não dizia nada ao jogador (feedback real), e quando ainda não
 * existe um segundo bloco de partidas antigas o valor nem significa
 * "estável" - significa "ainda não dá pra saber".
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
    () =>
      account && sessionToken ? fetchGrowthJourney(sessionToken, account.puuid) : undefined,
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
  const improving = comparable.filter((trend) => trend.trend === "improving" || trend.trend === "resolved");
  const worsening = comparable.filter((trend) => trend.trend === "worsening" || trend.trend === "new");
  const steady = comparable.filter((trend) => trend.trend === "stable");
  const pending = trends.filter((trend) => !trend.hasComparison);

  // "Foco sugerido" não é um cálculo novo: é o ponto fraco que mais aparece
  // nas partidas recentes, que é exatamente o que `recentRate` mede.
  const focus = [...trends].sort((a, b) => b.recentRate - a.recentRate)[0];

  return (
    <PageLayout>
      <ThemedPageHero
        eyebrow="Evolução"
        title="Jornada de progresso"
        meta={
          journey.data && (
            <InlineStats>
              <InlineStat label="Partidas analisadas" value={journey.data.matchesAnalyzed} />
              <InlineStat label="Pontos acompanhados" value={trends.length} />
              <InlineStat label="Com comparação" value={comparable.length} muted={comparable.length === 0} />
            </InlineStats>
          )
        }
      />

      {journey.status === "loading" && (
        <Card>
          <Loading block />
        </Card>
      )}
      {journey.status === "error" && (
        <Card>
          <ErrorState inline description={journey.error ?? undefined} />
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
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            {pending.map((trend) => (
              <div key={trend.code}>
                <StatBar
                  label={trend.label}
                  value={trend.recentRate}
                  invert
                  value_label={`${trend.recentRate}% das partidas recentes`}
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </PageLayout>
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
      <SectionHeader title={title} description={description} />
      <div style={{ display: "grid", gap: "var(--space-5)" }}>
        {trends.map((trend) => (
          <div key={trend.code}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-3)",
                marginBottom: "var(--space-3)"
              }}
            >
              <strong>{trend.label}</strong>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                <TrendChip trend={trend.trend} />
                <Badge tone="neutral">confiança {confidenceLabels[trend.confidence]}</Badge>
              </div>
            </div>
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {/* `invert`: aqui número ALTO é ruim (taxa de presença de um
                  ponto fraco), o oposto das barras de desempenho. */}
              <StatBar label="Recente" value={trend.recentRate} invert value_label={`${trend.recentRate}%`} />
              <StatBar label="Anterior" value={trend.previousRate} invert value_label={`${trend.previousRate}%`} />
            </div>
          </div>
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
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon size={12} />
        {trendLabels[trend]}
      </span>
    </SignalChip>
  );
}
