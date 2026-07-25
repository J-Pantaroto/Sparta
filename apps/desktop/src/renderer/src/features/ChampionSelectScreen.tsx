import type { DraftState, PickRecommendation, Role } from "@sparta/core";
import { Crosshair, Swords } from "lucide-react";
import { useState } from "react";
import { metricLabels, ROLES, roleLabels } from "../app/labels";
import type { DataDragonChampionSummary } from "../services/datadragon";
import { ThemedPageHero } from "../theme/ThemedPageHero";
import {
  Badge,
  Button,
  Card,
  ChampionAvatar,
  ChampionGrid,
  EmptyState,
  ErrorState,
  Field,
  Grid,
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
  StatusBadge,
  Toolbar
} from "../ui";
import { BuildPanel } from "./BuildPanel";

const MAX_ENEMIES = 5;

interface ChampionSelectScreenProps {
  draft: DraftState;
  setDraft: (draft: DraftState) => void;
  autoPickOrder: number | null;
  autoPlayerRole: Role | null;
  champSelectActive: boolean;
  recommendations: PickRecommendation[];
  recommendationsStatus: string;
  noAccountLinked: boolean;
  ddragonVersion: string;
}

export function ChampionSelectScreen({
  draft,
  setDraft,
  autoPickOrder,
  autoPlayerRole,
  champSelectActive,
  recommendations,
  recommendationsStatus,
  noAccountLinked,
  ddragonVersion
}: ChampionSelectScreenProps) {
  const [confirmedChampion, setConfirmedChampion] = useState<{ championId: number; championName: string } | null>(null);
  // Simulacao manual: so quando NAO ha sessao real detectada (com sessao a
  // tela abre direto). Existe pra dar pra testar sem o League aberto.
  const [devOverride, setDevOverride] = useState(false);

  function toggleEnemy(champion: DataDragonChampionSummary) {
    const alreadyPicked = draft.enemies.some((enemy) => enemy.championId === champion.id);
    if (alreadyPicked) {
      setDraft({ ...draft, enemies: draft.enemies.filter((enemy) => enemy.championId !== champion.id) });
      return;
    }
    if (draft.enemies.length >= MAX_ENEMIES) return;
    // `role` e obrigatorio no tipo mas nao e usado pelo motor de build (so
    // championId importa) - placeholder, mesmo padrao de antes.
    setDraft({
      ...draft,
      enemies: [...draft.enemies, { championId: champion.id, championName: champion.name, role: "MID", team: "enemy" }]
    });
  }

  function confirmChampion(recommendation: PickRecommendation) {
    setConfirmedChampion({ championId: recommendation.championId, championName: recommendation.championName });
    setDraft({ ...draft, selectedChampionId: recommendation.championId });
  }

  // Champion Select nao e modulo de uso livre (feedback do usuario): sem
  // sessao real e sem o usuario pedir simulacao, mostra a espera.
  if (!champSelectActive && !devOverride) {
    return (
      <PageLayout>
        <ThemedPageHero
          eyebrow="Champion Select"
          title="Aguardando sua seleção de campeões"
          meta={<StatusBadge state="offline">Nenhuma seleção de campeões ativa</StatusBadge>}
        />
        <Card>
          <EmptyState
            icon={<Crosshair size={22} />}
            title="Esta tela abre sozinha"
            description="Assim que o cliente do League entrar em seleção de campeões, o Sparta detecta a sua posição, a ordem de pick e o time inimigo, e traz as recomendações aqui."
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
            <StatusBadge state="live">Detectado via League Client</StatusBadge>
          ) : (
            <StatusBadge state="warning">Modo manual (simulação)</StatusBadge>
          )
        }
      />

      {noAccountLinked && (
        <Card tone="flat" pad="sm">
          <SignalChip tone="info">
            Sem conta Riot vinculada — as recomendações usam a referência geral do papel, não seu histórico.
          </SignalChip>
        </Card>
      )}

      <Card pad="sm">
        <Toolbar>
          <Field label="Posição">
            {autoPlayerRole !== null ? (
              <ReadOnlyValue>{roleLabels[autoPlayerRole]}</ReadOnlyValue>
            ) : (
              <Select<Role>
                value={draft.playerRole}
                onChange={(role) => setDraft({ ...draft, playerRole: role })}
                options={ROLES.map((role) => ({ value: role, label: roleLabels[role] }))}
                ariaLabel="Posição"
              />
            )}
          </Field>
          <Field label="Ordem de pick">
            {autoPickOrder !== null ? (
              <ReadOnlyValue>{autoPickOrder}</ReadOnlyValue>
            ) : (
              <NumberField
                value={draft.pickOrder}
                min={1}
                max={5}
                onChange={(value) => setDraft({ ...draft, pickOrder: value })}
                ariaLabel="Ordem de pick"
              />
            )}
          </Field>
        </Toolbar>
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

      {recommendations.length > 0 && (
        <Grid cols={2}>
          {recommendations.map((recommendation, index) => {
            const topMetrics = Object.entries(recommendation.metrics)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4);
            const confirmed = confirmedChampion?.championId === recommendation.championId;
            return (
              <Card tone={index === 0 ? "feature" : "default"} key={recommendation.championId}>
                <SectionHeader
                  eyebrow={index === 0 ? "Melhor escolha" : recommendation.category}
                  title={
                    <>
                      <ChampionAvatar
                        championId={recommendation.championId}
                        ddragonVersion={ddragonVersion}
                        size="sm"
                        alt={recommendation.championName}
                      />
                      {recommendation.championName}
                    </>
                  }
                  actions={<ScoreBadge score={recommendation.totalScore} />}
                />
                <div style={{ display: "grid", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
                  {topMetrics.map(([key, value]) => (
                    <StatBar
                      key={key}
                      label={metricLabels[key] ?? key}
                      value={value}
                      value_label={`${Math.round(value)}`}
                    />
                  ))}
                </div>
                <SignalChipList stacked>
                  {recommendation.reasons.map((reason) => (
                    <SignalChip key={reason.code} tone="positive" title={reason.detail}>
                      {reason.label}
                    </SignalChip>
                  ))}
                  {recommendation.warnings.map((warning) => (
                    <SignalChip key={warning.code} tone="negative" title={warning.detail}>
                      {warning.label}
                    </SignalChip>
                  ))}
                </SignalChipList>
                <div style={{ marginTop: "var(--space-4)" }}>
                  <Button
                    variant={confirmed ? "confirmed" : "primary"}
                    onClick={() => confirmChampion(recommendation)}
                  >
                    {confirmed ? "Campeão confirmado" : "Confirmar campeão"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </Grid>
      )}

      <Card>
        <SectionHeader
          eyebrow="Contexto do draft"
          title={
            <>
              <Swords size={16} /> Time inimigo
            </>
          }
          description="Selecione os campeões inimigos já revelados — a build sugerida se ajusta ao que você marcar."
          actions={
            <Badge tone={draft.enemies.length > 0 ? "accent" : "neutral"}>
              {draft.enemies.length}/{MAX_ENEMIES}
            </Badge>
          }
        />
        <ChampionGrid
          ddragonVersion={ddragonVersion}
          onSelect={toggleEnemy}
          isSelected={(champion) => draft.enemies.some((enemy) => enemy.championId === champion.id)}
          isDisabled={() => draft.enemies.length >= MAX_ENEMIES}
        />
      </Card>

      {confirmedChampion && (
        <BuildPanel confirmedChampion={confirmedChampion} enemies={draft.enemies} ddragonVersion={ddragonVersion} />
      )}
    </PageLayout>
  );
}
