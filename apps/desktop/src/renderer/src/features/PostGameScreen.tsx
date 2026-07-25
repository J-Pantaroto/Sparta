import { calculateKda, roleBaselines, type PostGameAnalysis, type RecentChampionMatch } from "@sparta/core";
import { AlertTriangle, ListChecks, RefreshCw, UserPlus } from "lucide-react";
import { useState } from "react";
import { roleLabels, severityLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import {
  analyzePostgame,
  ApiError,
  fetchPostgameReport,
  fetchRecentMatches,
  type RiotAccountSummary
} from "../services/api-client";
import { fetchAllChampions, type DataDragonChampionSummary } from "../services/datadragon";
import { ThemedPageHero } from "../theme/ThemedPageHero";
import {
  Badge,
  Button,
  Card,
  ChampionAvatar,
  Columns,
  EmptyState,
  ErrorState,
  InlineStat,
  InlineStats,
  InteractiveCard,
  Loading,
  PageLayout,
  SectionHeader,
  SignalChip,
  SignalChipList,
  SkeletonRows,
  StatBar
} from "../ui";
import "./PostGameScreen.css";

interface PostGameScreenProps {
  riotAccounts: RiotAccountSummary[];
  sessionToken: string | null;
  ddragonVersion: string;
}

/**
 * Revisão de uma partida. Ao selecionar, tenta primeiro o relatório já
 * persistido (GET) e só cai pro POST de análise em 404 - não reanalisa à
 * toa a cada clique. "Reanalisar" chama o POST direto, pro caso de mais
 * histórico ter sido sincronizado desde a primeira análise.
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
  const catalog = useAsyncData<DataDragonChampionSummary[]>(
    () => fetchAllChampions(ddragonVersion),
    [ddragonVersion]
  );

  async function openMatch(matchId: string) {
    if (!sessionToken) return;
    setSelectedMatchId(matchId);
    setReportStatus("loading");
    setReportError(null);
    try {
      setReport(await fetchPostgameReport(sessionToken, matchId));
      setReportStatus("idle");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        try {
          setReport(await analyzePostgame(sessionToken, matchId));
          setReportStatus("idle");
        } catch (analyzeError) {
          setReportError(analyzeError instanceof Error ? analyzeError.message : "Não foi possível analisar a partida.");
          setReportStatus("error");
        }
      } else {
        setReportError(error instanceof Error ? error.message : "Não foi possível carregar o relatório.");
        setReportStatus("error");
      }
    }
  }

  async function reanalyze() {
    if (!sessionToken || !selectedMatchId) return;
    setReportStatus("loading");
    setReportError(null);
    try {
      setReport(await analyzePostgame(sessionToken, selectedMatchId));
      setReportStatus("idle");
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Não foi possível reanalisar a partida.");
      setReportStatus("error");
    }
  }

  if (!account) {
    return (
      <PageLayout>
        <ThemedPageHero eyebrow="Pós-game" title="Revisão de partidas" />
        <Card>
          <EmptyState
            icon={<UserPlus size={22} />}
            title="Nenhuma conta Riot vinculada"
            description="Vincule sua conta pra o Sparta revisar suas partidas."
          />
        </Card>
      </PageLayout>
    );
  }

  const matchList = matches.data?.matches ?? [];
  const selectedMatch = matchList.find((match) => match.matchId === selectedMatchId);
  const wins = matchList.filter((match) => match.won).length;

  return (
    <PageLayout>
      <ThemedPageHero
        eyebrow="Pós-game"
        title="Revisão de partidas"
        meta={
          matchList.length > 0 && (
            <InlineStats>
              <InlineStat label="Partidas listadas" value={matchList.length} />
              <InlineStat label="Resultado" value={`${wins}V — ${matchList.length - wins}D`} />
            </InlineStats>
          )
        }
      />

      {matches.status === "loading" && (
        <Card>
          <SkeletonRows count={5} height={56} />
        </Card>
      )}
      {matches.status === "error" && (
        <Card>
          <ErrorState inline description={matches.error ?? undefined} />
        </Card>
      )}

      {matchList.length > 0 && (
        <Columns
          asideFirst
          asideWidth="300px"
          aside={
            <div className="sp-matchlist">
              {matchList.map((match) => {
                const champion = catalog.data?.find((candidate) => candidate.id === match.championId);
                return (
                  <InteractiveCard
                    key={match.matchId}
                    pad="sm"
                    selected={match.matchId === selectedMatchId}
                    onClick={() => void openMatch(match.matchId)}
                    label={`Analisar partida de ${champion?.name ?? match.championId}`}
                  >
                    <span className={`sp-match__result${match.won ? " sp-match__result--won" : ""}`} />
                    <div className="sp-match">
                      <ChampionAvatar
                        championId={match.championId}
                        slug={champion?.key}
                        ddragonVersion={ddragonVersion}
                        alt={champion?.name ?? `Campeão ${match.championId}`}
                      />
                      <span style={{ minWidth: 0 }}>
                        <strong className="sp-match__name">{champion?.name ?? `Campeão ${match.championId}`}</strong>
                        <span className="sp-match__meta">
                          {match.won ? "Vitória" : "Derrota"} · {roleLabels[match.role]}
                        </span>
                      </span>
                      <span className="sp-match__kda">
                        {match.kills}/{match.deaths}/{match.assists}
                      </span>
                    </div>
                  </InteractiveCard>
                );
              })}
            </div>
          }
          main={
            !selectedMatchId ? (
              <Card>
                <EmptyState
                  icon={<ListChecks size={22} />}
                  title="Escolha uma partida"
                  description="O Sparta compara o que a partida entregou com a referência do seu papel e aponta o que mais custou o resultado."
                />
              </Card>
            ) : reportStatus === "loading" ? (
              <Card>
                <Loading block label="Analisando a partida..." />
              </Card>
            ) : reportStatus === "error" ? (
              <Card>
                <ErrorState
                  inline
                  description={reportError ?? undefined}
                  actions={
                    <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void reanalyze()}>
                      Tentar de novo
                    </Button>
                  }
                />
              </Card>
            ) : (
              report && selectedMatch && (
                <MatchReport
                  report={report}
                  match={selectedMatch}
                  champion={catalog.data?.find((candidate) => candidate.id === selectedMatch.championId)}
                  ddragonVersion={ddragonVersion}
                  onReanalyze={() => void reanalyze()}
                />
              )
            )
          }
        />
      )}

      {matches.status === "success" && matchList.length === 0 && (
        <Card>
          <EmptyState
            title="Nenhuma partida sincronizada"
            description="Rode uma sincronização pra o Sparta trazer suas partidas recentes."
          />
        </Card>
      )}
    </PageLayout>
  );
}

function MatchReport({
  report,
  match,
  champion,
  ddragonVersion,
  onReanalyze
}: {
  report: PostGameAnalysis;
  match: RecentChampionMatch;
  champion?: DataDragonChampionSummary;
  ddragonVersion: string;
  onReanalyze: () => void;
}) {
  const baseline = roleBaselines[match.role];
  const kda = calculateKda(report.metrics.kills, report.metrics.deaths, report.metrics.assists);

  // Razão (valor da partida / referência do papel) com o valor absoluto ao
  // lado - só a razão esconde o número real, que é o que o jogador
  // reconhece da partida.
  const ratios = [
    { label: "KDA", ratio: kda / baseline.kda, absolute: kda.toFixed(2), reference: baseline.kda.toString() },
    {
      label: "CS/min",
      ratio: report.metrics.csPerMinute / baseline.cs,
      absolute: report.metrics.csPerMinute.toFixed(1),
      reference: baseline.cs.toString()
    },
    {
      label: "Dano/min",
      ratio: report.metrics.damagePerMinute / baseline.damage,
      absolute: Math.round(report.metrics.damagePerMinute).toString(),
      reference: baseline.damage.toString()
    },
    {
      label: "Ouro/min",
      ratio: report.metrics.goldPerMinute / baseline.gold,
      absolute: Math.round(report.metrics.goldPerMinute).toString(),
      reference: baseline.gold.toString()
    },
    {
      label: "Visão/min",
      ratio: report.metrics.visionScorePerMinute / baseline.vision,
      absolute: report.metrics.visionScorePerMinute.toFixed(2),
      reference: baseline.vision.toString()
    }
  ];

  // `weaknesses` já vem ordenado por magnitude pelo motor (Fase 4): o
  // primeiro item é o que mais pesou nesta partida.
  const priority = report.weaknesses[0];

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <Card tone="feature">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
          <ChampionAvatar
            championId={match.championId}
            slug={champion?.key}
            ddragonVersion={ddragonVersion}
            size="lg"
            alt={champion?.name ?? `Campeão ${match.championId}`}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)", flexWrap: "wrap" }}>
              <Badge tone={match.won ? "positive" : "negative"}>{match.won ? "Vitória" : "Derrota"}</Badge>
              <Badge tone="neutral" square>
                {roleLabels[match.role]}
              </Badge>
              <Badge tone="neutral">
                {report.metrics.kills}/{report.metrics.deaths}/{report.metrics.assists}
              </Badge>
            </div>
            <p className="sp-report__headline">{report.pickAssessment}</p>
          </div>
        </div>

        <div className="sp-report__pair">
          <span className="sp-report__pair-label">O que era esperado</span>
          <span className="sp-report__pair-text">{report.expectedPlan}</span>
        </div>
        <div className="sp-report__pair">
          <span className="sp-report__pair-label">O que aconteceu</span>
          <span className="sp-report__pair-text">{report.executionSummary}</span>
        </div>
      </Card>

      {priority && (
        <Card>
          <SectionHeader
            eyebrow={
              <>
                <AlertTriangle size={12} /> Prioridade de melhoria
              </>
            }
            title={priority.label}
            actions={<Badge tone="negative">severidade {severityLabels[priority.severity]}</Badge>}
          />
          <p className="sp-report__pair-text">{priority.detail}</p>
        </Card>
      )}

      <Card>
        <SectionHeader
          title="Comparado com a referência do papel"
          description="A barra mostra a razão entre a partida e a referência; o centro é o valor esperado."
        />
        <div className="sp-report__metrics">
          {ratios.map((item) => (
            <div key={item.label}>
              <StatBar
                label={item.label}
                value={item.ratio}
                variant="ratio"
                value_label={`${item.absolute} (${Math.round(item.ratio * 100)}%)`}
              />
              <span style={{ color: "var(--text-muted)", fontSize: "var(--text-2xs)" }}>
                referência {item.reference}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {(report.strengths.length > 0 || report.weaknesses.length > 0) && (
        <Card>
          <SectionHeader title="Sinais da partida" />
          <SignalChipList stacked>
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
          </SignalChipList>
        </Card>
      )}

      {report.tips.length > 0 && (
        <Card>
          <SectionHeader title="Para a próxima partida" description="Ações práticas, na ordem de impacto." />
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            {report.tips.map((tip, index) => (
              <div className="sp-tip" key={tip}>
                <span className="sp-tip__number">{index + 1}</span>
                <span className="sp-tip__text">{tip}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div>
        <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={onReanalyze}>
          Reanalisar com o histórico atual
        </Button>
      </div>
    </div>
  );
}
