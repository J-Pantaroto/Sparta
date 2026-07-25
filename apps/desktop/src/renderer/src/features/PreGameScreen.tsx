import { summarizeEnemyDamageLean, type ChampionClassProfile, type DraftState } from "@sparta/core";
import { Shield } from "lucide-react";
import { useAsyncData } from "../hooks/use-async-data";
import {
  championSplashUrl,
  fetchAllChampions,
  fetchChampionClassProfiles,
  type DataDragonChampionSummary
} from "../services/datadragon";
import {
  Badge,
  Card,
  ChampionAvatar,
  EmptyState,
  InlineStat,
  InlineStats,
  PageHero,
  PageLayout,
  SectionHeader,
  SignalChip
} from "../ui";

interface PreGameScreenProps {
  draft: DraftState;
  ddragonVersion: string;
}

export function PreGameScreen({ draft, ddragonVersion }: PreGameScreenProps) {
  const catalog = useAsyncData<DataDragonChampionSummary[]>(
    () => fetchAllChampions(ddragonVersion),
    [ddragonVersion]
  );
  const classProfiles = useAsyncData<ChampionClassProfile[]>(
    () => fetchChampionClassProfiles(ddragonVersion),
    [ddragonVersion]
  );

  const ownChampion = catalog.data?.find((champion) => champion.id === draft.selectedChampionId);
  const enemyChampions = draft.enemies
    .map((enemy) => catalog.data?.find((champion) => champion.id === enemy.championId))
    .filter((champion): champion is DataDragonChampionSummary => champion !== undefined);
  const enemyProfiles = draft.enemies
    .map((enemy) => classProfiles.data?.find((profile) => profile.championId === enemy.championId))
    .filter((profile): profile is ChampionClassProfile => profile !== undefined);
  const enemyLean = classProfiles.data ? summarizeEnemyDamageLean(enemyProfiles) : undefined;
  const heroSplash = ownChampion ? championSplashUrl(ownChampion.key, 0) : undefined;

  return (
    <PageLayout>
      <PageHero
        eyebrow="Pré-game"
        title={ownChampion ? ownChampion.name : "Análise pré-game"}
        subtitle={ownChampion ? "Preparação pro confronto que você acabou de escolher." : undefined}
        artUrl={heroSplash}
        aside={
          ownChampion && (
            <ChampionAvatar
              championId={ownChampion.id}
              slug={ownChampion.key}
              ddragonVersion={ddragonVersion}
              size="xl"
              alt={ownChampion.name}
              ring
            />
          )
        }
      />

      {!ownChampion && (
        <Card>
          <EmptyState
            icon={<Shield size={22} />}
            title="Nenhum campeão confirmado"
            description="Confirme seu campeão no Champion Select pra ver o resumo do confronto aqui."
          />
        </Card>
      )}

      {enemyChampions.length > 0 && (
        <Card>
          <SectionHeader
            title="Time inimigo"
            actions={
              enemyLean &&
              enemyLean.lean !== "BALANCED" && (
                <Badge tone="accent">
                  {enemyLean.lean === "MAGIC" ? "Foco mágico" : "Foco físico"}
                </Badge>
              )
            }
          />
          <InlineStats>
            {enemyChampions.map((champion) => (
              <div key={champion.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <ChampionAvatar
                  championId={champion.id}
                  slug={champion.key}
                  ddragonVersion={ddragonVersion}
                  size="sm"
                  alt={champion.name}
                />
                <span>{champion.name}</span>
              </div>
            ))}
          </InlineStats>
          {enemyLean && (
            <div style={{ marginTop: "var(--space-4)" }}>
              <InlineStats>
                <InlineStat label="Dano mágico (méd.)" value={`${enemyLean.magicAvg}/10`} />
                <InlineStat label="Dano físico (méd.)" value={`${enemyLean.attackAvg}/10`} />
              </InlineStats>
            </div>
          )}
        </Card>
      )}

      <Card tone="flat">
        <SectionHeader
          eyebrow="Orientação geral"
          title="Condição de vitória"
          description="Ainda não é uma análise personalizada do seu draft — é a orientação padrão do Sparta enquanto a rota de análise pré-game não usa dado real."
        />
        <SignalChip tone="info">
          Jogar por prioridade no mid, preparar visão antes dos objetivos e usar janelas de ultimate para lutas
          agrupadas.
        </SignalChip>
      </Card>
    </PageLayout>
  );
}
