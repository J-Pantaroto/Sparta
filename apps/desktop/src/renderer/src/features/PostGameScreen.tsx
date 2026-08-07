import {
  calculateKda,
  compareMatchToRecentHistory,
  roleBaselines,
  type MatchLoadoutObservation,
  type MatchParticipantSummary,
  type MatchPerformanceMetrics,
  type MatchVsRecentHistoryComparison,
  type MatchVsRecentHistoryMetricKey,
  type PostGameAnalysis,
  type RecentChampionMatch,
  type Role
} from "@sparta/core";
import { AlertTriangle, ListChecks, RefreshCw, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { roleLabels, severityLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import {
  analyzePostgame,
  ApiError,
  fetchChampionRoleEvidence,
  fetchDraftComparison,
  fetchMatchParticipants,
  fetchMyPlayerProfile,
  fetchPostgameReport,
  fetchMatchObservation,
  fetchRecentMatches,
  generateDraftComparison,
  type ChampionRoleEvidenceResponse,
  type DraftComparisonResponse,
  type RiotAccountSummary
} from "../services/api-client";
import { fetchAllChampions, type DataDragonChampionSummary } from "../services/datadragon";
import { ThemedPageHero } from "../theme/ThemedPageHero";
import {
  Badge,
  Button,
  Card,
  ChampionAvatar,
  EmptyState,
  ErrorState,
  Loading,
  PageLayout,
  SectionHeader,
  SignalChip,
  SignalChipList,
  StatBar
} from "../ui";
import { MatchHistoryList } from "./MatchHistoryList";
import "./PostGameScreen.css";

interface PostGameScreenProps {
  riotAccounts: RiotAccountSummary[];
  sessionToken: string | null;
  ddragonVersion: string;
  initialMatchId?: string | null;
}

/** Campos que o cabeçalho/relatório precisam - `RecentChampionMatch` e `ProfileRecentMatch` satisfazem os dois. */
interface ReportMatchSummary {
  matchId: string;
  championId: number;
  championName?: string;
  role: Role;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
}

/**
 * Revisão de uma partida. Ao selecionar, tenta primeiro o relatório já
 * persistido (GET) e só cai pro POST de análise em 404 - não reanalisa à
 * toa a cada clique. "Reanalisar" chama o POST direto, pro caso de mais
 * histórico ter sido sincronizado desde a primeira análise.
 */
export function PostGameScreen({
  riotAccounts,
  sessionToken,
  ddragonVersion,
  initialMatchId
}: PostGameScreenProps) {
  const account = riotAccounts[0];
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [report, setReport] = useState<PostGameAnalysis | null>(null);
  const [reportStatus, setReportStatus] = useState<"idle" | "loading" | "error">("idle");
  const [reportError, setReportError] = useState<string | null>(null);
  const [observation, setObservation] = useState<MatchLoadoutObservation | null>(null);
  const [roleEvidence, setRoleEvidence] = useState<ChampionRoleEvidenceResponse | null>(null);
  const [draftComparison, setDraftComparison] = useState<DraftComparisonResponse | null>(null);
  const [draftComparisonLoading, setDraftComparisonLoading] = useState(false);

  const [selectedMatch, setSelectedMatch] = useState<ReportMatchSummary | null>(null);
  const [participants, setParticipants] = useState<MatchParticipantSummary[] | null>(null);
  const [participantsError, setParticipantsError] = useState<string | null>(null);

  // Só pro deep link vindo do Dashboard (initialMatchId) - a lista real de
  // navegação/filtro é o MatchHistoryList abaixo, que busca sob demanda.
  const matches = useAsyncData<{ puuid: string; matches: RecentChampionMatch[] }>(
    () => (account && sessionToken ? fetchRecentMatches(sessionToken, account.puuid, 10) : undefined),
    [account?.puuid, sessionToken]
  );
  const catalog = useAsyncData<DataDragonChampionSummary[]>(
    () => fetchAllChampions(ddragonVersion),
    [ddragonVersion]
  );
  // Tendência pessoal (Etapa 31E), buscada uma vez - a comparação por
  // partida é recalculada localmente (pura, sem nova chamada de rede).
  const profileTrend = useAsyncData(
    () => (sessionToken ? fetchMyPlayerProfile(sessionToken) : undefined),
    [sessionToken]
  );

  async function openMatch(match: ReportMatchSummary) {
    if (!sessionToken) return;
    const matchId = match.matchId;
    setSelectedMatchId(matchId);
    setSelectedMatch(match);
    setObservation(null);
    setRoleEvidence(null);
    setDraftComparison(null);
    setDraftComparisonLoading(true);
    setParticipants(null);
    setParticipantsError(null);
    void fetchMatchObservation(sessionToken, matchId)
      .then(setObservation)
      .catch(() => setObservation(null));
    void fetchMatchParticipants(sessionToken, matchId)
      .then((overview) => setParticipants(overview.participants))
      .catch((error) =>
        setParticipantsError(
          error instanceof Error ? error.message : "Os 10 participantes não puderam ser carregados."
        )
      );
    void fetchChampionRoleEvidence(sessionToken, account.puuid, match.championId, match.role)
      .then(setRoleEvidence)
      .catch(() => setRoleEvidence(null));
    void fetchDraftComparison(sessionToken, matchId)
      .then(async (response) => {
        if (response.state === "NOT_GENERATED" && response.draftSessionId) {
          const generated = await generateDraftComparison(sessionToken, response.draftSessionId);
          setDraftComparison({
            state: !generated.report.coverageDimensions.snapshotAvailable
              ? "SNAPSHOT_MISSING"
              : !generated.report.coverageDimensions.timelineAvailable
                ? "TIMELINE_UNAVAILABLE"
                : generated.report.status === "AVAILABLE"
                  ? "AVAILABLE"
                  : "PARTIAL",
            draftSessionId: response.draftSessionId,
            report: generated.report
          });
          return;
        }
        setDraftComparison(response);
      })
      .catch((error) =>
        setDraftComparison({
          state: "NOT_GENERATED",
          report: null,
          reason:
            error instanceof Error
              ? error.message
              : "A comparação com o draft não pôde ser carregada."
        })
      )
      .finally(() => setDraftComparisonLoading(false));
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
          setReportError(
            analyzeError instanceof Error
              ? analyzeError.message
              : "Não foi possível analisar a partida."
          );
          setReportStatus("error");
        }
      } else {
        setReportError(
          error instanceof Error ? error.message : "Não foi possível carregar o relatório."
        );
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
      setReportError(
        error instanceof Error ? error.message : "Não foi possível reanalisar a partida."
      );
      setReportStatus("error");
    }
  }

  const matchList = matches.data?.matches ?? [];
  useEffect(() => {
    if (!initialMatchId || selectedMatchId || matchList.length === 0) return;
    const match = matchList.find((entry) => entry.matchId === initialMatchId);
    if (match) void openMatch(match);
  }, [initialMatchId, matchList, selectedMatchId]);

  const recentHistoryComparison: MatchVsRecentHistoryComparison | null =
    profileTrend.data && selectedMatchId
      ? compareMatchToRecentHistory(profileTrend.data.performanceTrend, selectedMatchId)
      : null;

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
  if (!sessionToken) {
    return (
      <PageLayout>
        <ThemedPageHero eyebrow="Pós-game" title="Revisão de partidas" />
        <Card>
          <Loading block label="Carregando sessão..." />
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <ThemedPageHero eyebrow="Pós-game" title="Revisão de partidas" />

      <Card>
        <SectionHeader
          title="Histórico de partidas"
          description="Filtre e escolha uma partida - o Sparta compara o que ela entregou com a referência do seu papel."
        />
        <MatchHistoryList
          sessionToken={sessionToken}
          puuid={account.puuid}
          ddragonVersion={ddragonVersion}
          catalog={catalog.data ?? undefined}
          selectedMatchId={selectedMatchId}
          onSelect={(match) => void openMatch(match)}
        />
      </Card>

      {!selectedMatchId ? (
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
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
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
          <DraftComparisonSection response={draftComparison} loading={draftComparisonLoading} />
        </div>
      ) : (
        report &&
        selectedMatch && (
          <MatchReport
            report={report}
            match={selectedMatch}
            champion={catalog.data?.find((candidate) => candidate.id === selectedMatch.championId)}
            ddragonVersion={ddragonVersion}
            observation={observation}
            roleEvidence={roleEvidence}
            draftComparison={draftComparison}
            draftComparisonLoading={draftComparisonLoading}
            participants={participants}
            participantsError={participantsError}
            recentHistoryComparison={recentHistoryComparison}
            onReanalyze={() => void reanalyze()}
          />
        )
      )}
    </PageLayout>
  );
}

function MatchReport({
  report,
  match,
  champion,
  ddragonVersion,
  observation,
  roleEvidence,
  draftComparison,
  draftComparisonLoading,
  participants,
  participantsError,
  recentHistoryComparison,
  onReanalyze
}: {
  report: PostGameAnalysis;
  match: ReportMatchSummary;
  champion?: DataDragonChampionSummary;
  ddragonVersion: string;
  observation: MatchLoadoutObservation | null;
  roleEvidence: ChampionRoleEvidenceResponse | null;
  draftComparison: DraftComparisonResponse | null;
  draftComparisonLoading: boolean;
  participants: MatchParticipantSummary[] | null;
  participantsError: string | null;
  recentHistoryComparison: MatchVsRecentHistoryComparison | null;
  onReanalyze: () => void;
}) {
  const baseline = roleBaselines[match.role];
  const kda = calculateKda(report.metrics.kills, report.metrics.deaths, report.metrics.assists);

  // Razão (valor da partida / referência do papel) com o valor absoluto ao
  // lado - só a razão esconde o número real, que é o que o jogador
  // reconhece da partida.
  const ratios = [
    {
      label: "KDA",
      ratio: kda / baseline.kda,
      absolute: kda.toFixed(2),
      reference: baseline.kda.toString()
    },
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
            marginBottom: "var(--space-4)"
          }}
        >
          <ChampionAvatar
            championId={match.championId}
            slug={champion?.key}
            ddragonVersion={ddragonVersion}
            size="lg"
            alt={champion?.name ?? match.championName ?? `Campeão ${match.championId}`}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                marginBottom: "var(--space-2)",
                flexWrap: "wrap"
              }}
            >
              <Badge tone={match.won ? "positive" : "negative"}>
                {match.won ? "Vitória" : "Derrota"}
              </Badge>
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
          <span className="sp-report__pair-label">Referência geral calculada no pós-game</span>
          <span className="sp-report__pair-text">{report.expectedPlan}</span>
        </div>
        <div className="sp-report__pair">
          <span className="sp-report__pair-label">Resumo observado da execução</span>
          <span className="sp-report__pair-text">{report.executionSummary}</span>
        </div>
        <ObjectiveParticipationLine metrics={report.metrics} />
      </Card>

      <MatchTimelineCard metrics={report.metrics} />

      {recentHistoryComparison && <RecentHistoryComparisonCard comparison={recentHistoryComparison} />}

      <MatchParticipantsCard
        participants={participants}
        participantsError={participantsError}
        ddragonVersion={ddragonVersion}
      />

      {observation && <MatchObservationCard observation={observation} />}

      {roleEvidence && <ChampionRoleEvidenceCard evidence={roleEvidence} />}

      <DraftComparisonSection response={draftComparison} loading={draftComparisonLoading} />

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
          <SectionHeader
            title="Para a próxima partida"
            description="Ações práticas, na ordem de impacto."
          />
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

const RECENT_HISTORY_METRIC_LABELS: Record<MatchVsRecentHistoryMetricKey, string> = {
  performanceIndex: "Índice de desempenho",
  kda: "KDA",
  csPerMinute: "CS/min",
  visionScorePerMinute: "Visão/min",
  objectiveParticipation: "Participação em objetivos"
};

function formatRecentHistoryValue(metric: MatchVsRecentHistoryMetricKey, value: number | null): string {
  if (value === null) return "Indisponível";
  if (metric === "objectiveParticipation") return `${Math.round(value * 100)}%`;
  if (metric === "kda") return value.toFixed(2);
  if (metric === "performanceIndex") return value.toFixed(1);
  return value.toFixed(1);
}

/**
 * "Nesta partida" vs "sua média recente" (Etapa 31H, §13) - mix de
 * valores/cards em vez de barras empilhadas repetidas; a comparação em si
 * (`compareMatchToRecentHistory`) já garante que a média nunca inclui a
 * própria partida nem partidas futuras.
 */
export function RecentHistoryComparisonCard({
  comparison
}: {
  comparison: MatchVsRecentHistoryComparison;
}) {
  if (comparison.status === "UNAVAILABLE") {
    return (
      <Card>
        <SectionHeader
          title="Comparado com sua média recente"
          description={comparison.unavailableReason}
        />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Comparado com sua média recente"
        description={`Média das ${comparison.priorSampleSize} partida(s) anteriores a esta - nunca inclui esta partida nem partidas futuras.`}
      />
      <div className="sp-history-compare">
        {comparison.metrics.map((metric) => (
          <div className="sp-history-compare__item" key={metric.metric}>
            <span className="sp-history-compare__label">
              {RECENT_HISTORY_METRIC_LABELS[metric.metric]}
            </span>
            {metric.status === "UNAVAILABLE" ? (
              <span className="sp-history-compare__unavailable">{metric.unavailableReason}</span>
            ) : (
              <>
                <strong className="sp-history-compare__value">
                  {formatRecentHistoryValue(metric.metric, metric.matchValue)}
                </strong>
                <span className="sp-history-compare__reference">
                  média recente {formatRecentHistoryValue(metric.metric, metric.recentAverage)} ·{" "}
                  {metric.sampleSize} partida(s)
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Timeline factual mínima (Etapa 31H, §7): só o que está persistido
 * (`MatchTimelineSummary`, via `report.metrics`), sem narrativa causal. Nunca
 * afirma que um evento "causou" outro - dois fatos com timestamp, lado a
 * lado, é tudo que o dado sustenta.
 */
export function MatchTimelineCard({ metrics }: { metrics: MatchPerformanceMetrics }) {
  const hasDeaths = metrics.deathsBefore10 !== undefined || metrics.deathsBefore15 !== undefined;
  const hasGold = metrics.goldDiffAt15 !== undefined;
  const events = metrics.objectiveEvents ?? [];
  if (!hasDeaths && !hasGold && events.length === 0) return null;

  return (
    <Card>
      <SectionHeader
        title="Linha do tempo registrada"
        description="Só os fatos preservados pela partida, sem leitura de causa e efeito."
      />
      <div className="sp-timeline">
        {metrics.deathsBefore10 !== undefined && (
          <div className="sp-timeline__fact">
            <span className="sp-timeline__mark">0–10min</span>
            <span>
              {metrics.deathsBefore10} morte(s) registrada(s) antes dos 10 minutos.
            </span>
          </div>
        )}
        {metrics.deathsBefore15 !== undefined && (
          <div className="sp-timeline__fact">
            <span className="sp-timeline__mark">0–15min</span>
            <span>
              {metrics.deathsBefore15} morte(s) registrada(s) antes dos 15 minutos.
            </span>
          </div>
        )}
        {metrics.goldDiffAt15 !== undefined && (
          <div className="sp-timeline__fact">
            <span className="sp-timeline__mark">15min</span>
            <span>
              Diferença de ouro contra o laner oposto: {metrics.goldDiffAt15 >= 0 ? "+" : ""}
              {Math.round(metrics.goldDiffAt15)}.
            </span>
          </div>
        )}
        {events.map((event) => {
          const [label, timestamp] = event.split("@");
          return (
            <div className="sp-timeline__fact" key={event}>
              <span className="sp-timeline__mark">{timestamp ?? "—"}</span>
              <span>{label} registrado.</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Os 10 participantes lado a lado (Etapa 31H, §6) - só campos que o
 * Match-V5 normalizado guarda; "nível" não existe em `MatchParticipantSummary`
 * de propósito (a Riot não persiste isso em nenhuma tabela do Sparta).
 */
export function MatchParticipantsCard({
  participants,
  participantsError,
  ddragonVersion
}: {
  participants: MatchParticipantSummary[] | null;
  participantsError: string | null;
  ddragonVersion: string;
}) {
  if (participantsError) {
    return (
      <Card>
        <SectionHeader
          eyebrow={
            <>
              <Users size={12} /> Os dois times
            </>
          }
          title="Participantes indisponíveis"
          description={participantsError}
        />
      </Card>
    );
  }
  if (!participants) {
    return (
      <Card>
        <Loading block label="Carregando os dois times..." />
      </Card>
    );
  }

  const teamIds = Array.from(new Set(participants.map((p) => p.teamId).filter((id): id is number => id !== undefined))).sort(
    (a, b) => a - b
  );
  const untracked = participants.filter((p) => p.teamId === undefined);

  return (
    <Card>
      <SectionHeader
        eyebrow={
          <>
            <Users size={12} /> Os dois times
          </>
        }
        title="Participantes da partida"
        description="Dados normalizados do Match-V5, sem julgamento sobre outros jogadores."
      />
      <div className="sp-participants">
        {teamIds.map((teamId) => (
          <div className="sp-participants__team" key={teamId}>
            {participants
              .filter((participant) => participant.teamId === teamId)
              .map((participant) => (
                <ParticipantRow
                  key={participant.puuid}
                  participant={participant}
                  ddragonVersion={ddragonVersion}
                />
              ))}
          </div>
        ))}
        {untracked.length > 0 && (
          <div className="sp-participants__team">
            {untracked.map((participant) => (
              <ParticipantRow
                key={participant.puuid}
                participant={participant}
                ddragonVersion={ddragonVersion}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function ParticipantRow({
  participant,
  ddragonVersion
}: {
  participant: MatchParticipantSummary;
  ddragonVersion: string;
}) {
  return (
    <div
      className={`sp-participant${participant.isTrackedPlayer ? " sp-participant--tracked" : ""}`}
    >
      <ChampionAvatar
        championId={participant.championId}
        ddragonVersion={ddragonVersion}
        size="sm"
        alt={participant.championName}
        ring={participant.isTrackedPlayer}
      />
      <span className="sp-participant__name">
        {participant.championName}
        {participant.role && <small> · {roleLabels[participant.role]}</small>}
      </span>
      <span className="sp-participant__kda">
        {participant.kills}/{participant.deaths}/{participant.assists}
      </span>
    </div>
  );
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function DraftComparisonSection({
  response,
  loading = false
}: {
  response: DraftComparisonResponse | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <Loading block label="Comparando draft e partida..." />
      </Card>
    );
  }

  const report = response?.report;
  if (!report) {
    return (
      <Card>
        <SectionHeader
          title="Draft versus partida"
          description={
            response?.reason ??
            "Nenhuma comparação com um draft persistido está disponível para esta partida."
          }
        />
        <p className="sp-observation__muted">
          O resumo observado da partida permanece disponível sem inventar contexto de draft.
        </p>
      </Card>
    );
  }

  const choice = report.selectedChoice;
  const observed = report.observedMatch;
  return (
    <Card>
      <SectionHeader
        eyebrow="Comparação histórica"
        title="Draft versus partida"
        description={`Cobertura das comparações possíveis: ${percent(report.coverage)}. Cobertura não é confiança, qualidade da partida ou chance de vitória.`}
        actions={
          <Badge tone={report.status === "AVAILABLE" ? "positive" : "neutral"}>
            {report.status === "AVAILABLE" ? "disponível" : "parcial"}
          </Badge>
        }
      />

      <div className="sp-draft-comparison__phase sp-draft-comparison__phase--before">
        <h4 className="sp-draft-comparison__phase-label">Antes da partida</h4>
        <div className="sp-draft-comparison__grid">
          <div className="sp-report__pair">
            <span className="sp-report__pair-label">Escolha registrada</span>
            <span className="sp-report__pair-text">
              {choice.championName}
              {choice.rank !== undefined
                ? ` · ${choice.rank}º lugar · ${choice.group === "PRIMARY" ? "principal" : "alternativa"}`
                : report.coverageDimensions.snapshotAvailable
                  ? " · fora do snapshot registrado"
                  : " · snapshot histórico ausente"}
            </span>
            {choice.coverage !== undefined && (
              <span className="sp-observation__muted">
                Cobertura da análise no draft: {percent(choice.coverage)}
                {choice.score !== undefined ? ` · score registrado ${choice.score.toFixed(1)}` : ""}
              </span>
            )}
          </div>

          <div className="sp-report__pair">
            <span className="sp-report__pair-label">O que era conhecido no draft</span>
            <span className="sp-report__pair-text">
              {choice.executionRisk?.explanation ??
                choice.personalExperience?.explanation ??
                "Nenhum sinal pessoal adicional estava disponível no snapshot."}
            </span>
            {choice.strategicSignals.slice(0, 3).map((signal) => (
              <span className="sp-observation__muted" key={signal}>
                {signal}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="sp-draft-comparison__phase sp-draft-comparison__phase--after">
        <h4 className="sp-draft-comparison__phase-label">Observado na partida</h4>
        <div className="sp-report__pair">
          <span className="sp-report__pair-label">O que foi observado na partida</span>
          <span className="sp-report__pair-text">
            {observed.won ? "Vitória" : "Derrota"} · {observed.kills}/{observed.deaths}/
            {observed.assists} · KDA {observed.kda.toFixed(2)}
          </span>
          <span className="sp-observation__muted">
            Posição {observed.observedRole ? roleLabels[observed.observedRole] : "indisponível"}
            {observed.deathsBefore10 !== undefined
              ? ` · ${observed.deathsBefore10} morte(s) antes dos 10 min`
              : " · timeline indisponível"}
            {observed.objectiveParticipation !== undefined
              ? ` · ${Math.round(observed.objectiveParticipation * 100)}% de participação nos objetivos considerados`
              : " · objetivos indisponíveis"}
          </span>
        </div>
      </div>

      {report.comparableSignals.length > 0 && (
        <div className="sp-report__pair">
          <span className="sp-report__pair-label">Correspondências verificáveis</span>
          <SignalChipList stacked>
            {report.comparableSignals.map((signal) => (
              <SignalChip key={signal.id} tone="info">
                {signal.statement}
              </SignalChip>
            ))}
          </SignalChipList>
        </div>
      )}

      {report.unavailableSignals.length > 0 && (
        <div className="sp-report__pair">
          <span className="sp-report__pair-label">Dados indisponíveis e limitações</span>
          {report.unavailableSignals.map((signal) => (
            <span className="sp-observation__muted" key={signal.id}>
              {signal.unavailableReason}
            </span>
          ))}
        </div>
      )}

      <p className="sp-draft-comparison__notice">
        Correspondência não significa causalidade, e o resultado isolado não valida ou invalida a
        recomendação.
      </p>
    </Card>
  );
}

export function ChampionRoleEvidenceCard({ evidence }: { evidence: ChampionRoleEvidenceResponse }) {
  const personal = evidence.personalRoleEvidence;
  const lastPlayedAt = personal.lastPlayedAt
    ? new Date(personal.lastPlayedAt).toLocaleDateString("pt-BR")
    : null;

  return (
    <Card>
      <SectionHeader
        title="Experiência observada"
        description={
          personal.status === "UNAVAILABLE"
            ? personal.unavailableReason
            : `${personal.games} ${
                personal.games === 1 ? "partida observada" : "partidas observadas"
              } como ${roleLabels[personal.role]} · ${personal.wins}V/${personal.losses}D${
                lastPlayedAt ? ` · última em ${lastPlayedAt}` : ""
              }`
        }
      />
      {personal.status !== "UNAVAILABLE" && (
        <p className="sp-observation__muted">
          Patches {personal.patches.join(", ") || "indisponíveis"} · filas{" "}
          {personal.queueIds.join(", ") || "indisponíveis"} · origem Match-V5 normalizada
        </p>
      )}
      <p className="sp-observation__muted">
        Elegibilidade global: {evidence.globalRoleEligibility.unavailableReason}
      </p>
    </Card>
  );
}

function observedId(name: string | undefined, id: number | undefined) {
  return name ?? (id === undefined ? "Indisponível" : `ID ${id}`);
}

function MatchObservationCard({ observation }: { observation: MatchLoadoutObservation }) {
  const role = observation.position.normalizedRole;
  const source =
    observation.position.normalizedRoleSource === "TEAM_POSITION"
      ? "teamPosition"
      : observation.position.normalizedRoleSource === "INDIVIDUAL_POSITION"
        ? "individualPosition"
        : undefined;
  const primary = observation.runes.selections.filter((rune) => rune.tree === "PRIMARY");
  const secondary = observation.runes.selections.filter((rune) => rune.tree === "SECONDARY");

  return (
    <Card>
      <SectionHeader
        title="Dados observados da partida"
        description={`Patch ${observation.context.patch ?? "indisponível"} · fila ${
          observation.context.queueId ?? "indisponível"
        }`}
      />
      <div className="sp-observation">
        <div>
          <strong>Itens utilizados</strong>
          <div className="sp-observation__values">
            {observation.items.map((item) => (
              <Badge key={item.slot} tone="neutral">
                {item.state === "EMPTY"
                  ? `Slot ${item.slot + 1}: vazio`
                  : item.state === "UNAVAILABLE"
                    ? `Slot ${item.slot + 1}: indisponível`
                    : `Slot ${item.slot + 1}: ${observedId(item.enrichment.name, item.itemId)}`}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <strong>Runas utilizadas</strong>
          {observation.runes.status === "UNAVAILABLE" ? (
            <p className="sp-observation__muted">Runas indisponíveis no payload.</p>
          ) : (
            <>
              <p className="sp-observation__muted">
                Primária{" "}
                {observation.runes.primaryStyleId
                  ? `ID ${observation.runes.primaryStyleId}`
                  : "indisponível"}
                :{" "}
                {primary.map((rune) => observedId(rune.enrichment.name, rune.perkId)).join(" · ") ||
                  "seleções indisponíveis"}
              </p>
              <p className="sp-observation__muted">
                Secundária{" "}
                {observation.runes.secondaryStyleId
                  ? `ID ${observation.runes.secondaryStyleId}`
                  : "indisponível"}
                :{" "}
                {secondary
                  .map((rune) => observedId(rune.enrichment.name, rune.perkId))
                  .join(" · ") || "seleções indisponíveis"}
              </p>
              <p className="sp-observation__muted">
                Fragmentos:{" "}
                {observation.runes.fragments
                  .map(
                    (fragment) =>
                      `${fragment.slot.toLowerCase()} ${observedId(fragment.enrichment.name, fragment.fragmentId)}`
                  )
                  .join(" · ")}
              </p>
            </>
          )}
        </div>
        <div>
          <strong>Feitiços utilizados</strong>
          <div className="sp-observation__values">
            {observation.summonerSpells.map((spell) => (
              <Badge key={spell.slot} tone="neutral">
                Slot {spell.slot}: {observedId(spell.enrichment.name, spell.spellId)}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <strong>Posição observada</strong>
          <p className="sp-observation__muted">
            {role ? roleLabels[role] : "Indisponível"}
            {source ? ` · fonte ${source}` : ""}
            {observation.position.positionAssignedByMatchmaking
              ? ` · matchmaking ${observation.position.positionAssignedByMatchmaking}`
              : ""}
            {observation.position.diverged ? " · campos divergentes preservados" : ""}
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Linha factual de participação em objetivos: números absolutos e a razão,
 * sem nenhuma leitura estratégica. "Você ignorou objetivos" exigiria saber
 * posição, momento e condição de vitória - nada disso está aqui.
 *
 * Time sem dragão nem barão não vira `0%`: a razão não existe, e é isso que
 * a linha diz.
 */
function ObjectiveParticipationLine({ metrics }: { metrics: MatchPerformanceMetrics }) {
  const takedowns = metrics.objectiveTakedowns;
  const teamKills = metrics.teamObjectiveKills;
  if (takedowns === undefined) return null;

  const semDenominador = teamKills === undefined || teamKills === 0;
  const texto = semDenominador
    ? "O time não conquistou dragão nem barão nesta partida - sem base para a razão."
    : `${takedowns} de ${teamKills} (${Math.round((takedowns / teamKills) * 100)}%) dos dragões e barões do seu time.`;

  return (
    <div className="sp-report__pair">
      <span className="sp-report__pair-label">Participação em objetivos</span>
      <span className="sp-report__pair-text">{texto}</span>
    </div>
  );
}
