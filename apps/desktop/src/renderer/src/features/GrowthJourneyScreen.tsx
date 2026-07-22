import type { GrowthJourney } from "@sparta/core";
import { fetchGrowthJourney, type RiotAccountSummary } from "./api-client";
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

      {journey.status === "loading" && <p>Carregando...</p>}
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
                  <span>{trendLabels[trend.trend] ?? trend.trend}</span>
                  <span>{trend.recentRate}% recente</span>
                  <span>{trend.previousRate}% anterior</span>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
