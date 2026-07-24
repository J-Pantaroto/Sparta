import { useState } from "react";
import { calculateKda, roleBaselines, type PostGameAnalysis, type RecentChampionMatch } from "@sparta/core";
import { analyzePostgame, ApiError, fetchPostgameReport, fetchRecentMatches, type RiotAccountSummary } from "./api-client";
import { ChampionIcon } from "./ChampionIcon";
import { fetchAllChampions, type DataDragonChampionSummary } from "./datadragon";
import { Loading } from "./Loading";
import { SignalChip } from "./SignalChip";
import { StatBar } from "./StatBar";
import { ThemedHeader } from "./ThemedHeader";
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

  const selectedMatch = matches.data?.matches.find((match) => match.matchId === selectedMatchId);
  // Barras "ratio" (valor da partida / baseline do role) - mesmo padrao
  // client-side ja usado pelo motor de build/Pre-game (Fase 8): sem rota
  // nova, so combina PostGameAnalysis.metrics (ja real) com roleBaselines
  // (ja exportado) usando o role da partida (RecentChampionMatch, ja
  // carregado na lista acima, casado por matchId).
  const ratioBars =
    report && selectedMatch
      ? (() => {
          const baseline = roleBaselines[selectedMatch.role];
          const kda = calculateKda(report.metrics.kills, report.metrics.deaths, report.metrics.assists);
          return [
            { label: "KDA", value: kda / baseline.kda },
            { label: "CS/min", value: report.metrics.csPerMinute / baseline.cs },
            { label: "Dano/min", value: report.metrics.damagePerMinute / baseline.damage },
            { label: "Visão/min", value: report.metrics.visionScorePerMinute / baseline.vision },
            { label: "Ouro/min", value: report.metrics.goldPerMinute / baseline.gold }
          ];
        })()
      : [];

  return (
    <>
      <ThemedHeader label="Análise pós-game" title="Partidas recentes" />

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
                  <ChampionIcon championId={champion.id} slug={champion.key} ddragonVersion={ddragonVersion} size="sm" alt={champion.name} />
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
              {ratioBars.length > 0 && (
                <div className="recommendation-bars">
                  {ratioBars.map((bar) => (
                    <StatBar key={bar.label} label={bar.label} value={bar.value} variant="ratio" />
                  ))}
                </div>
              )}
              <div className="signal-chip-list">
                {report.strengths.map((strength) => (
                  <SignalChip key={strength.code} tone="positive">
                    {strength.detail}
                  </SignalChip>
                ))}
                {report.weaknesses.map((weakness) => (
                  <SignalChip key={weakness.code} tone="negative">
                    {weakness.detail}
                  </SignalChip>
                ))}
              </div>
              {report.tips.map((tip) => (
                <p key={tip}>💡 {tip}</p>
              ))}
              <button type="button" className="btn-secondary" onClick={() => void reanalyze()}>
                Reanalisar
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}
