import { rankChampionPool } from "@sparta/core";
import { UserPlus } from "lucide-react";
import { confidenceLabels, formTrendLabels, roleLabels, severityLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchPlayerProfile, type PlayerProfileResponse, type RiotAccountSummary } from "../services/api-client";
import { ThemedPageHero } from "../theme/ThemedPageHero";
import {
  Badge,
  Card,
  ChampionAvatar,
  EmptyState,
  ErrorState,
  Grid,
  InlineStat,
  InlineStats,
  Loading,
  PageLayout,
  ScoreBadge,
  ScoreBlock,
  SectionHeader,
  SignalChip,
  SignalChipList
} from "../ui";

interface DashboardScreenProps {
  riotAccounts: RiotAccountSummary[];
  ddragonVersion: string;
}

export function DashboardScreen({ riotAccounts, ddragonVersion }: DashboardScreenProps) {
  const account = riotAccounts[0];

  const profile = useAsyncData<PlayerProfileResponse>(
    () => (account ? fetchPlayerProfile(account.gameName, account.tagLine) : undefined),
    [account?.gameName, account?.tagLine]
  );

  const rankedChampions = profile.data ? rankChampionPool(profile.data.championStats) : [];
  const topChampions = rankedChampions.slice(0, 3);
  const topChampion = topChampions[0];
  const recentForm = profile.data?.recentForm;
  const strengths = profile.data?.strengths ?? [];
  const weaknesses = profile.data?.weaknesses ?? [];

  return (
    <PageLayout>
      <ThemedPageHero
        variant="feature"
        eyebrow={account ? `${account.gameName}#${account.tagLine}` : "Sem conta vinculada"}
        title="Seu estado de jogo"
        subtitle="Escolhas melhores antes da partida, revisões melhores depois."
        aside={recentForm && <ScoreBlock score={recentForm.last10Score} label="Forma (10)" size="lg" />}
        meta={
          recentForm && (
            <InlineStats>
              <InlineStat label="Tendência" value={formTrendLabels[recentForm.trend] ?? recentForm.trend} />
              <InlineStat label="Confiança" value={confidenceLabels[recentForm.confidence]} />
              <InlineStat label="Campeões analisados" value={rankedChampions.length} />
            </InlineStats>
          )
        }
      />

      {!account && (
        <Card>
          <EmptyState
            icon={<UserPlus size={22} />}
            title="Nenhuma conta Riot vinculada"
            description="Vincule sua conta pra o Sparta analisar seu histórico real de partidas."
          />
        </Card>
      )}

      {profile.status === "loading" && (
        <Card>
          <Loading block label="Carregando seu perfil..." />
        </Card>
      )}
      {profile.status === "error" && (
        <Card>
          <ErrorState inline description={profile.error ?? undefined} />
        </Card>
      )}

      {recentForm && (
        <Card>
          <SectionHeader
            title="Forma recente"
            description="Score ponderado por recência — quanto mais recente a partida, mais peso ela tem."
          />
          <InlineStats>
            <ScoreBlock score={recentForm.last10Score} label="Últimas 10" />
            <ScoreBlock score={recentForm.last20Score} label="Últimas 20" />
            <ScoreBlock score={recentForm.last50Score} label="Últimas 50" />
          </InlineStats>
        </Card>
      )}

      <Grid cols={2}>
        <Card>
          <SectionHeader title="Ponto forte" eyebrow="O que sustenta seus jogos" />
          {strengths[0] ? (
            <InlineStats>
              <InlineStat label={`confiança ${confidenceLabels[strengths[0].confidence]}`} value={strengths[0].label} />
            </InlineStats>
          ) : (
            <EmptyState inline title="Sem dado suficiente" />
          )}
        </Card>
        <Card>
          <SectionHeader title="Risco atual" eyebrow="O que mais custa partidas" />
          {weaknesses[0] ? (
            <InlineStats>
              <InlineStat label={`severidade ${severityLabels[weaknesses[0].severity]}`} value={weaknesses[0].label} />
            </InlineStats>
          ) : (
            <EmptyState inline title="Sem dado suficiente" />
          )}
        </Card>
      </Grid>

      {topChampions.length > 0 && (
        <Card>
          <SectionHeader
            title="Seus melhores campeões"
            actions={topChampion && <Badge tone="accent">Melhor: {topChampion.championName}</Badge>}
          />
          <Grid cols={3}>
            {topChampions.map((champion) => (
              <Card tone="inset" pad="sm" key={`${champion.championId}-${champion.role}`}>
                <InlineStats>
                  <ChampionAvatar
                    championId={champion.championId}
                    ddragonVersion={ddragonVersion}
                    alt={champion.championName}
                  />
                  <InlineStat label={roleLabels[champion.role]} value={champion.championName} />
                  <ScoreBadge score={champion.score} size="sm" />
                </InlineStats>
              </Card>
            ))}
          </Grid>
        </Card>
      )}

      {(strengths.length > 0 || weaknesses.length > 0) && (
        <Card>
          <SectionHeader title="Sinais do seu histórico" />
          <SignalChipList>
            {strengths.map((strength) => (
              <SignalChip key={strength.code} tone="positive">
                {strength.detail}
              </SignalChip>
            ))}
            {weaknesses.map((weakness) => (
              <SignalChip key={weakness.code} tone="negative">
                {weakness.detail}
              </SignalChip>
            ))}
          </SignalChipList>
        </Card>
      )}
    </PageLayout>
  );
}
