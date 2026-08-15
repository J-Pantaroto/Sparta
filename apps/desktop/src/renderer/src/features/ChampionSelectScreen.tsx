import {
  type DraftState,
  type DraftStrategicAnalysis,
  type PickRecommendation,
  type PatchChange,
  type PlayerChampionPoolEntry,
  type PlayerChampionPoolRoleSummary,
  type RecommendationPoolSummary,
  type Role,
  type RecommendationMetric,
  type RecommendationMetricKey,
  type StrategicChampionReference,
  type StrategicSignal,
  STRATEGIC_CAPABILITY_LABELS
} from "@sparta/core";
import type { LcuGameflowPhase, LcuReadStatus } from "@sparta/riot";
import {
  Check,
  ChevronDown,
  Crosshair,
  LockKeyhole,
  Pencil,
  Plus,
  ShieldAlert,
  X
} from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  fetchPatchRelease,
  fetchPlayerPool,
  fetchTheoreticalPatchImpacts,
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
import { PatchSummary } from "./PatchSummary";
import "./ChampionSelectScreen.css";
import { TheoreticalPatchImpactPanel } from "./TheoreticalPatchImpactPanel";

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
  lcuStatus?: LcuReadStatus;
  gameflowPhase?: LcuGameflowPhase | null;
  selectedChampionLocked?: boolean;
  selectedChampionName?: string;
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
  draftAutoFilled,
  lcuStatus = champSelectActive ? "OK" : "CLIENT_CLOSED",
  gameflowPhase = champSelectActive ? "ChampSelect" : null,
  selectedChampionLocked = false,
  selectedChampionName
}: ChampionSelectScreenProps) {
  const [confirmedChampion, setConfirmedChampion] = useState<{
    championId: number;
    championName: string;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingEnemies, setEditingEnemies] = useState(false);
  const [editingPool, setEditingPool] = useState(false);
  const [recommendationGroup, setRecommendationGroup] = useState<"ALL" | "PRIMARY" | "ALTERNATIVE">(
    "ALL"
  );
  const [explanationGroup, setExplanationGroup] = useState<ExplanationGroup>("WORKS");
  const [frozenSnapshot, setFrozenSnapshot] = useState<{
    primary: PickRecommendation[];
    alternatives: PickRecommendation[];
  } | null>(null);
  const previousRole = useRef(draft.playerRole);
  const wasLocked = useRef(false);
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
  const officialPatch = officialPatchFromGameVersion(draft.patch);
  const patch = useAsyncData(() => fetchPatchRelease(officialPatch), [officialPatch]);
  const theoreticalImpacts = useAsyncData(
    () => (officialPatch ? fetchTheoreticalPatchImpacts(officialPatch) : undefined),
    [officialPatch]
  );

  // A recomendação #1 muda conforme o draft evolui; sem seleção explícita, o
  // detalhe acompanha o topo da lista em vez de ficar preso num campeão que
  // já não é mais o melhor.
  const compatiblePrimary = recommendations
    .filter((item) => item.role === undefined || item.role === draft.playerRole)
    .slice(0, 5);
  const compatibleAlternatives = alternatives
    .filter((item) => item.role === undefined || item.role === draft.playerRole)
    .slice(0, 3);
  const effectivePrimary = frozenSnapshot?.primary ?? compatiblePrimary;
  const effectiveAlternatives = frozenSnapshot?.alternatives ?? compatibleAlternatives;
  const allRecommendations = [...effectivePrimary, ...effectiveAlternatives];
  const selected =
    allRecommendations.find((recommendation) => recommendation.championId === selectedId) ??
    effectivePrimary[0] ??
    effectiveAlternatives[0];
  const chosenCandidate = allRecommendations.find(
    (item) => item.championId === draft.selectedChampionId
  );
  const chosenPrimaryIndex = effectivePrimary.findIndex(
    (item) => item.championId === draft.selectedChampionId
  );
  const chosenAlternativeIndex = effectiveAlternatives.findIndex(
    (item) => item.championId === draft.selectedChampionId
  );
  const chosenGroup =
    draft.selectedChampionId === undefined
      ? undefined
      : chosenPrimaryIndex >= 0
        ? "PRIMARY"
        : chosenAlternativeIndex >= 0
          ? "ALTERNATIVE"
          : "NOT_IN_SNAPSHOT";
  const chosenRank =
    chosenPrimaryIndex >= 0
      ? chosenPrimaryIndex + 1
      : chosenAlternativeIndex >= 0
        ? effectivePrimary.length + chosenAlternativeIndex + 1
        : undefined;
  const visiblePrimary = recommendationGroup === "ALTERNATIVE" ? [] : effectivePrimary;
  const visibleAlternatives = recommendationGroup === "PRIMARY" ? [] : effectiveAlternatives;
  const patchChangesFor = (championId: number) =>
    patch.data?.changes.filter(
      (change) => change.entityType === "CHAMPION" && change.entityId === championId
    ) ?? [];
  const selectedPatchChanges = selected ? patchChangesFor(selected.championId) : [];
  const selectedTheoreticalImpact = selected
    ? theoreticalImpacts.data?.impacts.find((impact) => impact.championId === selected.championId)
    : undefined;
  const changedPoolChampions = new Set(
    theoreticalImpacts.data?.impacts
      .filter((impact) => impact.entityChanged)
      .map((impact) => impact.championId) ?? []
  );
  const changedPoolCount = new Set(
    (pool.data?.entries ?? [])
      .filter((entry) => entry.enabled && changedPoolChampions.has(entry.championId))
      .map((entry) => entry.championId)
  ).size;

  useEffect(() => {
    if (previousRole.current === draft.playerRole) return;
    previousRole.current = draft.playerRole;
    setSelectedId(null);
    setFrozenSnapshot(null);
  }, [draft.playerRole]);

  useEffect(() => {
    if (selectedChampionLocked && !wasLocked.current && allRecommendations.length > 0) {
      setFrozenSnapshot({
        primary: [...effectivePrimary],
        alternatives: [...effectiveAlternatives]
      });
    }
    wasLocked.current = selectedChampionLocked;
  }, [selectedChampionLocked, allRecommendations.length]);

  useEffect(() => {
    if (
      draft.selectedChampionId === undefined ||
      !allRecommendations.some((item) => item.championId === draft.selectedChampionId)
    )
      return;
    setSelectedId(draft.selectedChampionId);
  }, [draft.selectedChampionId, allRecommendations]);

  useEffect(() => {
    if (draft.selectedChampionId !== undefined || selectedChampionLocked) return;
    setFrozenSnapshot(null);
    setConfirmedChampion(null);
  }, [draft.selectedChampionId, selectedChampionLocked]);

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
    setFrozenSnapshot({ primary: [...effectivePrimary], alternatives: [...effectiveAlternatives] });
    setConfirmedChampion({
      championId: recommendation.championId,
      championName: recommendation.championName
    });
    setDraft((current) => ({ ...current, selectedChampionId: recommendation.championId }));
  }

  // Champion Select não é módulo de uso livre (feedback do usuário): sem
  // sessão real e sem o usuário pedir simulação, mostra a espera.
  if (!champSelectActive && !devOverride) {
    const operational = championSelectOperationalState(lcuStatus, gameflowPhase);
    return (
      <PageLayout>
        <ThemedPageHero
          eyebrow="Champion Select"
          title="Aguardando sua seleção de campeões"
          meta={
            <StatusBadge state="offline">League Client sem seleção de campeões ativa</StatusBadge>
          }
        />
        <Card className="sp-cs-operational">
          <div className="sp-cs-operational__state" role="status">
            {operational.error ? <ShieldAlert size={20} /> : <Crosshair size={20} />}
            <div>
              <strong>{operational.heading}</strong>
              <p>{operational.description}</p>
            </div>
            <StatusBadge state={operational.badgeState}>{operational.badge}</StatusBadge>
          </div>
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

      {champSelectActive && lcuStatus !== "OK" && (
        <SignalChip tone="negative" title={lcuStatus}>
          A leitura local do League está instável ({lcuStatus}). Os dados automáticos da sessão
          foram descartados e não participam das recomendações até uma nova leitura confirmada.
        </SignalChip>
      )}

      {noAccountLinked && (
        <SignalChip tone="info">
          Sem conta Riot vinculada — as recomendações usam a referência geral do papel, não seu
          histórico.
        </SignalChip>
      )}

      <Card pad="md">
        <DraftStage
          draft={draft}
          ddragonVersion={ddragonVersion}
          selectedChampionName={selectedChampionName ?? confirmedChampion?.championName}
          selectedChampionLocked={selectedChampionLocked}
          phase={champSelectActive ? gameflowPhase : "Manual"}
        />
        {!draftAutoFilled && (
          <div className="sp-draft-stage__manual-actions">
            <Button
              variant="secondary"
              icon={editingEnemies ? <X size={14} /> : <Pencil size={14} />}
              onClick={() => setEditingEnemies((current) => !current)}
            >
              {editingEnemies ? "Fechar editor de inimigos" : "Editar time inimigo"}
            </Button>
          </div>
        )}
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

      {patch.data && (
        <PatchSummary release={patch.data} theoreticalImpacts={theoreticalImpacts.data} />
      )}

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
          {changedPoolCount > 0 && (
            <p className="sp-pool-patch-context">
              {changedPoolCount}{" "}
              {changedPoolCount === 1
                ? "campeão do seu pool recebeu"
                : "campeões do seu pool receberam"}{" "}
              mudanças oficiais neste patch. O contexto teórico permanece separado do seu histórico
              pessoal.
            </p>
          )}
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
          {recommendationsStatus === "loading" && allRecommendations.length === 0 && (
            <Card>
              <Loading block label="Calculando recomendações..." />
            </Card>
          )}
          {recommendationsStatus === "loading" && allRecommendations.length > 0 && (
            <div className="sp-cs-updating" role="status" aria-live="polite">
              Atualizando com o draft atual; a ultima leitura compativel continua visivel.
            </div>
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
          {allRecommendations.length === 0 ? (
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
            <>
              {draft.selectedChampionId !== undefined && (
                <SelectedChoiceSummary
                  championId={draft.selectedChampionId}
                  championName={selectedChampionName ?? chosenCandidate?.championName}
                  group={chosenGroup ?? "NOT_IN_SNAPSHOT"}
                  rank={chosenRank}
                  recommendation={chosenCandidate}
                  locked={selectedChampionLocked || frozenSnapshot !== null}
                  ddragonVersion={ddragonVersion}
                />
              )}
              <div
                className="sp-cs-group-tabs"
                role="group"
                aria-label="Filtrar recomendacoes por grupo"
              >
                {(["ALL", "PRIMARY", "ALTERNATIVE"] as const).map((group) => (
                  <button
                    key={group}
                    type="button"
                    className="sp-cs-filter"
                    aria-pressed={recommendationGroup === group}
                    onClick={() => setRecommendationGroup(group)}
                  >
                    {group === "ALL"
                      ? "Todas"
                      : group === "PRIMARY"
                        ? "Principais"
                        : "So alternativas"}
                  </button>
                ))}
              </div>
              <Columns
                asideFirst
                asideWidth="420px"
                aside={
                  <div className="sp-reclist">
                    {visiblePrimary.map((recommendation, index) => (
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
                            {patchIndicator(patchChangesFor(recommendation.championId)) && (
                              <span className="sp-rec__patch">
                                {patchIndicator(patchChangesFor(recommendation.championId))!.label}
                              </span>
                            )}
                            <RecommendationQuickSignals recommendation={recommendation} />
                          </span>
                          <ScoreBadge score={recommendation.totalScore} size="xs" />
                        </div>
                      </InteractiveCard>
                    ))}
                    {visibleAlternatives.length > 0 && (
                      <>
                        <span className="sp-pool-section-label">Alternativas</span>
                        {visibleAlternatives.map((recommendation, index) => (
                          <InteractiveCard
                            key={recommendation.championId}
                            pad="sm"
                            selected={selected?.championId === recommendation.championId}
                            onClick={() => setSelectedId(recommendation.championId)}
                            label={`Ver alternativa ${recommendation.championName}`}
                          >
                            <span className="sp-rec__rank">
                              #{effectivePrimary.length + index + 1}
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
                                {patchIndicator(patchChangesFor(recommendation.championId)) && (
                                  <span className="sp-rec__patch">
                                    {
                                      patchIndicator(patchChangesFor(recommendation.championId))!
                                        .label
                                    }
                                  </span>
                                )}
                                <RecommendationQuickSignals recommendation={recommendation} />
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
                              {patchIndicator(selectedPatchChanges) && (
                                <Badge tone={patchIndicator(selectedPatchChanges)!.tone}>
                                  {patchIndicator(selectedPatchChanges)!.label}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <ScoreBadge score={selected.totalScore} size="lg" />
                        </div>

                        {selectedPatchChanges.length > 0 && patch.data && (
                          <div className="sp-patch-detail">
                            <SectionHeader
                              title="Mudanças oficiais neste patch"
                              description="Informação editorial da Riot, separada dos sinais usados pelo ranking."
                            />
                            {selectedPatchChanges.map((change) => (
                              <article key={change.id} className="sp-patch-change">
                                <strong>{change.affectedComponent ?? change.entityName}</strong>
                                {change.officialSummary && <p>{change.officialSummary}</p>}
                                <ul>
                                  {change.officialDetails.map((detail, index) => {
                                    const delta = change.structuredChanges[index];
                                    return (
                                      <li key={`${change.id}-${index}`}>
                                        {detail}
                                        {delta?.previousValue !== undefined &&
                                          delta.newValue !== undefined && (
                                            <span>
                                              Antes: {delta.previousValue} · Agora: {delta.newValue}
                                            </span>
                                          )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </article>
                            ))}
                            <p className="sp-patch-detail__warning">
                              Mudança oficial não representa força observada no meta.{" "}
                              <a href={patch.data.sourceUrl} target="_blank" rel="noreferrer">
                                Fonte oficial
                              </a>
                            </p>
                          </div>
                        )}

                        {selectedTheoreticalImpact && (
                          <TheoreticalPatchImpactPanel impact={selectedTheoreticalImpact} />
                        )}

                        <ExplanationFilters
                          value={explanationGroup}
                          onChange={setExplanationGroup}
                        />
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
                          {metricsForExplanationGroup(selected, explanationGroup)
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
                            <CapabilityMap analysis={selected.strategicAnalysis} />
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

                        <details className="sp-cs-details" style={{ marginTop: "var(--space-5)" }}>
                          <summary>
                            Loadout pessoal conhecido <ChevronDown size={16} aria-hidden="true" />
                          </summary>
                          <PersonalLoadoutHistory
                            token={sessionToken}
                            playerId={riotAccounts[0]?.puuid}
                            championId={selected.championId}
                            role={draft.playerRole}
                            requestedPatch={draft.patch}
                          />
                        </details>

                        {(selected.reasons.length > 0 || selected.warnings.length > 0) && (
                          <div style={{ marginTop: "var(--space-5)" }}>
                            <SignalChipList stacked>
                              {selected.reasons.map((reason) => (
                                <SignalChip key={reason.code} tone="positive" title={reason.detail}>
                                  {reason.detail}
                                </SignalChip>
                              ))}
                              {selected.warnings.map((warning) => (
                                <SignalChip
                                  key={warning.code}
                                  tone="negative"
                                  title={warning.detail}
                                >
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
            </>
          )}
        </>
      )}
    </PageLayout>
  );
}

type ExplanationGroup = "WORKS" | "RISKS" | "PERSONAL" | "COMPOSITION" | "MATCHUP" | "UNAVAILABLE";

const explanationLabels: Record<ExplanationGroup, string> = {
  WORKS: "Por que funciona",
  RISKS: "Riscos",
  PERSONAL: "Contexto pessoal",
  COMPOSITION: "Composicao",
  MATCHUP: "Matchup pessoal",
  UNAVAILABLE: "Dados indisponiveis"
};

const PERSONAL_METRICS = new Set<RecommendationMetricKey>([
  "PERSONAL_PERFORMANCE",
  "PERSONAL_EXPERIENCE",
  "RECENT_FORM",
  "CHAMPION_DIFFICULTY"
]);
const COMPOSITION_METRICS = new Set<RecommendationMetricKey>([
  "BLIND_SAFETY",
  "ALLY_SYNERGY",
  "TEAM_COMPOSITION",
  "ENEMY_COMPOSITION_ANSWER"
]);
const MATCHUP_METRICS = new Set<RecommendationMetricKey>([
  "PERSONAL_MATCHUP",
  "GLOBAL_MATCHUP",
  "LANE_MATCHUP"
]);

function metricsForExplanationGroup(
  recommendation: PickRecommendation,
  group: ExplanationGroup
): RecommendationMetric[] {
  const metrics = recommendation.metricDetails ?? [];
  if (group === "UNAVAILABLE") return metrics.filter((metric) => metric.status === "UNAVAILABLE");
  if (group === "RISKS") return metrics.filter((metric) => metric.key === "EXECUTION_RISK");
  if (group === "PERSONAL") return metrics.filter((metric) => PERSONAL_METRICS.has(metric.key));
  if (group === "COMPOSITION")
    return metrics.filter((metric) => COMPOSITION_METRICS.has(metric.key));
  if (group === "MATCHUP") return metrics.filter((metric) => MATCHUP_METRICS.has(metric.key));
  return metrics.filter(
    (metric) =>
      metric.status !== "UNAVAILABLE" &&
      metric.key !== "EXECUTION_RISK" &&
      !MATCHUP_METRICS.has(metric.key)
  );
}

function ExplanationFilters({
  value,
  onChange
}: {
  value: ExplanationGroup;
  onChange: (value: ExplanationGroup) => void;
}) {
  return (
    <div className="sp-cs-explanation-tabs" role="group" aria-label="Filtrar explicacoes">
      {(Object.keys(explanationLabels) as ExplanationGroup[]).map((group) => (
        <button
          key={group}
          type="button"
          className="sp-cs-filter"
          aria-pressed={value === group}
          onClick={() => onChange(group)}
        >
          {explanationLabels[group]}
        </button>
      ))}
    </div>
  );
}

function DraftStage({
  draft,
  ddragonVersion,
  selectedChampionName,
  selectedChampionLocked,
  phase
}: {
  draft: DraftState;
  ddragonVersion: string;
  selectedChampionName?: string;
  selectedChampionLocked: boolean;
  phase: string | null;
}) {
  return (
    <section className="sp-draft-stage" aria-label="Estado visual do draft">
      <DraftTeam
        title="Aliados"
        picks={draft.allies}
        ddragonVersion={ddragonVersion}
        directOpponentId={undefined}
      />
      <div className="sp-draft-stage__center">
        <span className="sp-draft-stage__eyebrow">Draft atual</span>
        {draft.selectedChampionId === undefined ? (
          <EmptyAvatarSlot size="lg" label="Seu campeao ainda nao foi selecionado" />
        ) : (
          <ChampionAvatar
            championId={draft.selectedChampionId}
            ddragonVersion={ddragonVersion}
            size="lg"
            alt={selectedChampionName ?? `Campeao ${draft.selectedChampionId}`}
            ring
          />
        )}
        <strong>{selectedChampionName ?? "Sua escolha"}</strong>
        <span>
          {selectedChampionLocked
            ? "Campeao travado"
            : draft.selectedChampionId
              ? "Campeao selecionado"
              : "Aguardando selecao"}
        </span>
        <Badge tone={draft.playerRole ? "accent" : "warning"}>
          {draft.playerRole ? roleLabels[draft.playerRole] : "Posicao desconhecida"}
        </Badge>
        <small>{phase ? phaseLabel(phase) : "League nao detectado"}</small>
      </div>
      <DraftTeam
        title="Inimigos"
        picks={draft.enemies}
        ddragonVersion={ddragonVersion}
        directOpponentId={draft.enemyLaneChampionId}
      />
      <div
        className="sp-draft-stage__bans"
        aria-label={`${draft.bannedChampionIds.length} banimentos confirmados`}
      >
        <span>Bans confirmados</span>
        {draft.bannedChampionIds.length === 0 ? (
          <small>Nenhum ban revelado</small>
        ) : (
          draft.bannedChampionIds.map((championId) => (
            <ChampionAvatar
              key={championId}
              championId={championId}
              ddragonVersion={ddragonVersion}
              size="xs"
              alt={`Campeao banido ${championId}`}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DraftTeam({
  title,
  picks,
  ddragonVersion,
  directOpponentId
}: {
  title: string;
  picks: DraftState["allies"];
  ddragonVersion: string;
  directOpponentId?: number;
}) {
  return (
    <div className="sp-draft-team">
      <strong>{title}</strong>
      <div className="sp-draft-team__slots">
        {Array.from({ length: 5 }, (_, index) => {
          const pick = picks[index];
          if (!pick) {
            return (
              <div className="sp-draft-pick sp-draft-pick--unknown" key={`${title}-${index}`}>
                <EmptyAvatarSlot label={`${title}: pick ${index + 1} ainda desconhecido`} />
                <span>Pick {index + 1}</span>
                <small>Desconhecido</small>
              </div>
            );
          }
          const direct = directOpponentId === pick.championId;
          return (
            <div
              className={`sp-draft-pick${direct ? " sp-draft-pick--direct" : ""}`}
              key={`${pick.championId}-${index}`}
              aria-label={`${pick.championName}${pick.role ? `, ${roleLabels[pick.role]}` : ", posicao desconhecida"}${direct ? ", adversario direto confirmado" : ""}`}
            >
              <ChampionAvatar
                championId={pick.championId}
                ddragonVersion={ddragonVersion}
                alt={pick.championName}
              />
              <span>{pick.championName}</span>
              <small>{pick.role ? roleLabels[pick.role] : "Posicao desconhecida"}</small>
              {direct && <Badge tone="warning">Direto</Badge>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SelectedChoiceSummary({
  championId,
  championName,
  group,
  rank,
  recommendation,
  locked,
  ddragonVersion
}: {
  championId: number;
  championName?: string;
  group: "PRIMARY" | "ALTERNATIVE" | "NOT_IN_SNAPSHOT";
  rank?: number;
  recommendation?: PickRecommendation;
  locked: boolean;
  ddragonVersion: string;
}) {
  return (
    <Card tone="feature" className="sp-selected-choice">
      <ChampionAvatar
        championId={championId}
        ddragonVersion={ddragonVersion}
        size="lg"
        alt={championName ?? `Campeao ${championId}`}
        ring
      />
      <div>
        <span className="sp-draft-stage__eyebrow">Escolha registrada</span>
        <strong>{championName ?? `Campeao ${championId}`}</strong>
        <p>
          {group === "NOT_IN_SNAPSHOT"
            ? "Fora do snapshot: nenhum score ou ranking retroativo foi criado."
            : `${group} / #${rank} no ranking original / score ${Math.round(recommendation?.totalScore ?? 0)} / cobertura ${formatCoverage(recommendation?.dataCoverage)}`}
        </p>
      </div>
      <Badge tone={locked ? "positive" : "accent"}>
        {locked ? <LockKeyhole size={13} aria-hidden="true" /> : null}
        {locked ? "Snapshot preservado" : "Selecionado"}
      </Badge>
    </Card>
  );
}

function RecommendationQuickSignals({ recommendation }: { recommendation: PickRecommendation }) {
  return (
    <span className="sp-rec__quick">
      <span>
        Cobertura {formatCoverage(recommendation.dataCoverage)} /{" "}
        {recommendation.role ? roleLabels[recommendation.role] : "posicao nao informada"}
      </span>
      <span className="sp-rec__signal sp-rec__signal--positive">
        {topFavorableSignal(recommendation)}
      </span>
      <span className="sp-rec__signal sp-rec__signal--limit">
        {principalLimitation(recommendation)}
      </span>
    </span>
  );
}

function CapabilityMap({ analysis }: { analysis: DraftStrategicAnalysis }) {
  const states = new Map<
    string,
    { label: string; state: "added" | "reinforced" | "gap" | "risk" | "unavailable" }
  >();
  const add = (keys: readonly string[], state: "added" | "reinforced" | "gap") =>
    keys.forEach((key) =>
      states.set(key, {
        label: STRATEGIC_CAPABILITY_LABELS[key as keyof typeof STRATEGIC_CAPABILITY_LABELS],
        state
      })
    );
  add(
    [
      ...analysis.candidateContribution.addedCapabilities,
      ...analysis.candidateContribution.filledKnownGaps
    ],
    "added"
  );
  add(analysis.candidateContribution.reinforcedCapabilities, "reinforced");
  add(analysis.candidateContribution.remainingKnownGaps, "gap");
  analysis.risks.forEach((signal) =>
    states.set(signal.dimension, {
      label: STRATEGIC_CAPABILITY_LABELS[signal.dimension],
      state: "risk"
    })
  );
  analysis.unavailableSignals.forEach((signal) => {
    if (!states.has(signal.dimension))
      states.set(signal.dimension, {
        label: STRATEGIC_CAPABILITY_LABELS[signal.dimension],
        state: "unavailable"
      });
  });
  return (
    <div
      className="sp-capability-map"
      role="list"
      aria-label="Mapa textual de capacidades calculadas"
    >
      {[...states.entries()].map(([key, item]) => (
        <div
          key={key}
          role="listitem"
          className={`sp-capability-map__cell sp-capability-map__cell--${item.state}`}
        >
          <strong>{item.label}</strong>
          <span>{capabilityStateLabel(item.state)}</span>
        </div>
      ))}
    </div>
  );
}

function capabilityStateLabel(state: "added" | "reinforced" | "gap" | "risk" | "unavailable") {
  if (state === "added") return "adiciona / cobre lacuna";
  if (state === "reinforced") return "reforca";
  if (state === "gap") return "lacuna conhecida";
  if (state === "risk") return "risco conhecido";
  return "dado indisponivel";
}

function topFavorableSignal(recommendation: PickRecommendation): string {
  return (
    recommendation.reasons[0]?.detail ??
    strategicCompactSummary(recommendation) ??
    "Sem motivo favoravel destacado"
  );
}

function principalLimitation(recommendation: PickRecommendation): string {
  return (
    recommendation.warnings[0]?.detail ??
    recommendation.metricDetails.find((metric) => metric.status === "UNAVAILABLE")
      ?.unavailableReason ??
    "Nenhuma limitacao adicional registrada"
  );
}

function formatCoverage(value?: number): string {
  return value !== undefined && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : "indisponivel";
}

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    None: "Cliente aberto, sem lobby",
    Lobby: "Lobby aberto",
    Matchmaking: "Na fila",
    ReadyCheck: "Partida encontrada",
    ChampSelect: "Champion Select iniciado",
    GameStart: "Draft encerrado",
    InProgress: "Partida em andamento",
    EndOfGame: "Partida encerrada",
    Manual: "Simulacao manual"
  };
  return labels[phase] ?? phase;
}

function championSelectOperationalState(status: LcuReadStatus, phase: LcuGameflowPhase | null) {
  const unavailable = !["OK", "OUTSIDE_CHAMP_SELECT"].includes(status);
  if (status === "CLIENT_CLOSED" || status === "LOCKFILE_MISSING") {
    return {
      title: "Aguardando sua selecao de campeoes",
      heading: "League nao detectado",
      description:
        "Abra o League Client. O Sparta apenas observa a sessao local e nunca escolhe ou trava campeoes.",
      badge: "League Client fechado",
      badgeState: "offline" as const,
      error: false
    };
  }
  if (unavailable) {
    return {
      title: "Leitura do League indisponivel",
      heading: "A LCU nao respondeu de forma estavel",
      description: `Estado ${status}. A interface local do League nao possui garantia oficial de estabilidade; nenhum dado ausente sera inferido.`,
      badge: "LCU indisponivel",
      badgeState: "warning" as const,
      error: true
    };
  }
  return {
    title: "Aguardando sua selecao de campeoes",
    heading: phase ? phaseLabel(phase) : "Cliente aberto, fase desconhecida",
    description:
      "O Champion Select ainda nao comecou. Esta tela muda automaticamente quando a sessao aparecer.",
    badge: phase ? phaseLabel(phase) : "Cliente aberto",
    badgeState: "warning" as const,
    error: false
  };
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

function officialPatchFromGameVersion(patch?: string): string | undefined {
  const match = patch?.match(/^(\d{1,2})\.(\d{1,2})/);
  if (!match) return undefined;
  const major = Number(match[1]);
  const officialMajor = major >= 15 && major < 20 ? major + 10 : major;
  return `${officialMajor}.${Number(match[2])}`;
}

function patchIndicator(
  changes: PatchChange[]
): { label: string; tone: "positive" | "negative" | "warning" | "neutral" } | undefined {
  const types = new Set(changes.map((change) => change.changeType));
  if (types.has("ADJUSTMENT") || (types.has("BUFF") && types.has("NERF"))) {
    return { label: "Ajustado neste patch", tone: "warning" };
  }
  if (types.has("BUFF")) return { label: "Buff oficial neste patch", tone: "positive" };
  if (types.has("NERF")) return { label: "Nerf oficial neste patch", tone: "negative" };
  if (types.has("BUGFIX")) return { label: "Correção oficial neste patch", tone: "neutral" };
  return undefined;
}
