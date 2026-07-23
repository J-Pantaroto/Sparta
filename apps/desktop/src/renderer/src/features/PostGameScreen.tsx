import { useState } from "react";
import type { PostGameAnalysis, RecentChampionMatch } from "@sparta/core";
import { analyzePostgame, ApiError, fetchPostgameReport, fetchRecentMatches, type RiotAccountSummary } from "./api-client";
import { championSquareUrl, fetchAllChampions, type DataDragonChampionSummary } from "./datadragon";
import { Loading } from "./Loading";
import { useAsyncData } from "./use-async-data";

interface PostGameScreenProps {
  riotAccounts: RiotAccountSummary[];
  sessionToken: string | null;
  ddragonVersion: string;
}

/**
 * Ao selecionar uma partida, tenta ler o relatorio ja persistido primeiro
 * (GET) e so cai pro POST /postgame/analyze se ainda nao foi analisada
 * (404) - nao reanalisa a toa a cada clique. O botao "Reanalisar" chama o
 * POST direto, pro caso de querer atualizar o relatorio depois de mais sync.
 */
export function PostGameScreen({ riotAccounts, sessionToken, ddragonVersion }: PostGameScreenProps) {
  const account = riotAccounts[0];
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [report, setReport] = useState<PostGameAnalysis | null>(null);
  const [reportStatus, setReportStatus] = useState<"idle" | "loading" | "error">("idle");
  const [reportError, setReportError] = useState<string | null>(null);

  const matches = useAsyncData<{ puuid: string; matches: RecentChampionMatch[] }>(
    () => (account ? fetchRecentMatches(account.puuid, 10) : undefined),
    [account?.puuid]
  );
  // Catalogo de campeoes (Fase 8a, ja buscado pro seletor de time inimigo)
  // reaproveitado aqui pra resolver championId -> nome/icone na lista de
  // partidas - antes mostrava so "Campeao #<id>", gap documentado no
  // CLAUDE.md ("Catalogo de campeoes pro desktop").
  const catalog = useAsyncData<DataDragonChampionSummary[]>(() => fetchAllChampions(ddragonVersion), [ddragonVersion]);

  async function openMatch(matchId: string) {
    if (!sessionToken) return;
    setSelectedMatchId(matchId);
    setReportStatus("loading");
    setReportError(null);
    try {
      const existing = await fetchPostgameReport(sessionToken, matchId);
      setReport(existing);
      setReportStatus("idle");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        try {
          const analysis = await analyzePostgame(sessionToken, matchId);
          setReport(analysis);
          setReportStatus("idle");
        } catch (analyzeError) {
          setReportError(analyzeError instanceof Error ? analyzeError.message : "Nao foi possivel analisar a partida.");
          setReportStatus("error");
        }
      } else {
        setReportError(error instanceof Error ? error.message : "Nao foi possivel carregar o relatorio.");
        setReportStatus("error");
      }
    }
  }

  async function reanalyze() {
    if (!sessionToken || !selectedMatchId) return;
    setReportStatus("loading");
    setReportError(null);
    try {
      const analysis = await analyzePostgame(sessionToken, selectedMatchId);
      setReport(analysis);
      setReportStatus("idle");
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Nao foi possivel reanalisar a partida.");
      setReportStatus("error");
    }
  }

  if (!account) {
    return (
      <section className="panel wide">
        <h1>Análise pós-game</h1>
        <p>Vincule sua conta Riot para analisar suas partidas.</p>
      </section>
    );
  }

  return (
    <>
      <header className="page-header compact">
        <span>Análise pós-game</span>
        <h1>Partidas recentes</h1>
      </header>

      {matches.status === "loading" && <Loading label="Carregando partidas..." />}
      {matches.status === "error" && <p>{matches.error}</p>}

      <section className="table-panel">
        {(matches.data?.matches ?? []).map((match) => {
          const champion = catalog.data?.find((candidate) => candidate.id === match.championId);
          return (
            <article
              className="champion-row"
              key={match.matchId}
              onClick={() => void openMatch(match.matchId)}
              style={{ cursor: "pointer" }}
            >
              <div className="champion-identity">
                {champion && (
                  <img className="champion-icon sm" src={championSquareUrl(champion.key, ddragonVersion)} alt={champion.name} />
                )}
                <strong>{champion?.name ?? `Campeão #${match.championId}`}</strong>
              </div>
              <span>{match.role}</span>
              <span>{match.won ? "Vitória" : "Derrota"}</span>
              <span>
                {match.kills}/{match.deaths}/{match.assists}
              </span>
            </article>
          );
        })}
      </section>

      {selectedMatchId && (
        <section className="panel wide">
          {reportStatus === "loading" && <Loading label="Analisando..." />}
          {reportStatus === "error" && <p>{reportError}</p>}
          {report && reportStatus !== "loading" && (
            <>
              <h2>{report.pickAssessment}</h2>
              <p>
                <strong>Expectativa: </strong>
                {report.expectedPlan}
              </p>
              <p>
                <strong>Execução: </strong>
                {report.executionSummary}
              </p>
              {report.strengths.map((strength) => (
                <p key={strength.code}>✓ {strength.detail}</p>
              ))}
              {report.weaknesses.map((weakness) => (
                <p key={weakness.code}>⚠ {weakness.detail}</p>
              ))}
              {report.tips.map((tip) => (
                <p key={tip}>💡 {tip}</p>
              ))}
              <button type="button" onClick={() => void reanalyze()}>
                Reanalisar
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}
