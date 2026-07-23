import type { GrowthJourney, WeaknessTrend } from "@sparta/core";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { fetchGrowthJourney, type RiotAccountSummary } from "./api-client";
import { Loading } from "./Loading";
import { StatBar } from "./StatBar";
import { useAsyncData } from "./use-async-data";

interface GrowthJourneyScreenProps {
  riotAccounts: RiotAccountSummary[];
}

const trendLabels: Record<string, string> = {
  improving: "Melhorando",
  worsening: "Piorando",
  stable: "Estável",
  new: "Novo",
  resolved: "Resolvido"
};

/**
 * Progressao dos pontos fracos identificados no Post-Game Coach ao longo
 * das partidas ja analisadas (Fase 5) - deriva tudo de PostgameReport ja
 * persistido, so mostra o que a API ja calculou.
 */
export function GrowthJourneyScreen({ riotAccounts }: GrowthJourneyScreenProps) {
  const account = riotAccounts[0];
  const journey = useAsyncData<{ puuid: string } & GrowthJourney>(
    () => (account ? fetchGrowthJourney(account.puuid) : undefined),
    [account?.puuid]
  );

  if (!account) {
    return (
      <section className="panel wide">
        <h1>Evolução</h1>
        <p>Vincule sua conta Riot para acompanhar sua evolução.</p>
      </section>
    );
  }

  return (
    <>
      <header className="page-header compact">
        <span>Evolução</span>
        <h1>Progressão dos pontos fracos</h1>
      </header>

      {journey.status === "loading" && <Loading />}
      {journey.status === "error" && <p>{journey.error}</p>}

      {journey.data && (
        <>
          <p>{journey.data.matchesAnalyzed} partida(s) analisada(s) no pós-game.</p>
          {journey.data.weaknessTrends.length === 0 ? (
            <p>Ainda sem pontos fracos suficientes pra mostrar uma tendência - analise mais partidas no Pós-game.</p>
          ) : (
            <section className="table-panel">
              {journey.data.weaknessTrends.map((trend) => (
                <article className="champion-row" key={trend.code}>
                  <strong>{trend.label}</strong>
                  {trend.hasComparison ? (
                    <TrendCell trend={trend.trend} />
                  ) : (
                    <span className="trend-cell" title="Ainda não existe um bloco de partidas antigas suficiente pra comparar - volte depois de analisar mais partidas no Pós-game.">
                      <Minus size={14} />
                      Ainda sem histórico pra comparar
                    </span>
                  )}
                  <div className="champion-row-bars" style={{ gridColumn: "3 / span 2" }}>
                    <StatBar label="Recente" value={trend.recentRate} invert detail={`${trend.recentRate}%`} />
                    {trend.hasComparison && (
                      <StatBar label="Anterior" value={trend.previousRate} invert detail={`${trend.previousRate}%`} />
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}

function TrendCell({ trend }: { trend: WeaknessTrend["trend"] }) {
  // "resolved" tambem e uma boa noticia (o ponto fraco sumiu), "new" e uma
  // ma noticia nova (apareceu um ponto fraco que nao existia) - tratados
  // com a mesma cor semantica de improving/worsening.
  const isGood = trend === "improving" || trend === "resolved";
  const isBad = trend === "worsening" || trend === "new";
  const className = `trend-cell${isGood ? " improving" : isBad ? " worsening" : ""}`;
  const Icon = isGood ? TrendingUp : isBad ? TrendingDown : Minus;

  return (
    <span className={className}>
      <Icon size={14} />
      {trendLabels[trend] ?? trend}
    </span>
  );
}
