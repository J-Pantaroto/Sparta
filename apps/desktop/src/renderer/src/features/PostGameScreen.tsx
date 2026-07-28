import {
  calculateKda,
  roleBaselines,
  type MatchLoadoutObservation,
  type MatchPerformanceMetrics,
  type PostGameAnalysis,
  type RecentChampionMatch
} from "@sparta/core";
import { AlertTriangle, ListChecks, RefreshCw, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { roleLabels, severityLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import {
  analyzePostgame,
  ApiError,
  fetchChampionRoleEvidence,
  fetchDraftComparison,
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
  initialMatchId?: string | null;
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

  const matches = useAsyncData<{ puuid: string; matches: RecentChampionMatch[] }>(
    () => (account ? fetchRecentMatches(account.puuid, 10) : undefined),
    [account?.puuid]
  );
  const catalog = useAsyncData<DataDragonChampionSummary[]>(
    () => fetchAllChampions(ddragonVersion),
    [ddragonVersion]
  );

  async function openMatch(match: RecentChampionMatch) {
    if (!sessionToken) return;
    const matchId = match.matchId;
    setSelectedMatchId(matchId);
    setObservation(null);
    setRoleEvidence(null);
    setDraftComparison(null);
    setDraftComparisonLoading(true);
    void fetchMatchObservation(sessionToken, matchId)
      .then(setObservation)
      .catch(() => setObservation(null));
    void fetchChampionRoleEvidence(account.puuid, match.championId, match.role)
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
                const champion = catalog.data?.find(
                  (candidate) => candidate.id === match.championId
                );
                return (
                  <InteractiveCard
                    key={match.matchId}
                    pad="sm"
                    selected={match.matchId === selectedMatchId}
                    onClick={() => void openMatch(match)}
                    label={`Analisar partida de ${champion?.name ?? match.championId}`}
                  >
                    <span
                      className={`sp-match__result${match.won ? " sp-match__result--won" : ""}`}
                    />
                    <div className="sp-match">
                      <ChampionAvatar
                        championId={match.championId}
                        slug={champion?.key}
                        ddragonVersion={ddragonVersion}
                        alt={champion?.name ?? `Campeão ${match.championId}`}
                      />
                      <span style={{ minWidth: 0 }}>
                        <strong className="sp-match__name">
                          {champion?.name ?? `Campeão ${match.championId}`}
                        </strong>
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
              <div style={{ display: "grid", gap: "var(--space-4)" }}>
                <Card>
                  <ErrorState
                    inline
                    description={reportError ?? undefined}
                    actions={
                      <Button
                        variant="secondary"
                        icon={<RefreshCw size={14} />}
                        onClick={() => void reanalyze()}
                      >
                        Tentar de novo
                      </Button>
                    }
                  />
                </Card>
                <DraftComparisonSection
                  response={draftComparison}
                  loading={draftComparisonLoading}
                />
              </div>
            ) : (
              report &&
              selectedMatch && (
                <MatchReport
                  report={report}
                  match={selectedMatch}
                  champion={catalog.data?.find(
                    (candidate) => candidate.id === selectedMatch.championId
                  )}
                  ddragonVersion={ddragonVersion}
                  observation={observation}
                  roleEvidence={roleEvidence}
                  draftComparison={draftComparison}
                  draftComparisonLoading={draftComparisonLoading}
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
  observation,
  roleEvidence,
  draftComparison,
  draftComparisonLoading,
  onReanalyze
}: {
  report: PostGameAnalysis;
  match: RecentChampionMatch;
  champion?: DataDragonChampionSummary;
  ddragonVersion: string;
  observation: MatchLoadoutObservation | null;
  roleEvidence: ChampionRoleEvidenceResponse | null;
  draftComparison: DraftComparisonResponse | null;
  draftComparisonLoading: boolean;
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
            alt={champion?.name ?? `Campeão ${match.championId}`}
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
