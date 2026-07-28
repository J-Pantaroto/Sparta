import {
  type DraftState,
  type PickRecommendation,
  type PlayerChampionPoolEntry,
  type PlayerChampionPoolRoleSummary,
  type RecommendationPoolSummary,
  type Role,
  type StrategicChampionReference,
  type StrategicSignal,
  STRATEGIC_CAPABILITY_LABELS
} from "@sparta/core";
import { Check, Crosshair, Pencil, Plus, X } from "lucide-react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  ROLES,
  categoryLabels,
  confidenceLabels,
  metricKeyLabels,
  roleLabels
} from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import {
  addPlayerPoolEntry,
  disablePlayerPoolEntry,
  fetchPlayerPool,
  type RiotAccountSummary
} from "../services/api-client";
import type { DataDragonChampionSummary } from "../services/datadragon";
import { ThemedPageHero } from "../theme/ThemedPageHero";
import {
  Badge,
  Button,
  Card,
  ChampionAvatar,
  ChampionGrid,
  Columns,
  EmptyAvatarSlot,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  InteractiveCard,
  Loading,
  MetricRow,
  NumberField,
  PageLayout,
  ReadOnlyValue,
  ScoreBadge,
  SectionHeader,
  Select,
  SignalChip,
  SignalChipList,
  StatusBadge
} from "../ui";
import { BuildPanel } from "./BuildPanel";
import { PersonalLoadoutHistory } from "./PersonalLoadoutHistory";
import "./ChampionSelectScreen.css";

const MAX_ENEMIES = 5;

interface ChampionSelectScreenProps {
  draft: DraftState;
  // Aceita a forma funcional de propósito: dois cliques rápidos no grid
  // de inimigos caem no mesmo lote de render, e passar um objeto pronto
  // faria o segundo sobrescrever o primeiro (o estado lido viria do
  // fechamento antigo).
  setDraft: Dispatch<SetStateAction<DraftState>>;
  autoPickOrder: number | null;
  autoPlayerRole: Role | null;
  champSelectActive: boolean;
  recommendations: PickRecommendation[];
  alternatives?: PickRecommendation[];
  poolSummary?: RecommendationPoolSummary | null;
  recommendationsStatus: string;
  noAccountLinked: boolean;
  ddragonVersion: string;
  riotAccounts: RiotAccountSummary[];
  sessionToken?: string | null;
  onPoolChanged?: () => void;
  /** O draft veio da sessao do LCU - a edicao manual sai de cena. */
  draftAutoFilled: boolean;
}

/**
 * Workspace de decisão: lista compacta de recomendações à esquerda, detalhe
 * completo da selecionada à direita. A versão anterior empilhava cards
 * completos um embaixo do outro, cada um repetindo score, barras, sinais e
 * botão - com 5 recomendações, comparar duas exigia rolar a tela.
 */
export function ChampionSelectScreen({
  draft,
  setDraft,
  autoPickOrder,
  autoPlayerRole,
  champSelectActive,
  recommendations,
  alternatives = [],
  poolSummary = null,
  recommendationsStatus,
  noAccountLinked,
  ddragonVersion,
  riotAccounts,
  sessionToken = null,
  onPoolChanged,
  draftAutoFilled
}: ChampionSelectScreenProps) {
  const [confirmedChampion, setConfirmedChampion] = useState<{
    championId: number;
    championName: string;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingEnemies, setEditingEnemies] = useState(false);
  const [editingPool, setEditingPool] = useState(false);
  const [poolRevision, setPoolRevision] = useState(0);
  const [poolError, setPoolError] = useState<string | null>(null);
  // Simulação manual: só quando NÃO há sessão real detectada (com sessão a
  // tela abre direto). Existe pra dar pra testar sem o League aberto.
  const [devOverride, setDevOverride] = useState(false);

  const pool = useAsyncData<{
    entries: PlayerChampionPoolEntry[];
    roleSummaries: PlayerChampionPoolRoleSummary[];
  }>(
    () =>
      sessionToken && draft.playerRole
        ? fetchPlayerPool(sessionToken, draft.playerRole)
        : undefined,
    [sessionToken, draft.playerRole, poolRevision]
  );

  // A recomendação #1 muda conforme o draft evolui; sem seleção explícita, o
  // detalhe acompanha o topo da lista em vez de ficar preso num campeão que
  // já não é mais o melhor.
  const allRecommendations = [...recommendations, ...alternatives];
  const selected =
    allRecommendations.find((recommendation) => recommendation.championId === selectedId) ??
    recommendations[0] ??
    alternatives[0];

  useEffect(() => {
    if (selectedId !== null && !allRecommendations.some((item) => item.championId === selectedId)) {
      setSelectedId(null);
    }
  }, [recommendations, alternatives, selectedId]);

  function refreshPool() {
    setPoolRevision((current) => current + 1);
    onPoolChanged?.();
  }

  async function addToPool(champion: DataDragonChampionSummary) {
    if (!sessionToken || !draft.playerRole) return;
    if (pool.data?.entries.some((entry) => entry.championId === champion.id && entry.enabled)) {
      return;
    }
    setPoolError(null);
    try {
      await addPlayerPoolEntry(sessionToken, champion.id, draft.playerRole);
      refreshPool();
    } catch (error) {
      setPoolError(error instanceof Error ? error.message : "Não foi possível atualizar o pool.");
    }
  }

  async function disableFromPool(championId: number) {
    if (!sessionToken || !draft.playerRole) return;
    setPoolError(null);
    try {
      await disablePlayerPoolEntry(sessionToken, championId, draft.playerRole);
      refreshPool();
    } catch (error) {
      setPoolError(error instanceof Error ? error.message : "Não foi possível atualizar o pool.");
    }
  }

  function toggleEnemy(champion: DataDragonChampionSummary) {
    setDraft((current) => {
      const alreadyPicked = current.enemies.some((enemy) => enemy.championId === champion.id);
      if (alreadyPicked) {
        return {
          ...current,
          enemies: current.enemies.filter((enemy) => enemy.championId !== champion.id)
        };
      }
      if (current.enemies.length >= MAX_ENEMIES) return current;
      // `role` é obrigatório no tipo mas não é usado pelo motor de build (só
      // championId importa) - placeholder, mesmo padrão de antes.
      return {
        ...current,
        enemies: [
          ...current.enemies,
          // Sem `role`: a escolha manual não diz em que posição o inimigo
          // joga, e nenhum motor lê esse campo.
          { championId: champion.id, championName: champion.name, team: "enemy" as const }
        ]
      };
    });
  }

  function removeEnemy(championId: number) {
    setDraft((current) => ({
      ...current,
      enemies: current.enemies.filter((enemy) => enemy.championId !== championId)
    }));
  }

  function confirmChampion(recommendation: PickRecommendation) {
    setConfirmedChampion({
      championId: recommendation.championId,
      championName: recommendation.championName
    });
    setDraft((current) => ({ ...current, selectedChampionId: recommendation.championId }));
  }

  // Champion Select não é módulo de uso livre (feedback do usuário): sem
  // sessão real e sem o usuário pedir simulação, mostra a espera.
  if (!champSelectActive && !devOverride) {
    return (
      <PageLayout>
        <ThemedPageHero
          eyebrow="Champion Select"
          title="Aguardando sua seleção de campeões"
          meta={
            <StatusBadge state="offline">League Client sem seleção de campeões ativa</StatusBadge>
          }
        />
        <Card>
          <EmptyState
            icon={<Crosshair size={22} />}
            title="Esta tela abre sozinha"
            description="Assim que o cliente do League entrar em seleção de campeões, o Sparta detecta sua posição, a ordem de pick e o time inimigo, e traz as recomendações aqui — tudo por leitura, sem nenhuma ação no cliente."
            actions={
              <Button variant="secondary" onClick={() => setDevOverride(true)}>
                Simular manualmente
              </Button>
            }
          />
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <ThemedPageHero
        eyebrow="Champion Select"
        title="Sua decisão de pick"
        meta={
          champSelectActive ? (
            <StatusBadge state="live">
              {draftAutoFilled
                ? "Posição, ordem de pick e draft lidos do League Client"
                : "Posição e ordem detectadas pelo League Client"}
            </StatusBadge>
          ) : (
            <StatusBadge state="warning">Modo manual — nada está sendo lido do cliente</StatusBadge>
          )
        }
      />

      {noAccountLinked && (
        <SignalChip tone="info">
          Sem conta Riot vinculada — as recomendações usam a referência geral do papel, não seu
          histórico.
        </SignalChip>
      )}

      <Card pad="md">
        <div className="sp-draftbar">
          <div className="sp-draftbar__field">
            <Field label="Posição">
              {autoPlayerRole !== null ? (
                <ReadOnlyValue>{roleLabels[autoPlayerRole]}</ReadOnlyValue>
              ) : (
                /* Começa vazio: nenhuma posição vem pré-selecionada. A
                   escolha é marcada como `USER` pra não se confundir com uma
                   detecção do cliente. */
                <Select<Role | "">
                  value={draft.playerRole ?? ""}
                  onChange={(role) =>
                    setDraft((current) =>
                      role === ""
                        ? { ...current, playerRole: undefined, playerRoleSource: undefined }
                        : { ...current, playerRole: role, playerRoleSource: "USER" }
                    )
                  }
                  options={[
                    { value: "" as const, label: "Selecione..." },
                    ...ROLES.map((role) => ({ value: role, label: roleLabels[role] }))
                  ]}
                  ariaLabel="Posição"
                />
              )}
            </Field>
          </div>
          <div className="sp-draftbar__field">
            <Field label="Ordem de pick">
              {autoPickOrder !== null ? (
                <ReadOnlyValue>{autoPickOrder}</ReadOnlyValue>
              ) : (
                <NumberField
                  value={draft.pickOrder}
                  min={1}
                  max={5}
                  onChange={(value) => setDraft((current) => ({ ...current, pickOrder: value }))}
                  ariaLabel="Ordem de pick"
                />
              )}
            </Field>
          </div>

          {draftAutoFilled && draft.allies.length > 0 && (
            <div className="sp-draftbar__team">
              <span className="sp-draftbar__team-label">
                Seu time
                <Badge tone="neutral">{draft.allies.length} escolhidos</Badge>
              </span>
              <div className="sp-draftbar__slots">
                {draft.allies.map((ally) => (
                  <ChampionAvatar
                    key={ally.championId}
                    championId={ally.championId}
                    ddragonVersion={ddragonVersion}
                    alt={ally.championName}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="sp-draftbar__team">
            <span className="sp-draftbar__team-label">
              Time inimigo
              <Badge tone={draft.enemies.length > 0 ? "accent" : "neutral"}>
                {draft.enemies.length}/{MAX_ENEMIES} revelados
              </Badge>
              {draft.bannedChampionIds.length > 0 && (
                <Badge tone="neutral">{draft.bannedChampionIds.length} banidos</Badge>
              )}
            </span>
            <div className="sp-draftbar__slots">
              {Array.from({ length: MAX_ENEMIES }, (_, index) => {
                const enemy = draft.enemies[index];
                if (!enemy)
                  return (
                    <EmptyAvatarSlot key={`empty-${index}`} label="Inimigo ainda não revelado" />
                  );
                if (draftAutoFilled) {
                  return (
                    <ChampionAvatar
                      key={enemy.championId}
                      championId={enemy.championId}
                      ddragonVersion={ddragonVersion}
                      alt={enemy.championName}
                    />
                  );
                }
                return (
                  <button
                    key={enemy.championId}
                    type="button"
                    className="sp-slot"
                    onClick={() => removeEnemy(enemy.championId)}
                    title={`Remover ${enemy.championName}`}
                    aria-label={`Remover ${enemy.championName} do time inimigo`}
                  >
                    <ChampionAvatar
                      championId={enemy.championId}
                      ddragonVersion={ddragonVersion}
                      alt={enemy.championName}
                    />
                  </button>
                );
              })}
              {!draftAutoFilled && (
                <IconButton
                  label={editingEnemies ? "Fechar seletor" : "Editar time inimigo"}
                  icon={editingEnemies ? <X size={16} /> : <Pencil size={16} />}
                  active={editingEnemies}
                  onClick={() => setEditingEnemies((current) => !current)}
                />
              )}
            </div>
          </div>
        </div>

        {editingEnemies && !draftAutoFilled && (
          <div style={{ marginTop: "var(--space-5)" }}>
            <ChampionGrid
              ddragonVersion={ddragonVersion}
              maxHeight="200px"
              onSelect={toggleEnemy}
              isSelected={(champion) =>
                draft.enemies.some((enemy) => enemy.championId === champion.id)
              }
              isDisabled={() => draft.enemies.length >= MAX_ENEMIES}
            />
          </div>
        )}
      </Card>

      {draft.playerRole && sessionToken && (
        <Card>
          <SectionHeader
            title={`Seu pool de ${roleLabels[draft.playerRole]}`}
            description="Observações reais entram automaticamente; inclusões manuais valem somente para você e para esta posição."
            actions={
              <Button
                variant="secondary"
                icon={editingPool ? <X size={14} /> : <Plus size={14} />}
                onClick={() => setEditingPool((current) => !current)}
              >
                {editingPool ? "Fechar" : "Adicionar campeão"}
              </Button>
            }
          />
          <div className="sp-observation__values">
            {(pool.data?.roleSummaries ?? []).map((summary) => (
              <Badge
                key={summary.role}
                tone={summary.role === draft.playerRole ? "accent" : "neutral"}
              >
                {roleLabels[summary.role]}: {summary.enabledCandidates}
              </Badge>
            ))}
          </div>
          {pool.status === "loading" && <Loading block label="Atualizando pool..." />}
          {poolError && <ErrorState inline description={poolError} />}
          <div className="sp-pool-list">
            {(pool.data?.entries ?? [])
              .filter((entry) => entry.enabled)
              .map((entry) => (
                <div className="sp-pool-entry" key={`${entry.championId}-${entry.role}`}>
                  <ChampionAvatar
                    championId={entry.championId}
                    ddragonVersion={ddragonVersion}
                    size="sm"
                    alt={entry.championName}
                  />
                  <span>{entry.championName}</span>
                  <Badge tone={entry.source === "PERSONAL_OBSERVED" ? "positive" : "neutral"}>
                    {entry.source === "PERSONAL_OBSERVED" ? "Observado" : "Adicionado por você"}
                  </Badge>
                  {entry.source === "USER_PROVIDED" && (
                    <IconButton
                      label={`Desabilitar ${entry.championName} do pool`}
                      icon={<X size={14} />}
                      onClick={() => void disableFromPool(entry.championId)}
                    />
                  )}
                </div>
              ))}
          </div>
          {editingPool && (
            <div style={{ marginTop: "var(--space-4)" }}>
              <ChampionGrid
                ddragonVersion={ddragonVersion}
                maxHeight="180px"
                searchPlaceholder={`Adicionar a ${roleLabels[draft.playerRole]}...`}
                onSelect={(champion) => void addToPool(champion)}
                isSelected={(champion) =>
                  pool.data?.entries.some(
                    (entry) => entry.championId === champion.id && entry.enabled
                  ) ?? false
                }
              />
            </div>
          )}
        </Card>
      )}

      {!draft.playerRole ? (
        <Card>
          <EmptyState
            icon={<Crosshair size={20} />}
            title="Posição ainda não identificada"
            description="Aguardando o League Client informar sua função. No modo manual, selecione uma posição para receber recomendações."
          />
        </Card>
      ) : (
        <>
          {recommendationsStatus === "loading" && (
            <Card>
              <Loading block label="Calculando recomendações..." />
            </Card>
          )}
          {recommendationsStatus === "error" && (
            <Card>
              <ErrorState inline title="Não foi possível calcular recomendações agora" />
            </Card>
          )}
          {recommendationsStatus !== "loading" && poolSummary?.shortageReason && (
            <Card>
              <p className="sp-pool-shortage">{poolSummary.shortageReason}</p>
            </Card>
          )}

          {/* Durante o recálculo nada da posição anterior fica visível: o hook
          preserva o último `data` pra evitar flicker, o que aqui significaria
          exibir os cards do papel antigo como se fossem os atuais. */}
          {recommendationsStatus === "loading" ? null : allRecommendations.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Crosshair size={22} />}
                title={
                  (poolSummary?.totalCandidates ?? 0) > 0
                    ? "Nenhum candidato do pool está disponível neste draft"
                    : `Seu pool de ${roleLabels[draft.playerRole]} ainda está vazio`
                }
                description={
                  poolSummary?.shortageReason ??
                  "Adicione campeões manualmente ou sincronize partidas observadas nesta posição."
                }
              />
            </Card>
          ) : (
            <Columns
              asideFirst
              asideWidth="286px"
              aside={
                <div className="sp-reclist">
                  {recommendations.map((recommendation, index) => (
                    <InteractiveCard
                      key={recommendation.championId}
                      pad="sm"
                      tone={index === 0 ? "feature" : "default"}
                      selected={selected?.championId === recommendation.championId}
                      onClick={() => setSelectedId(recommendation.championId)}
                      label={`Ver detalhes de ${recommendation.championName}`}
                    >
                      <span className="sp-rec__rank">#{index + 1}</span>
                      <div className="sp-rec">
                        <ChampionAvatar
                          championId={recommendation.championId}
                          ddragonVersion={ddragonVersion}
                          alt={recommendation.championName}
                          ring={confirmedChampion?.championId === recommendation.championId}
                        />
                        <span style={{ minWidth: 0 }}>
                          <strong className="sp-rec__name">{recommendation.championName}</strong>
                          <span className="sp-rec__category">
                            {categoryLabels[recommendation.category]}
                          </span>
                          <span className="sp-rec__category">
                            {poolSourceLabel(recommendation)} · {personalGamesLabel(recommendation)}
                          </span>
                          <span
                            className="sp-rec__category"
                            title={executionRiskExplanation(recommendation)}
                          >
                            {executionRiskCompactLabel(recommendation)}
                          </span>
                          {strategicCompactSummary(recommendation) && (
                            <span className="sp-rec__category">
                              {strategicCompactSummary(recommendation)}
                            </span>
                          )}
                        </span>
                        <ScoreBadge score={recommendation.totalScore} size="xs" />
                      </div>
                    </InteractiveCard>
                  ))}
                  {alternatives.length > 0 && (
                    <>
                      <span className="sp-pool-section-label">Alternativas</span>
                      {alternatives.map((recommendation, index) => (
                        <InteractiveCard
                          key={recommendation.championId}
                          pad="sm"
                          selected={selected?.championId === recommendation.championId}
                          onClick={() => setSelectedId(recommendation.championId)}
                          label={`Ver alternativa ${recommendation.championName}`}
                        >
                          <span className="sp-rec__rank">
                            #{recommendations.length + index + 1}
                          </span>
                          <div className="sp-rec">
                            <ChampionAvatar
                              championId={recommendation.championId}
                              ddragonVersion={ddragonVersion}
                              alt={recommendation.championName}
                            />
                            <span style={{ minWidth: 0 }}>
                              <strong className="sp-rec__name">
                                {recommendation.championName}
                              </strong>
                              <span className="sp-rec__category">
                                {poolSourceLabel(recommendation)} ·{" "}
                                {personalGamesLabel(recommendation)}
                              </span>
                              <span
                                className="sp-rec__category"
                                title={executionRiskExplanation(recommendation)}
                              >
                                {executionRiskCompactLabel(recommendation)}
                              </span>
                              {strategicCompactSummary(recommendation) && (
                                <span className="sp-rec__category">
                                  {strategicCompactSummary(recommendation)}
                                </span>
                              )}
                            </span>
                            <ScoreBadge score={recommendation.totalScore} size="xs" />
                          </div>
                        </InteractiveCard>
                      ))}
                    </>
                  )}
                </div>
              }
              main={
                selected && (
                  <div style={{ display: "grid", gap: "var(--space-4)" }}>
                    <Card>
                      <div className="sp-recdetail__head">
                        <ChampionAvatar
                          championId={selected.championId}
                          ddragonVersion={ddragonVersion}
                          size="xl"
                          alt={selected.championName}
                          ring={confirmedChampion?.championId === selected.championId}
                        />
                        <div className="sp-recdetail__title">
                          <strong className="sp-recdetail__name">{selected.championName}</strong>
                          <div className="sp-recdetail__badges">
                            <Badge tone="accent" square>
                              {categoryLabels[selected.category]}
                            </Badge>
                            <Badge tone="neutral">{roleLabels[selected.role]}</Badge>
                            {selected.confidence && (
                              <Badge tone="neutral">
                                confiança {confidenceLabels[selected.confidence]}
                              </Badge>
                            )}
                            <Badge tone="neutral">{poolSourceLabel(selected)}</Badge>
                            <Badge tone="neutral">{personalGamesLabel(selected)}</Badge>
                          </div>
                        </div>
                        <ScoreBadge score={selected.totalScore} size="lg" />
                      </div>

                      <SectionHeader
                        title="Por que este pick"
                        description="Os sinais do draft formam o score base; o risco pessoal aplica somente uma penalização limitada e explicada."
                      />
                      {Number.isFinite(selected.dataCoverage) && (
                        <p className="sp-recdetail__coverage">
                          {Math.round(selected.dataCoverage * 100)}% dos sinais previstos possuem
                          dados disponíveis.
                        </p>
                      )}
                      <div className="sp-recdetail__metrics">
                        {/* Ordena por valor, mas empurra o que nao tem valor
                          pro fim: metrica ausente nao disputa posicao com
                          metrica calculada. */}
                        {[...selected.metricDetails]
                          .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
                          .map((metric) => (
                            <MetricRow
                              key={metric.key}
                              metric={metric}
                              label={metricKeyLabels[metric.key]}
                            />
                          ))}
                      </div>

                      {selected.strategicAnalysis && (
                        <div style={{ marginTop: "var(--space-5)" }}>
                          <SectionHeader
                            title="Análise estratégica 5×5"
                            description={`Análise parcial: ${selected.strategicAnalysis.alliedProfile.knownChampions.length + selected.strategicAnalysis.enemyProfile.knownChampions.length} de 10 campeões conhecidos · cobertura ${Math.round(selected.strategicAnalysis.coverage * 100)}%.`}
                          />
                          <SignalChipList stacked>
                            {selected.strategicAnalysis.strengths.map((signal) => (
                              <SignalChip
                                key={signal.key}
                                tone="positive"
                                title={strategicEvidenceTitle(signal)}
                              >
                                {signal.description}
                              </SignalChip>
                            ))}
                            {selected.strategicAnalysis.gaps.map((signal) => (
                              <SignalChip
                                key={signal.key}
                                tone="negative"
                                title={strategicEvidenceTitle(signal)}
                              >
                                {signal.description}
                              </SignalChip>
                            ))}
                            {selected.strategicAnalysis.risks.map((signal) => (
                              <SignalChip
                                key={signal.key}
                                tone="negative"
                                title={strategicEvidenceTitle(signal)}
                              >
                                {signal.description}
                              </SignalChip>
                            ))}
                            {selected.strategicAnalysis.unavailableSignals
                              .slice(0, 4)
                              .map((signal) => (
                                <SignalChip
                                  key={signal.key}
                                  tone="info"
                                  title={signal.unavailableReason}
                                >
                                  {signal.description}
                                </SignalChip>
                              ))}
                          </SignalChipList>
                          <p className="sp-recdetail__coverage">
                            Aliados considerados:{" "}
                            {strategicChampionNames(
                              selected.strategicAnalysis.alliedProfile.knownChampions
                            )}
                            . Inimigos considerados:{" "}
                            {strategicChampionNames(
                              selected.strategicAnalysis.enemyProfile.knownChampions
                            )}
                            .
                          </p>
                        </div>
                      )}

                      <div style={{ marginTop: "var(--space-5)" }}>
                        <PersonalLoadoutHistory
                          token={sessionToken}
                          playerId={riotAccounts[0]?.puuid}
                          championId={selected.championId}
                          role={draft.playerRole}
                          requestedPatch={draft.patch}
                        />
                      </div>

                      {(selected.reasons.length > 0 || selected.warnings.length > 0) && (
                        <div style={{ marginTop: "var(--space-5)" }}>
                          <SignalChipList stacked>
                            {selected.reasons.map((reason) => (
                              <SignalChip key={reason.code} tone="positive" title={reason.detail}>
                                {reason.detail}
                              </SignalChip>
                            ))}
                            {selected.warnings.map((warning) => (
                              <SignalChip key={warning.code} tone="negative" title={warning.detail}>
                                {warning.detail}
                              </SignalChip>
                            ))}
                          </SignalChipList>
                        </div>
                      )}

                      <div style={{ marginTop: "var(--space-6)" }}>
                        <Button
                          variant={
                            confirmedChampion?.championId === selected.championId
                              ? "confirmed"
                              : "primary"
                          }
                          size="lg"
                          icon={
                            confirmedChampion?.championId === selected.championId ? (
                              <Check size={16} />
                            ) : undefined
                          }
                          onClick={() => confirmChampion(selected)}
                        >
                          {confirmedChampion?.championId === selected.championId
                            ? `${selected.championName} confirmado`
                            : `Confirmar ${selected.championName}`}
                        </Button>
                      </div>
                    </Card>

                    {confirmedChampion && (
                      <BuildPanel
                        confirmedChampion={confirmedChampion}
                        enemies={draft.enemies}
                        ddragonVersion={ddragonVersion}
                      />
                    )}
                  </div>
                )
              }
            />
          )}
        </>
      )}
    </PageLayout>
  );
}

function poolSourceLabel(recommendation: PickRecommendation): string {
  const source = (recommendation as PickRecommendation & { poolSource?: string }).poolSource;
  if (source === "PERSONAL_OBSERVED") return "Observado";
  if (source === "USER_PROVIDED") return "Adicionado por você";
  return "Origem não informada";
}

function personalGamesLabel(recommendation: PickRecommendation): string {
  const games = (recommendation as PickRecommendation & { personalGames?: number }).personalGames;
  if (games === undefined) return "Amostra não informada";
  if (games === 0) return "Sem histórico pessoal";
  return `${games} ${games === 1 ? "partida observada" : "partidas observadas"}`;
}

function executionRiskCompactLabel(recommendation: PickRecommendation): string {
  const difficulty = recommendation.metricDetails.find(
    (metric) => metric.key === "CHAMPION_DIFFICULTY"
  );
  const risk = recommendation.metricDetails.find((metric) => metric.key === "EXECUTION_RISK");
  const difficultyLabel =
    difficulty?.value === null || difficulty?.value === undefined
      ? "Dificuldade indisponível"
      : `Dificuldade ${Math.round(difficulty.value)}`;
  const riskLabel =
    risk?.value === null || risk?.value === undefined
      ? "risco indisponível"
      : `risco ${Math.round(risk.value)}`;
  return `${difficultyLabel} · ${riskLabel}`;
}

function executionRiskExplanation(recommendation: PickRecommendation): string | undefined {
  return recommendation.metricDetails.find((metric) => metric.key === "EXECUTION_RISK")
    ?.explanation;
}

function strategicCompactSummary(recommendation: PickRecommendation): string | undefined {
  const analysis = recommendation.strategicAnalysis;
  if (!analysis) return undefined;
  const contribution = analysis.candidateContribution;
  const additions = [...contribution.filledKnownGaps, ...contribution.addedCapabilities];
  if (additions.length > 0) {
    return `Adiciona ${additions
      .slice(0, 2)
      .map((key) => STRATEGIC_CAPABILITY_LABELS[key])
      .join(" e ")}`;
  }
  if (contribution.newlyEnabledResponses.length > 0) {
    return `Ajuda a responder com ${contribution.newlyEnabledResponses
      .slice(0, 2)
      .map((key) => STRATEGIC_CAPABILITY_LABELS[key])
      .join(" e ")}`;
  }
  if (contribution.remainingKnownGaps.length > 0) {
    return `Mantém lacuna de ${STRATEGIC_CAPABILITY_LABELS[contribution.remainingKnownGaps[0]!]}`;
  }
  return `Análise parcial: ${
    analysis.alliedProfile.knownChampions.length + analysis.enemyProfile.knownChampions.length
  } de 10`;
}

function strategicEvidenceTitle(signal: StrategicSignal): string {
  if (signal.evidence.length === 0) {
    return signal.unavailableReason ?? signal.description;
  }
  return signal.evidence
    .map(
      (entry) =>
        `${entry.champion.championName}: ${STRATEGIC_CAPABILITY_LABELS[entry.capability]} · ${
          entry.source === "CAPABILITY_PROFILE" ? "perfil específico" : "ChampionTag"
        }`
    )
    .join(" | ");
}

function strategicChampionNames(champions: StrategicChampionReference[]): string {
  return champions.length > 0
    ? champions.map((champion) => champion.championName).join(", ")
    : "nenhum revelado";
}
