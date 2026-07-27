import { summarizeEnemyDamageLean, type ChampionClassProfile, type DraftState } from "@sparta/core";
import { Info, Shield } from "lucide-react";
import { roleLabels } from "../app/labels";
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
  Columns,
  EmptyAvatarSlot,
  EmptyState,
  InlineStat,
  InlineStats,
  PageHero,
  PageLayout,
  SectionHeader,
  SignalChip,
  SignalChipList,
  StatBar
} from "../ui";
import { BuildPanel } from "./BuildPanel";

const MAX_ENEMIES = 5;

/**
 * Preparação objetiva pro confronto que acabou de ser escolhido. Tudo que é
 * derivado de dado real (campeão, inimigos revelados, inclinação de dano da
 * composição) fica separado do texto de orientação geral, que é estático e
 * está marcado como tal - a rota `/drafts/pre-game-analysis` ainda não usa
 * dado real, e apresentar as duas coisas iguais faria o texto fixo parecer
 * uma análise personalizada.
 */
export function PreGameScreen({ draft, ddragonVersion }: { draft: DraftState; ddragonVersion: string }) {
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

  if (!ownChampion) {
    return (
      <PageLayout>
        <PageHero eyebrow="Pré-game" title="Análise pré-game" />
        <Card>
          <EmptyState
            icon={<Shield size={22} />}
            title="Nenhum campeão confirmado"
            description="Confirme seu campeão no Champion Select pra ver aqui o resumo do confronto, a composição inimiga e a build sugerida."
          />
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHero
        variant="feature"
        eyebrow="Pré-game"
        title={ownChampion.name}
        subtitle={
          // Sem posição identificada o texto não afirma uma - o Pré-game é
          // aberto depois de confirmar o campeão, e a posição pode não ter
          // sido informada.
          draft.playerRole ? `Preparação pro confronto em ${roleLabels[draft.playerRole]}.` : "Preparação pro confronto."
        }
        artUrl={heroSplash}
        aside={
          <ChampionAvatar
            championId={ownChampion.id}
            slug={ownChampion.key}
            ddragonVersion={ddragonVersion}
            size="xl"
            alt={ownChampion.name}
            ring
          />
        }
        meta={
          <InlineStats>
            <InlineStat label="Posição" value={draft.playerRole ? roleLabels[draft.playerRole] : "Não identificada"} />
            <InlineStat label="Inimigos revelados" value={`${enemyChampions.length}/${MAX_ENEMIES}`} />
            <InlineStat
              label="Perfil de dano inimigo"
              value={
                enemyLean
                  ? enemyLean.lean === "MAGIC"
                    ? "Predominante mágico"
                    : enemyLean.lean === "BALANCED"
                      ? "Equilibrado"
                      : "Predominante físico"
                  : "Sem dado"
              }
              muted={!enemyLean}
            />
          </InlineStats>
        }
      />

      <Columns
        asideWidth="360px"
        main={
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            <Card>
              <SectionHeader
                title="Composição inimiga"
                description="Só o que já foi revelado — a leitura muda conforme os picks aparecem."
                actions={
                  enemyLean &&
                  enemyLean.lean !== "BALANCED" && (
                    <Badge tone="accent">{enemyLean.lean === "MAGIC" ? "Foco mágico" : "Foco físico"}</Badge>
                  )
                }
              />
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-5)" }}>
                {Array.from({ length: MAX_ENEMIES }, (_, index) => {
                  const champion = enemyChampions[index];
                  if (!champion) {
                    return <EmptyAvatarSlot key={`empty-${index}`} size="lg" label="Inimigo ainda não revelado" />;
                  }
                  return (
                    <div key={champion.id} style={{ textAlign: "center", minWidth: 0 }}>
                      <ChampionAvatar
                        championId={champion.id}
                        slug={champion.key}
                        ddragonVersion={ddragonVersion}
                        size="lg"
                        alt={champion.name}
                      />
                      <span
                        className="sp-truncate"
                        style={{
                          display: "block",
                          marginTop: "var(--space-2)",
                          maxWidth: 56,
                          color: "var(--text-secondary)",
                          fontSize: "var(--text-xs)"
                        }}
                      >
                        {champion.name}
                      </span>
                    </div>
                  );
                })}
              </div>

              {enemyLean ? (
                <>
                  {/* Escala 0-10 da Data Dragon convertida pra 0-100, pra as
                      duas barras serem comparáveis entre si. */}
                  <div style={{ display: "grid", gap: "var(--space-3)" }}>
                    <StatBar
                      label="Dano mágico (média do time)"
                      value={enemyLean.magicAvg * 10}
                      value_label={`${enemyLean.magicAvg}/10`}
                    />
                    <StatBar
                      label="Dano físico (média do time)"
                      value={enemyLean.attackAvg * 10}
                      value_label={`${enemyLean.attackAvg}/10`}
                    />
                  </div>
                  <div style={{ marginTop: "var(--space-4)" }}>
                    <SignalChip tone="info">
                      {enemyLean.lean === "BALANCED"
                        ? "Composição equilibrada entre dano físico e mágico — resistência dos dois tipos tende a valer mais que focar em um só."
                        : enemyLean.lean === "MAGIC"
                          ? "Composição inclinada a dano mágico — resistência mágica rende mais que armadura neste draft."
                          : "Composição inclinada a dano físico — armadura rende mais que resistência mágica neste draft."}
                    </SignalChip>
                  </div>
                </>
              ) : (
                <EmptyState
                  inline
                  title="Sem inimigos revelados"
                  description="Marque os campeões inimigos no Champion Select pra o Sparta ler a composição."
                />
              )}
            </Card>

            <Card tone="flat">
              <SectionHeader
                eyebrow={
                  <>
                    <Info size={12} /> Orientação geral
                  </>
                }
                title="Prioridades da partida"
                description="Ainda não é uma análise do seu draft: é a orientação padrão do Sparta. A rota de análise pré-game do backend continua estática — está marcada assim de propósito, pra não parecer personalizada."
              />
              <SignalChipList stacked>
                <SignalChip tone="info">Jogar por prioridade no mid antes de objetivos.</SignalChip>
                <SignalChip tone="info">Preparar visão com antecedência em volta do próximo objetivo.</SignalChip>
                <SignalChip tone="info">Usar janelas de ultimate pra forçar lutas agrupadas.</SignalChip>
              </SignalChipList>
            </Card>
          </div>
        }
        aside={
          <BuildPanel
            confirmedChampion={{ championId: ownChampion.id, championName: ownChampion.name }}
            enemies={draft.enemies}
            ddragonVersion={ddragonVersion}
          />
        }
      />
    </PageLayout>
  );
}
