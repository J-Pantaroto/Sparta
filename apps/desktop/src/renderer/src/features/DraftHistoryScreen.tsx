import { useMemo, useState } from "react";
import { History } from "lucide-react";
import type { Role } from "@sparta/core";
import { categoryLabels, ROLES, roleLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import {
  fetchDraftSessionDetail,
  fetchDraftSessions,
  type DraftSessionDetail,
  type DraftSessionSummary
} from "../services/api-client";
import { DraftReviewPanel } from "./DraftReviewPanel";
import { ReplayCapabilitySummary } from "./ReplayCapabilitySummary";
import {
  Badge,
  Card,
  ChampionAvatar,
  EmptyState,
  Field,
  HashChip,
  InteractiveCard,
  Loading,
  PageHero,
  PageLayout,
  ScoreBadge,
  SegmentedControl,
  SignalChip,
  SignalChipList
} from "../ui";
import "./DraftHistoryScreen.css";

type RoleFilter = "ALL" | Role;
type PeriodFilter = "ALL" | "7" | "14" | "30";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Histórico do motor: o que o motor utilizou e produziu em cada champion
 * select registrado (Etapa 16, redesenhado na 31I). Interface **factual**:
 * mostra o que foi gravado e nada mais. Não existe aqui nenhuma avaliação de
 * acerto ou erro da recomendação - essa comparação não foi implementada, e
 * sugeri-la visualmente seria inventar conclusão.
 *
 * Os filtros são só client-side sobre a página já carregada (posição/
 * período) - a API não tem esses parâmetros na listagem, e criar uma rota
 * nova só pra isso seria escopo fora desta etapa de experiência visual.
 * configHash/release/replay ficam de propósito fora da LISTA (só no
 * detalhe): mostrar isso por linha exigiria uma consulta extra por sessão
 * visível, e o histórico pode crescer (Etapa 31I, §27).
 */
export function DraftHistoryScreen({
  sessionToken,
  ddragonVersion,
  onOpenMatch
}: {
  sessionToken: string | null;
  ddragonVersion: string;
  onOpenMatch?: (matchId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [role, setRole] = useState<RoleFilter>("ALL");
  const [period, setPeriod] = useState<PeriodFilter>("ALL");

  const history = useAsyncData<{ sessions: DraftSessionSummary[] }>(
    () => (sessionToken ? fetchDraftSessions(sessionToken) : undefined),
    [sessionToken]
  );

  const detail = useAsyncData<DraftSessionDetail>(
    () =>
      sessionToken && selectedId ? fetchDraftSessionDetail(sessionToken, selectedId) : undefined,
    [sessionToken, selectedId]
  );

  const sessions = history.data?.sessions ?? [];
  const filtered = useMemo(() => {
    const cutoff = period === "ALL" ? null : Date.now() - Number(period) * DAY_MS;
    return sessions.filter((session) => {
      if (role !== "ALL" && session.role !== role) return false;
      if (cutoff !== null && new Date(session.startedAt).getTime() < cutoff) return false;
      return true;
    });
  }, [sessions, role, period]);

  return (
    <PageLayout>
      <PageHero
        eyebrow="Histórico do motor"
        title="Drafts registrados"
        subtitle="O que o Sparta recomendou em cada champion select, como estava o draft e qual campeão foi escolhido."
      />

      {sessions.length > 0 && (
        <Card>
          <div className="sp-draft-history__filters">
            <Field label="Posição">
              <SegmentedControl<RoleFilter>
                ariaLabel="Filtrar por posição"
                value={role}
                onChange={setRole}
                options={[
                  { value: "ALL", label: "Todas" },
                  ...ROLES.map((value) => ({ value, label: roleLabels[value] }))
                ]}
              />
            </Field>
            <Field label="Período">
              <SegmentedControl<PeriodFilter>
                ariaLabel="Filtrar por período"
                value={period}
                onChange={setPeriod}
                options={[
                  { value: "ALL", label: "Sempre" },
                  { value: "7", label: "7 dias" },
                  { value: "14", label: "14 dias" },
                  { value: "30", label: "30 dias" }
                ]}
              />
            </Field>
            <span className="sp-draft-history__count">
              {filtered.length} de {sessions.length} sessão(ões)
            </span>
          </div>
        </Card>
      )}

      {history.status === "loading" && (
        <Card>
          <Loading label="Carregando histórico..." />
        </Card>
      )}

      {history.status === "error" && (
        <Card>
          <EmptyState
            title="Histórico não pôde ser carregado"
            description={history.error ?? undefined}
          />
        </Card>
      )}

      {history.status === "success" && sessions.length === 0 && (
        <Card>
          <EmptyState
            icon={<History size={22} />}
            title="Nenhum draft registrado ainda"
            description="Sessões de champion select passam a aparecer aqui assim que o Sparta gerar recomendações para elas."
          />
        </Card>
      )}

      {history.status === "success" && sessions.length > 0 && filtered.length === 0 && (
        <Card>
          <EmptyState
            title="Nenhuma sessão neste recorte"
            description="Nenhum draft registrado corresponde aos filtros escolhidos."
          />
        </Card>
      )}

      {filtered.length > 0 && (
        <div className="sp-draft-history__list">
          {filtered.map((session) => (
            <InteractiveCard
              key={session.id}
              onClick={() => setSelectedId(session.id === selectedId ? null : session.id)}
              selected={session.id === selectedId}
              ariaCurrent={session.id === selectedId}
              label={`Sessão de ${roleLabels[session.role]} em ${new Date(session.startedAt).toLocaleString("pt-BR")}`}
            >
              <div className="sp-draft-history__row">
                {session.selectedChampionId !== null ? (
                  <ChampionAvatar
                    championId={session.selectedChampionId}
                    ddragonVersion={ddragonVersion}
                    alt={`Campeão confirmado nesta sessão`}
                  />
                ) : (
                  <div className="sp-draft-history__avatar-empty" aria-hidden="true" />
                )}
                <div className="sp-draft-history__identity">
                  <strong>
                    {roleLabels[session.role]} · {new Date(session.startedAt).toLocaleString("pt-BR")}
                  </strong>
                  <span>{describeKnownDraft(session)}</span>
                </div>
                <SignalChipList>
                  <SignalChip tone="info" pill>
                    {statusLabels[session.status]}
                  </SignalChip>
                  <SignalChip tone="info" pill>
                    {session.source === "LCU" ? "Lida do League Client" : "Simulação manual"}
                  </SignalChip>
                  <SignalChip tone="info" pill>
                    {matchLinkStatusLabels[session.matchLinkStatus]}
                  </SignalChip>
                </SignalChipList>
              </div>
              {session.id === selectedId && (
                <>
                  <SessionDetail
                    state={detail}
                    ddragonVersion={ddragonVersion}
                    onOpenMatch={onOpenMatch}
                    sessionToken={sessionToken}
                  />
                  {/* Revisão humana (Etapa 24): a ação vive aqui porque é esta
                      a tela com drafts individuais. O Histórico do Motor
                      agregado (Relatórios longitudinais) não tem linha por sessão. */}
                  <div style={{ marginTop: "var(--space-4)" }}>
                    <DraftReviewPanel sessionToken={sessionToken} draftSessionId={session.id} />
                  </div>
                </>
              )}
            </InteractiveCard>
          ))}
        </div>
      )}
    </PageLayout>
  );
}

const statusLabels: Record<DraftSessionSummary["status"], string> = {
  ACTIVE: "Em andamento",
  LOCKED_IN: "Campeão confirmado",
  IN_GAME: "Em partida",
  COMPLETED: "Concluída",
  ABANDONED: "Abandonada"
};

const matchLinkStatusLabels: Record<DraftSessionSummary["matchLinkStatus"], string> = {
  PENDING: "Partida aguardando sincronização",
  LINKED: "Partida vinculada",
  AMBIGUOUS: "Vínculo ambíguo",
  UNLINKABLE: "Evidência insuficiente",
  NOT_APPLICABLE: "Sem partida aplicável"
};

function describeKnownDraft(session: DraftSessionSummary): string {
  const { allies, enemies, bannedChampionIds, unknownAllyPicks, unknownEnemyPicks } =
    session.knownDraft;
  return (
    `${allies.length} aliado(s) e ${enemies.length} inimigo(s) revelados · ` +
    `${unknownAllyPicks + unknownEnemyPicks} pick(s) ainda desconhecido(s) · ` +
    `${bannedChampionIds.length} ban(s) registrado(s)`
  );
}

function ChampionChip({
  championId,
  championName,
  role,
  ddragonVersion
}: {
  championId: number;
  championName: string;
  role?: Role;
  ddragonVersion: string;
}) {
  return (
    <span className="sp-draft-history__champion-chip">
      <ChampionAvatar
        championId={championId}
        ddragonVersion={ddragonVersion}
        size="xs"
        alt={championName}
      />
      {championName}
      {role && <small> · {roleLabels[role]}</small>}
    </span>
  );
}

function SessionDetail({
  state,
  ddragonVersion,
  onOpenMatch,
  sessionToken
}: {
  state: { data: DraftSessionDetail | null; status: string; error: string | null };
  ddragonVersion: string;
  onOpenMatch?: (matchId: string) => void;
  sessionToken: string | null;
}) {
  if (state.status === "loading") return <Loading label="Carregando sessão..." />;
  if (state.status === "error" || !state.data) {
    return (
      <EmptyState inline title="Detalhe indisponível" description={state.error ?? undefined} />
    );
  }

  const { session, latestSnapshot, selectedChampion, matchLink } = state.data;
  const { allies, enemies, bannedChampionIds } = session.knownDraft;

  return (
    <div className="sp-draft-history__detail">
      {/* Contexto congelado (Etapa 31I, §4) */}
      <section className="sp-draft-history__block">
        <h4 className="sp-draft-history__block-label">Contexto congelado</h4>
        <div className="sp-draft-history__context-grid">
          <div>
            <span className="sp-draft-history__context-label">Posição</span>
            <span>{roleLabels[session.role]}</span>
          </div>
          <div>
            <span className="sp-draft-history__context-label">Aliados revelados</span>
            {allies.length > 0 ? (
              <div className="sp-draft-history__chip-row">
                {allies.map((ally) => (
                  <ChampionChip
                    key={ally.championId}
                    championId={ally.championId}
                    championName={ally.championName}
                    role={ally.role}
                    ddragonVersion={ddragonVersion}
                  />
                ))}
              </div>
            ) : (
              <span className="sp-draft-history__muted">Nenhum aliado revelado</span>
            )}
          </div>
          <div>
            <span className="sp-draft-history__context-label">Inimigos revelados</span>
            {enemies.length > 0 ? (
              <div className="sp-draft-history__chip-row">
                {enemies.map((enemy) => (
                  <ChampionChip
                    key={enemy.championId}
                    championId={enemy.championId}
                    championName={enemy.championName}
                    role={enemy.role}
                    ddragonVersion={ddragonVersion}
                  />
                ))}
              </div>
            ) : (
              <span className="sp-draft-history__muted">Nenhum inimigo revelado</span>
            )}
          </div>
          <div>
            <span className="sp-draft-history__context-label">Bans registrados</span>
            <span>{bannedChampionIds.length > 0 ? bannedChampionIds.join(", ") : "Nenhum"}</span>
          </div>
        </div>
      </section>

      {/* Resultado produzido (Etapa 31I, §5) */}
      <section className="sp-draft-history__block">
        <h4 className="sp-draft-history__block-label">Resultado produzido</h4>
        {latestSnapshot ? (
          <ol className="sp-draft-history__ranking">
            {latestSnapshot.recommendations.map((recommendation) => {
              const escolhido = selectedChampion?.championId === recommendation.championId;
              return (
                <li
                  key={recommendation.championId}
                  className={escolhido ? "sp-draft-history__ranking-row--chosen" : undefined}
                >
                  <span className="sp-draft-history__rank-number">{recommendation.rank}</span>
                  <ChampionAvatar
                    championId={recommendation.championId}
                    ddragonVersion={ddragonVersion}
                    size="sm"
                    alt={recommendation.championName}
                    ring={escolhido}
                  />
                  <div className="sp-draft-history__ranking-identity">
                    <strong>{recommendation.championName}</strong>
                    <span>
                      <Badge tone={recommendation.group === "PRIMARY" ? "accent" : "neutral"} square>
                        {recommendation.group === "PRIMARY" ? "Principal" : "Alternativa"}
                      </Badge>{" "}
                      {categoryLabels[recommendation.category as keyof typeof categoryLabels] ??
                        recommendation.category}
                      {escolhido ? " · escolhido" : ""}
                    </span>
                    {recommendation.reasons[0] && (
                      <SignalChip tone="positive">{recommendation.reasons[0].detail}</SignalChip>
                    )}
                  </div>
                  <div className="sp-draft-history__ranking-score">
                    <ScoreBadge score={recommendation.totalScore} size="sm" />
                    <small>cobertura {Math.round(recommendation.dataCoverage * 100)}%</small>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState inline title="Sem recomendações gravadas" />
        )}
        <SignalChipList stacked>
          <SignalChip tone="info">{describeSelection(selectedChampion)}</SignalChip>
        </SignalChipList>
      </section>

      {/* Configuração (Etapa 31I, §4) */}
      {latestSnapshot && (
        <section className="sp-draft-history__block">
          <h4 className="sp-draft-history__block-label">Configuração</h4>
          <div className="sp-draft-history__config-row">
            <span>
              {new Date(latestSnapshot.createdAt).toLocaleString("pt-BR")} ·{" "}
              {latestSnapshot.configurationSource === "RELEASE"
                ? "Release"
                : latestSnapshot.configurationSource === "BUILT_IN_BASELINE"
                  ? "Baseline"
                  : "Origem não registrada (anterior à Etapa 27b)"}
              {latestSnapshot.configurationVersion ? ` ${latestSnapshot.configurationVersion}` : ""}
            </span>
            {latestSnapshot.configHash && <HashChip label="config" value={latestSnapshot.configHash} />}
          </div>
          {latestSnapshot.release && (
            <div className="sp-draft-history__config-row">
              <span>
                {latestSnapshot.release.releaseVersion}
                {latestSnapshot.release.currentlyActive ? (
                  <Badge tone="positive" square>
                    ATIVA
                  </Badge>
                ) : (
                  ` · ${latestSnapshot.release.status}`
                )}
              </span>
              <HashChip label="artifact" value={latestSnapshot.release.artifactHash} />
            </div>
          )}
          <SignalChip tone="info">
            Versões usadas:{" "}
            {Object.entries(latestSnapshot.algorithmVersions)
              .map(([nome, versao]) => `${nome} ${versao}`)
              .join(" · ")}
          </SignalChip>
        </section>
      )}

      {/* Replay (Etapa 31I, §6-7) */}
      {latestSnapshot && sessionToken && (
        <section className="sp-draft-history__block">
          <h4 className="sp-draft-history__block-label">Replay</h4>
          <ReplayCapabilitySummary token={sessionToken} snapshotId={latestSnapshot.id} />
        </section>
      )}

      <SignalChipList stacked>
        <SignalChip tone="info">
          {matchLinkStatusLabels[matchLink.status]}
          {matchLink.matchId ? `: ${matchLink.matchId}` : ""}
        </SignalChip>
        {matchLink.strategy && (
          <SignalChip tone="info">
            Estratégia:{" "}
            {matchLink.strategy === "EXACT_GAME_ID" ? "gameId exato" : "evidências fortes"}
          </SignalChip>
        )}
        {matchLink.reason && <SignalChip tone="info">{matchLink.reason}</SignalChip>}
        {matchLink.status === "AMBIGUOUS" && (
          <SignalChip tone="info">{matchLink.candidateCount} candidatos plausíveis</SignalChip>
        )}
      </SignalChipList>
      {matchLink.status === "LINKED" && matchLink.matchId && onOpenMatch && (
        <button
          type="button"
          className="sp-button sp-button--primary"
          onClick={(event) => {
            event.stopPropagation();
            onOpenMatch(matchLink.matchId as string);
          }}
        >
          Abrir pós-jogo vinculado
        </button>
      )}
    </div>
  );
}

/** Frases factuais. Nada aqui classifica a escolha como certa ou errada. */
function describeSelection(selection: DraftSessionDetail["selectedChampion"]): string {
  if (!selection) return "Nenhum campeão foi confirmado nesta sessão.";
  if (selection.state === "RANKED") {
    return `Recomendado em ${selection.rank}º lugar${selection.group === "ALTERNATIVE" ? " (alternativa)" : ""}.`;
  }
  if (selection.state === "NOT_IN_SNAPSHOT") return "Escolha fora das recomendações registradas.";
  return "A escolha aconteceu antes de existir um snapshot registrado.";
}

/** Rótulo do estado de persistência da sessão atual, pro Champion Select. */
export function persistenceLabel(
  status?: "SAVED" | "UNCHANGED" | "NOT_TRACKED" | "FAILED"
): string | null {
  if (status === "SAVED") return "Sessão salva no histórico";
  if (status === "UNCHANGED") return "Histórico já atualizado";
  if (status === "FAILED") return "Histórico não pôde ser salvo";
  return null;
}
