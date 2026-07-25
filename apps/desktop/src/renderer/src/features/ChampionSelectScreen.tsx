import { MIN_GAMES_FOR_RANKING, type DraftState, type PickRecommendation, type Role } from "@sparta/core";
import { Check, Crosshair, Pencil, X } from "lucide-react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ROLES, categoryLabels, confidenceLabels, metricLabels, roleLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchPlayerProfile, type PlayerProfileResponse, type RiotAccountSummary } from "../services/api-client";
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
  NumberField,
  PageLayout,
  ReadOnlyValue,
  ScoreBadge,
  SectionHeader,
  Select,
  SignalChip,
  SignalChipList,
  StatBar,
  StatusBadge
} from "../ui";
import { BuildPanel } from "./BuildPanel";
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
  recommendationsStatus: string;
  noAccountLinked: boolean;
  ddragonVersion: string;
  riotAccounts: RiotAccountSummary[];
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
  recommendationsStatus,
  noAccountLinked,
  ddragonVersion,
  riotAccounts,
  draftAutoFilled
}: ChampionSelectScreenProps) {
  const [confirmedChampion, setConfirmedChampion] = useState<{ championId: number; championName: string } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingEnemies, setEditingEnemies] = useState(false);
  // Simulação manual: só quando NÃO há sessão real detectada (com sessão a
  // tela abre direto). Existe pra dar pra testar sem o League aberto.
  const [devOverride, setDevOverride] = useState(false);

  // So e consultado pra explicar uma lista vazia: sem isso a tela nao
  // tem como dizer QUANTAS partidas faltam pro campeao entrar no corte.
  const account = riotAccounts[0];
  const profile = useAsyncData<PlayerProfileResponse>(
    () => (account ? fetchPlayerProfile(account.gameName, account.tagLine) : undefined),
    [account?.gameName, account?.tagLine]
  );

  // A recomendação #1 muda conforme o draft evolui; sem seleção explícita, o
  // detalhe acompanha o topo da lista em vez de ficar preso num campeão que
  // já não é mais o melhor.
  const selected =
    recommendations.find((recommendation) => recommendation.championId === selectedId) ?? recommendations[0];

  useEffect(() => {
    if (selectedId !== null && !recommendations.some((item) => item.championId === selectedId)) {
      setSelectedId(null);
    }
  }, [recommendations, selectedId]);

  function toggleEnemy(champion: DataDragonChampionSummary) {
    setDraft((current) => {
      const alreadyPicked = current.enemies.some((enemy) => enemy.championId === champion.id);
      if (alreadyPicked) {
        return { ...current, enemies: current.enemies.filter((enemy) => enemy.championId !== champion.id) };
      }
      if (current.enemies.length >= MAX_ENEMIES) return current;
      // `role` é obrigatório no tipo mas não é usado pelo motor de build (só
      // championId importa) - placeholder, mesmo padrão de antes.
      return {
        ...current,
        enemies: [
          ...current.enemies,
          { championId: champion.id, championName: champion.name, role: "MID" as const, team: "enemy" as const }
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
    setConfirmedChampion({ championId: recommendation.championId, championName: recommendation.championName });
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
          meta={<StatusBadge state="offline">League Client sem seleção de campeões ativa</StatusBadge>}
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
          Sem conta Riot vinculada — as recomendações usam a referência geral do papel, não seu histórico.
        </SignalChip>
      )}

      <Card pad="md">
        <div className="sp-draftbar">
          <div className="sp-draftbar__field">
            <Field label="Posição">
              {autoPlayerRole !== null ? (
                <ReadOnlyValue>{roleLabels[autoPlayerRole]}</ReadOnlyValue>
              ) : (
                <Select<Role>
                  value={draft.playerRole}
                  onChange={(role) => setDraft((current) => ({ ...current, playerRole: role }))}
                  options={ROLES.map((role) => ({ value: role, label: roleLabels[role] }))}
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
                if (!enemy) return <EmptyAvatarSlot key={`empty-${index}`} label="Inimigo ainda não revelado" />;
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
              isSelected={(champion) => draft.enemies.some((enemy) => enemy.championId === champion.id)}
              isDisabled={() => draft.enemies.length >= MAX_ENEMIES}
            />
          </div>
        )}
      </Card>

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

      {recommendations.length === 0 && recommendationsStatus !== "loading" ? (
        <Card>
          <NoRecommendations
            role={draft.playerRole}
            championStats={profile.data?.championStats ?? []}
            ddragonVersion={ddragonVersion}
          />
        </Card>
      ) : (
        recommendations.length > 0 && (
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
                    {index === 0 && <span className="sp-rec__rank">TOP</span>}
                    <div className="sp-rec">
                      <ChampionAvatar
                        championId={recommendation.championId}
                        ddragonVersion={ddragonVersion}
                        alt={recommendation.championName}
                        ring={confirmedChampion?.championId === recommendation.championId}
                      />
                      <span style={{ minWidth: 0 }}>
                        <strong className="sp-rec__name">{recommendation.championName}</strong>
                        <span className="sp-rec__category">{categoryLabels[recommendation.category]}</span>
                      </span>
                      <ScoreBadge score={recommendation.totalScore} size="xs" />
                    </div>
                  </InteractiveCard>
                ))}
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
                          <Badge tone="neutral">confiança {confidenceLabels[selected.confidence]}</Badge>
                        </div>
                      </div>
                      <ScoreBadge score={selected.totalScore} size="lg" />
                    </div>

                    <SectionHeader
                      title="Por que este pick"
                      description="Cada dimensão vale 0 a 100 e entra no score com o peso do cenário de draft atual."
                    />
                    <div className="sp-recdetail__metrics">
                      {Object.entries(selected.metrics)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, value]) => (
                          <StatBar
                            key={key}
                            label={metricLabels[key] ?? key}
                            value={value}
                            value_label={Math.round(value).toString()}
                          />
                        ))}
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
                        variant={confirmedChampion?.championId === selected.championId ? "confirmed" : "primary"}
                        size="lg"
                        icon={confirmedChampion?.championId === selected.championId ? <Check size={16} /> : undefined}
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
        )
      )}
    </PageLayout>
  );
}

/**
 * Lista vazia explicada com numero real. O motor so pontua campeao com pelo
 * menos `MIN_GAMES_FOR_RANKING` partidas NAQUELA posicao (abaixo disso
 * `scoreChampionPerformance` devolve 0 e o campeao e descartado) - a versao
 * anterior desta tela culpava a tabela de atributos do Sparta, o que era
 * falso: campeao sem atributo entra na lista normalmente, so com metricas
 * neutras.
 */
function NoRecommendations({
  role,
  championStats,
  ddragonVersion
}: {
  role: Role;
  championStats: PlayerProfileResponse["championStats"];
  ddragonVersion: string;
}) {
  const naPosicao = championStats
    .filter((champion) => champion.role === role)
    .sort((a, b) => b.games - a.games)
    .slice(0, 3);

  return (
    <EmptyState
      icon={<Crosshair size={22} />}
      title={`Ainda sem amostra suficiente em ${roleLabels[role]}`}
      description={`O Sparta só recomenda um campeão depois de ${MIN_GAMES_FOR_RANKING} partidas com ele nessa posição — abaixo disso a comparação não se sustenta, e ele prefere não sugerir a inventar uma escolha.`}
      actions={
        naPosicao.length > 0 && (
          <div style={{ display: "grid", gap: "var(--space-2)", justifyItems: "start" }}>
            {naPosicao.map((champion) => (
              <div
                key={`${champion.championId}-${champion.role}`}
                style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}
              >
                <ChampionAvatar
                  championId={champion.championId}
                  ddragonVersion={ddragonVersion}
                  size="sm"
                  alt={champion.championName}
                />
                <span>{champion.championName}</span>
                <Badge tone="neutral">
                  {champion.games} de {MIN_GAMES_FOR_RANKING} partidas
                </Badge>
              </div>
            ))}
          </div>
        )
      }
    />
  );
}
