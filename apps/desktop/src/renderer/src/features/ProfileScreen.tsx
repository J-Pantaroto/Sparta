import { scoreChampionPerformance } from "@sparta/core";
import { UserPlus } from "lucide-react";
import { roleLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchPlayerProfile, type PlayerProfileResponse, type RiotAccountSummary } from "../services/api-client";
import { ThemedPageHero } from "../theme/ThemedPageHero";
import {
  Card,
  ChampionAvatar,
  DataRow,
  DataTable,
  EmptyState,
  ErrorState,
  IdentityCell,
  Loading,
  NumCell,
  PageLayout,
  ScoreBadge,
  SectionHeader,
  SignalChip,
  SignalChipList,
  StatBar
} from "../ui";

interface ProfileScreenProps {
  riotAccounts: RiotAccountSummary[];
  ddragonVersion: string;
}

const COLUMNS = "minmax(0, 1.5fr) 100px 90px minmax(0, 1.6fr)";

export function ProfileScreen({ riotAccounts, ddragonVersion }: ProfileScreenProps) {
  const account = riotAccounts[0];
  const profile = useAsyncData<PlayerProfileResponse>(
    () => (account ? fetchPlayerProfile(account.gameName, account.tagLine) : undefined),
    [account?.gameName, account?.tagLine]
  );

  if (!account) {
    return (
      <PageLayout>
        <ThemedPageHero eyebrow="Perfil" title="Perfil do jogador" />
        <Card>
          <EmptyState
            icon={<UserPlus size={22} />}
            title="Nenhuma conta Riot vinculada"
            description="Vincule sua conta pra ver seu desempenho real por campeão."
          />
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <ThemedPageHero eyebrow="Perfil do jogador" title={`${account.gameName}#${account.tagLine}`} />

      {profile.status === "loading" && (
        <Card>
          <Loading block />
        </Card>
      )}
      {profile.status === "error" && (
        <Card>
          <ErrorState inline description={profile.error ?? undefined} />
        </Card>
      )}

      {profile.data && (
        <>
          <DataTable
            columns={COLUMNS}
            head={
              <>
                <span>Campeão</span>
                <span>Partidas</span>
                <span>Vitórias</span>
                <span>Desempenho</span>
              </>
            }
          >
            {profile.data.championStats.map((champion) => {
              const performance = scoreChampionPerformance(champion);
              return (
                <DataRow key={`${champion.championId}-${champion.role}`}>
                  <IdentityCell
                    avatar={
                      <ChampionAvatar
                        championId={champion.championId}
                        ddragonVersion={ddragonVersion}
                        alt={champion.championName}
                      />
                    }
                    name={champion.championName}
                    meta={roleLabels[champion.role]}
                    trailing={performance.eligible ? <ScoreBadge score={performance.score} size="xs" /> : undefined}
                  />
                  <NumCell>{champion.games}</NumCell>
                  <NumCell strong>{Math.round((champion.wins / champion.games) * 100)}%</NumCell>
                  <div style={{ display: "grid", gap: "var(--space-1)" }}>
                    <StatBar label="KDA" value={performance.components.kda} />
                    <StatBar label="CS/min" value={performance.components.cs} />
                    <StatBar label="Dano/min" value={performance.components.damage} />
                  </div>
                </DataRow>
              );
            })}
          </DataTable>

          <Card>
            <SectionHeader title="Pontos fortes e fracos" />
            {profile.data.strengths.length === 0 && profile.data.weaknesses.length === 0 ? (
              <EmptyState
                inline
                title="Sem histórico suficiente"
                description="O Sparta precisa de mais partidas sincronizadas pra apontar pontos fortes e fracos."
              />
            ) : (
              <SignalChipList>
                {profile.data.strengths.map((strength) => (
                  <SignalChip key={strength.code} tone="positive">
                    {strength.detail}
                  </SignalChip>
                ))}
                {profile.data.weaknesses.map((weakness) => (
                  <SignalChip key={weakness.code} tone="negative">
                    {weakness.detail}
                  </SignalChip>
                ))}
              </SignalChipList>
            )}
          </Card>
        </>
      )}
    </PageLayout>
  );
}
