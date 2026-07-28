import { useState } from "react";
import { History } from "lucide-react";
import { roleLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import {
  fetchDraftSessionDetail,
  fetchDraftSessions,
  type DraftSessionDetail,
  type DraftSessionSummary
} from "../services/api-client";
import {
  Card,
  EmptyState,
  InteractiveCard,
  Loading,
  PageHero,
  PageLayout,
  SectionHeader,
  SignalChip,
  SignalChipList
} from "../ui";

/**
 * Histórico de drafts persistidos (Etapa 16).
 *
 * Interface **mínima e factual**: mostra o que foi gravado e nada mais. Não
 * existe aqui nenhuma avaliação de acerto ou erro da recomendação - essa
 * comparação não foi implementada, e sugeri-la visualmente seria inventar
 * conclusão.
 */
export function DraftHistoryScreen({
  sessionToken,
  onOpenMatch
}: {
  sessionToken: string | null;
  onOpenMatch?: (matchId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <PageLayout>
      <PageHero
        eyebrow="Histórico"
        title="Drafts registrados"
        subtitle="O que o Sparta recomendou em cada champion select, como estava o draft e qual campeão foi escolhido."
      />

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

      {sessions.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {sessions.map((session) => (
            <InteractiveCard
              key={session.id}
              onClick={() => setSelectedId(session.id === selectedId ? null : session.id)}
              selected={session.id === selectedId}
              ariaCurrent={session.id === selectedId}
            >
              <SectionHeader
                title={`${roleLabels[session.role]} · ${new Date(session.startedAt).toLocaleString("pt-BR")}`}
                description={describeKnownDraft(session)}
                actions={
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
                }
              />
              {session.id === selectedId && (
                <SessionDetail state={detail} onOpenMatch={onOpenMatch} />
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

function SessionDetail({
  state,
  onOpenMatch
}: {
  state: { data: DraftSessionDetail | null; status: string; error: string | null };
  onOpenMatch?: (matchId: string) => void;
}) {
  if (state.status === "loading") return <Loading label="Carregando sessão..." />;
  if (state.status === "error" || !state.data) {
    return (
      <EmptyState inline title="Detalhe indisponível" description={state.error ?? undefined} />
    );
  }

  const { latestSnapshot, selectedChampion, matchLink } = state.data;

  return (
    <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
      <div>
        <SectionHeader
          title="Recomendações registradas"
          description={
            latestSnapshot
              ? `Snapshot de ${new Date(latestSnapshot.createdAt).toLocaleString("pt-BR")}.`
              : "Nenhum snapshot foi gravado para esta sessão."
          }
        />
        {latestSnapshot ? (
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            {latestSnapshot.recommendations.map((recommendation) => {
              const escolhido = selectedChampion?.championId === recommendation.championId;
              return (
                <div
                  key={recommendation.championId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                    color: escolhido ? "var(--text-primary)" : "var(--text-secondary)",
                    fontSize: "var(--text-sm)"
                  }}
                >
                  <span>
                    {recommendation.rank}º · {recommendation.championName}
                    {recommendation.group === "ALTERNATIVE" ? " (alternativa)" : ""}
                  </span>
                  <span>
                    {recommendation.totalScore}
                    {escolhido ? " · escolhido" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState inline title="Sem recomendações gravadas" />
        )}
      </div>

      <SignalChipList stacked>
        <SignalChip tone="info">{describeSelection(selectedChampion)}</SignalChip>
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
        {latestSnapshot && (
          <SignalChip tone="info">
            Versões usadas:{" "}
            {Object.entries(latestSnapshot.algorithmVersions)
              .map(([nome, versao]) => `${nome} ${versao}`)
              .join(" · ")}
          </SignalChip>
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
