import {
  MIN_GAMES_FOR_RANKING,
  calculateKda,
  roleBaselines,
  scoreChampionPerformance,
  type PlayerChampionStats,
  type Role
} from "@sparta/core";
import { MousePointerClick, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { ROLES, componentLabels, confidenceLabels, roleLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchPlayerProfile, type PlayerProfileResponse, type RiotAccountSummary } from "../services/api-client";
import { ThemedPageHero } from "../theme/ThemedPageHero";
import {
  Badge,
  Card,
  ChampionAvatar,
  Columns,
  DataRow,
  DataTable,
  EmptyState,
  ErrorState,
  IdentityCell,
  InlineStat,
  InlineStats,
  Loading,
  NumCell,
  PageLayout,
  ScoreBadge,
  ScoreBlock,
  SearchInput,
  SectionHeader,
  SegmentedControl,
  Select,
  SignalChip,
  SignalChipList,
  SkeletonRows,
  StatBar,
  Toolbar,
  ToolbarSpacer
} from "../ui";

type RoleFilter = Role | "ALL";
type SortKey = "score" | "games" | "winrate" | "name";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "score", label: "Maior desempenho" },
  { value: "games", label: "Mais partidas" },
  { value: "winrate", label: "Maior winrate" },
  { value: "name", label: "Nome (A-Z)" }
];

const COLUMNS = "minmax(0, 1.4fr) 84px 76px 64px";

function championKey(champion: { championId: number; role: Role }): string {
  return `${champion.championId}-${champion.role}`;
}

export function ProfileScreen({
  riotAccounts,
  ddragonVersion
}: {
  riotAccounts: RiotAccountSummary[];
  ddragonVersion: string;
}) {
  const account = riotAccounts[0];
  const profile = useAsyncData<PlayerProfileResponse>(
    () => (account ? fetchPlayerProfile(account.gameName, account.tagLine) : undefined),
    [account?.gameName, account?.tagLine]
  );

  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const stats = useMemo(() => profile.data?.championStats ?? [], [profile.data]);

  const roleCounts = useMemo(() => {
    const counts: Partial<Record<Role, number>> = {};
    stats.forEach((champion) => {
      counts[champion.role] = (counts[champion.role] ?? 0) + 1;
    });
    return counts;
  }, [stats]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = stats.filter(
      (champion) =>
        (roleFilter === "ALL" || champion.role === roleFilter) && champion.championName.toLowerCase().includes(term)
    );
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return a.championName.localeCompare(b.championName);
      if (sortKey === "games") return b.games - a.games;
      if (sortKey === "winrate") return b.wins / b.games - a.wins / a.games;
      return scoreChampionPerformance(b).score - scoreChampionPerformance(a).score;
    });
  }, [stats, roleFilter, search, sortKey]);

  const selected = visible.find((champion) => championKey(champion) === selectedKey) ?? visible[0];

  const totalGames = stats.reduce((sum, champion) => sum + champion.games, 0);
  const totalWins = stats.reduce((sum, champion) => sum + champion.wins, 0);

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
      <ThemedPageHero
        eyebrow="Perfil do jogador"
        title={`${account.gameName}#${account.tagLine}`}
        aside={profile.data && <ScoreBlock score={profile.data.recentForm.last10Score} label="Forma (10)" size="md" />}
        meta={
          profile.data && (
            <InlineStats>
              <InlineStat label="Partidas" value={totalGames} />
              <InlineStat
                label="Vitórias"
                value={totalGames > 0 ? `${Math.round((totalWins / totalGames) * 100)}%` : "—"}
              />
              <InlineStat label="Campeões" value={stats.length} />
              <InlineStat
                label="Posições preferidas"
                value={
                  profile.data.preferredRoles.length > 0
                    ? profile.data.preferredRoles.map((role) => roleLabels[role]).join(", ")
                    : "—"
                }
                muted={profile.data.preferredRoles.length === 0}
              />
            </InlineStats>
          )
        }
      />

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
          <Card pad="sm">
            <Toolbar>
              <SegmentedControl<RoleFilter>
                ariaLabel="Filtrar por posição"
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: "ALL", label: "Todas", count: stats.length },
                  ...ROLES.map((role) => ({
                    value: role as RoleFilter,
                    label: roleLabels[role],
                    count: roleCounts[role] ?? 0,
                    disabled: (roleCounts[role] ?? 0) === 0
                  }))
                ]}
              />
              <ToolbarSpacer />
              <div style={{ width: 220 }}>
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar campeão..." />
              </div>
              <div style={{ width: 190 }}>
                <Select<SortKey> value={sortKey} onChange={setSortKey} options={sortOptions} ariaLabel="Ordenar por" />
              </div>
            </Toolbar>
          </Card>

          <Columns
            asideWidth="380px"
            stickyAside
            main={
              visible.length === 0 ? (
                <Card>
                  <EmptyState
                    inline
                    title="Nenhum campeão nesse filtro"
                    description="Troque a posição ou limpe a busca."
                  />
                </Card>
              ) : (
                <DataTable
                  columns={COLUMNS}
                  head={
                    <>
                      <span>Campeão</span>
                      <span>Partidas</span>
                      <span>Vitórias</span>
                      <span>Score</span>
                    </>
                  }
                >
                  {visible.map((champion) => {
                    const performance = scoreChampionPerformance(champion);
                    const key = championKey(champion);
                    return (
                      <DataRow
                        key={key}
                        onClick={() => setSelectedKey(key)}
                        selected={selected ? championKey(selected) === key : false}
                        label={`Ver detalhes de ${champion.championName}`}
                      >
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
                        />
                        <NumCell>{champion.games}</NumCell>
                        <NumCell strong>{Math.round((champion.wins / champion.games) * 100)}%</NumCell>
                        {performance.eligible ? (
                          <ScoreBadge score={performance.score} size="xs" />
                        ) : (
                          <NumCell>—</NumCell>
                        )}
                      </DataRow>
                    );
                  })}
                </DataTable>
              )
            }
            aside={
              <div style={{ display: "grid", gap: "var(--space-4)" }}>
                {selected ? (
                  <ChampionDetail champion={selected} ddragonVersion={ddragonVersion} />
                ) : (
                  <Card>
                    <EmptyState
                      inline
                      icon={<MousePointerClick size={20} />}
                      title="Selecione um campeão"
                      description="Clique numa linha pra ver o detalhamento completo."
                    />
                  </Card>
                )}

                <Card>
                  <SectionHeader title="Pontos fortes e fracos" />
                  {profile.data.strengths.length === 0 && profile.data.weaknesses.length === 0 ? (
                    <EmptyState
                      inline
                      title="Sem histórico suficiente"
                      description="O Sparta precisa de mais partidas sincronizadas pra apontar sinais com segurança."
                    />
                  ) : (
                    <SignalChipList stacked>
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
              </div>
            }
          />
        </>
      )}

      {profile.status === "loading" && <SkeletonRows count={4} />}
    </PageLayout>
  );
}

/**
 * Detalhamento progressivo: a tabela mostra o resumo, este painel abre o
 * que ja vinha da API e nunca era exibido (KP, participacao em objetivos,
 * ouro e visao por minuto, e os 10 componentes do score).
 */
function ChampionDetail({ champion, ddragonVersion }: { champion: PlayerChampionStats; ddragonVersion: string }) {
  const performance = scoreChampionPerformance(champion);
  const baseline = roleBaselines[champion.role];
  const kda = calculateKda(champion.kills, champion.deaths, champion.assists);
  const games = champion.games;

  const rawStats: { label: string; value: string; hint: string }[] = [
    { label: "KDA", value: kda.toFixed(2), hint: `ref. ${baseline.kda}` },
    { label: "CS/min", value: champion.csPerMinute.toFixed(1), hint: `ref. ${baseline.cs}` },
    { label: "Dano/min", value: Math.round(champion.damagePerMinute).toString(), hint: `ref. ${baseline.damage}` },
    { label: "Ouro/min", value: Math.round(champion.goldPerMinute).toString(), hint: `ref. ${baseline.gold}` },
    { label: "Visão/min", value: champion.visionScorePerMinute.toFixed(2), hint: `ref. ${baseline.vision}` },
    {
      label: "Part. abates",
      value: `${Math.round(champion.killParticipation * 100)}%`,
      hint: `ref. ${Math.round(baseline.kp * 100)}%`
    },
    {
      label: "Part. objetivos",
      value: `${Math.round(champion.objectiveParticipation * 100)}%`,
      hint: `ref. ${Math.round(baseline.objective * 100)}%`
    },
    { label: "Mortes/jogo", value: (champion.deaths / Math.max(1, games)).toFixed(1), hint: "menor é melhor" }
  ];

  // A ordem de `componentLabels` define a ordem de exibicao; componentes que
  // o role nao usa mesmo assim aparecem, pra o painel nao mudar de forma ao
  // trocar de campeao.
  const components = Object.keys(componentLabels).filter((key) => performance.components[key] !== undefined);

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
        <ChampionAvatar
          championId={champion.championId}
          ddragonVersion={ddragonVersion}
          size="lg"
          alt={champion.championName}
          ring
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: "block", fontSize: "var(--text-xl)", fontWeight: "var(--weight-black)" }}>
            {champion.championName}
          </strong>
          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
            <Badge tone="neutral" square>
              {roleLabels[champion.role]}
            </Badge>
            <Badge tone={performance.eligible ? "accent" : "neutral"}>
              {games} {games === 1 ? "partida" : "partidas"}
            </Badge>
            <Badge tone="neutral">confiança {confidenceLabels[performance.confidence]}</Badge>
          </div>
        </div>
        {performance.eligible && <ScoreBadge score={performance.score} size="md" />}
      </div>

      {!performance.eligible && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <SignalChip tone="info">
            Score indisponível: são necessárias {MIN_GAMES_FOR_RANKING} partidas pra comparar com segurança. As médias
            abaixo continuam reais.
          </SignalChip>
        </div>
      )}

      <SectionHeader title="Médias reais" description="Comparadas com a referência do papel." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-3)" }}>
        {rawStats.map((stat) => (
          <div key={stat.label}>
            <span style={{ display: "block", color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
              {stat.label}
            </span>
            <strong style={{ fontSize: "var(--text-lg)", fontVariantNumeric: "tabular-nums" }}>{stat.value}</strong>
            <span style={{ display: "block", color: "var(--text-muted)", fontSize: "var(--text-2xs)" }}>
              {stat.hint}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Componentes do score" description="Cada dimensão normalizada de 0 a 100." />
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {components.map((key) => (
            <StatBar
              key={key}
              label={componentLabels[key]}
              value={performance.components[key]}
              value_label={Math.round(performance.components[key]).toString()}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
