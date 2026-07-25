import { rankChampionPool, type GrowthJourney, type RecentChampionMatch } from "@sparta/core";
import { ArrowRight, Crosshair, Minus, TrendingDown, TrendingUp, UserPlus } from "lucide-react";
import type { Page } from "../app/navigation";
import { confidenceLabels, formTrendLabels, roleLabels, severityLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import {
  fetchGrowthJourney,
  fetchPlayerProfile,
  fetchRecentMatches,
  type PlayerProfileResponse,
  type RiotAccountSummary
} from "../services/api-client";
import { ThemedPageHero } from "../theme/ThemedPageHero";
import { useFeaturedChampion } from "../theme/featured-champion-context";
import {
  Badge,
  Button,
  Card,
  ChampionAvatar,
  Columns,
  EmptyState,
  ErrorState,
  InlineStat,
  InlineStats,
  Loading,
  PageLayout,
  ScoreBadge,
  ScoreBlock,
  SectionHeader,
  SignalChip,
  SkeletonRows,
  StatusBadge
} from "../ui";
import "./DashboardScreen.css";

interface DashboardScreenProps {
  riotAccounts: RiotAccountSummary[];
  ddragonVersion: string;
  champSelectActive: boolean;
  onNavigate: (page: Page) => void;
}

export function DashboardScreen({ riotAccounts, ddragonVersion, champSelectActive, onNavigate }: DashboardScreenProps) {
  const account = riotAccounts[0];
  const { featuredChampion } = useFeaturedChampion();

  const profile = useAsyncData<PlayerProfileResponse>(
    () => (account ? fetchPlayerProfile(account.gameName, account.tagLine) : undefined),
    [account?.gameName, account?.tagLine]
  );
  const matches = useAsyncData<{ puuid: string; matches: RecentChampionMatch[] }>(
    () => (account ? fetchRecentMatches(account.puuid, 10) : undefined),
    [account?.puuid]
  );
  const journey = useAsyncData<{ puuid: string } & GrowthJourney>(
    () => (account ? fetchGrowthJourney(account.puuid) : undefined),
    [account?.puuid]
  );

  const stats = profile.data?.championStats ?? [];
  const ranked = profile.data ? rankChampionPool(stats) : [];
  const recentForm = profile.data?.recentForm;
  const strength = profile.data?.strengths[0];
  const weakness = profile.data?.weaknesses[0];

  // Totais do pool inteiro (nao so dos campeoes elegiveis pro ranking) -
  // "quantas partidas o Sparta analisou" tem que bater com o historico real.
  const totalGames = stats.reduce((sum, champion) => sum + champion.games, 0);
  const totalWins = stats.reduce((sum, champion) => sum + champion.wins, 0);
  const winrate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : null;

  if (!account) {
    return (
      <PageLayout>
        <ThemedPageHero variant="feature" eyebrow="Bem-vindo" title="Sparta" subtitle="Escolhas melhores antes da partida, revisões melhores depois." />
        <Card>
          <EmptyState
            icon={<UserPlus size={22} />}
            title="Vincule sua conta Riot pra começar"
            description="Com a conta vinculada o Sparta sincroniza seu histórico real e passa a analisar desempenho, recomendar picks e revisar suas partidas."
          />
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <ThemedPageHero
        variant="feature"
        eyebrow={
          champSelectActive ? (
            <StatusBadge state="live">Seleção de campeões em andamento</StatusBadge>
          ) : (
            `Tema: ${featuredChampion.skinName}`
          )
        }
        title={`${account.gameName}#${account.tagLine}`}
        meta={
          <InlineStats>
            <InlineStat label="Partidas analisadas" value={totalGames || "—"} />
            <InlineStat label="Vitórias" value={winrate !== null ? `${winrate}%` : "—"} />
            <InlineStat label="Campeões no pool" value={stats.length || "—"} />
            <InlineStat
              label="Tendência"
              value={recentForm ? (formTrendLabels[recentForm.trend] ?? recentForm.trend) : "—"}
              muted={!recentForm}
            />
          </InlineStats>
        }
        aside={
          <>
            {recentForm && <ScoreBlock score={recentForm.last10Score} label="Forma (10 jogos)" size="lg" />}
            {champSelectActive && (
              <Button variant="primary" icon={<Crosshair size={15} />} onClick={() => onNavigate("select")}>
                Abrir Champion Select
              </Button>
            )}
          </>
        }
      />

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

      {profile.data && (
        <Columns
          asideWidth="340px"
          main={
            <div style={{ display: "grid", gap: "var(--space-4)" }}>
              <Card>
                <SectionHeader
                  title="Forma recente"
                  description="Score ponderado por recência: quanto mais recente a partida, mais peso ela tem no número."
                  actions={recentForm && <Badge tone="neutral">confiança {confidenceLabels[recentForm.confidence]}</Badge>}
                />
                {recentForm ? (
                  <InlineStats>
                    <ScoreBlock score={recentForm.last10Score} label="Últimas 10" size="md" />
                    <ScoreBlock score={recentForm.last20Score} label="Últimas 20" />
                    <ScoreBlock score={recentForm.last50Score} label="Últimas 50" />
                  </InlineStats>
                ) : (
                  <EmptyState inline title="Sem forma calculada ainda" />
                )}

                {matches.status === "loading" && <SkeletonRows count={1} height={32} />}
                {matches.data && matches.data.matches.length > 0 && (
                  <div style={{ marginTop: "var(--space-5)" }}>
                    <MatchStreak matches={matches.data.matches} ddragonVersion={ddragonVersion} />
                  </div>
                )}
              </Card>

              <Card>
                <SectionHeader
                  title="Seus melhores campeões"
                  description={`Só campeões com amostra suficiente pra ranquear entram aqui (${stats.length - ranked.length} fora do corte).`}
                  actions={
                    <Button variant="ghost" size="sm" icon={<ArrowRight size={14} />} onClick={() => onNavigate("profile")}>
                      Ver perfil completo
                    </Button>
                  }
                />
                {ranked.length === 0 ? (
                  <EmptyState
                    inline
                    title="Nenhum campeão ranqueado ainda"
                    description="O Sparta precisa de mais partidas com o mesmo campeão pra comparar desempenho com segurança."
                  />
                ) : (
                  <div className="sp-pool">
                    {ranked.slice(0, 5).map((champion, index) => {
                      const raw = stats.find(
                        (item) => item.championId === champion.championId && item.role === champion.role
                      );
                      const championWinrate = raw ? Math.round((raw.wins / raw.games) * 100) : null;
                      return (
                        <div className="sp-pool__row" key={`${champion.championId}-${champion.role}`}>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
                            <span className="sp-pool__rank">{index + 1}</span>
                            <ChampionAvatar
                              championId={champion.championId}
                              ddragonVersion={ddragonVersion}
                              size="sm"
                              alt={champion.championName}
                            />
                            <div style={{ minWidth: 0 }}>
                              <strong className="sp-truncate" style={{ display: "block" }}>
                                {champion.championName}
                              </strong>
                              <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                                {roleLabels[champion.role]}
                              </span>
                            </div>
                          </div>
                          <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
                            {champion.games} jogos
                          </span>
                          <span style={{ fontWeight: "var(--weight-bold)", fontVariantNumeric: "tabular-nums" }}>
                            {championWinrate !== null ? `${championWinrate}%` : "—"}
                          </span>
                          <ScoreBadge score={champion.score} size="xs" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          }
          aside={
            <div style={{ display: "grid", gap: "var(--space-4)" }}>
              <Card tone="feature">
                <span className="sp-insight__label">Ponto forte</span>
                {strength ? (
                  <>
                    <strong className="sp-insight__headline">{strength.label}</strong>
                    <span className="sp-insight__detail">{strength.detail}</span>
                    <div style={{ marginTop: "var(--space-3)" }}>
                      <Badge tone="positive">confiança {confidenceLabels[strength.confidence]}</Badge>
                    </div>
                  </>
                ) : (
                  <EmptyState inline title="Sem dado suficiente" />
                )}
              </Card>

              <Card>
                <span className="sp-insight__label">Risco atual</span>
                {weakness ? (
                  <>
                    <strong className="sp-insight__headline">{weakness.label}</strong>
                    <span className="sp-insight__detail">{weakness.detail}</span>
                    <div style={{ marginTop: "var(--space-3)" }}>
                      <Badge tone="negative">severidade {severityLabels[weakness.severity]}</Badge>
                    </div>
                  </>
                ) : (
                  <EmptyState inline title="Sem dado suficiente" />
                )}
              </Card>

              <Card>
                <SectionHeader
                  title="Evolução"
                  actions={
                    <Button variant="ghost" size="sm" icon={<ArrowRight size={14} />} onClick={() => onNavigate("growth")}>
                      Abrir
                    </Button>
                  }
                />
                {journey.status === "loading" && <SkeletonRows count={2} height={28} />}
                {journey.data && journey.data.weaknessTrends.length > 0 ? (
                  <div style={{ display: "grid", gap: "var(--space-2)" }}>
                    {journey.data.weaknessTrends.slice(0, 3).map((trend) => (
                      <TrendRow key={trend.code} label={trend.label} trend={trend.trend} hasComparison={trend.hasComparison} />
                    ))}
                  </div>
                ) : (
                  journey.status !== "loading" && (
                    <EmptyState
                      inline
                      title="Ainda sem tendências"
                      description="Analise partidas no Pós-game pra o Sparta acompanhar sua evolução."
                    />
                  )
                )}
              </Card>
            </div>
          }
        />
      )}
    </PageLayout>
  );
}

function MatchStreak({ matches, ddragonVersion }: { matches: RecentChampionMatch[]; ddragonVersion: string }) {
  const wins = matches.filter((match) => match.won).length;
  return (
    <div>
      <div className="sp-streak">
        {matches.map((match) => (
          <span
            key={match.matchId}
            className={`sp-streak__match${match.won ? " sp-streak__match--won" : ""}`}
            title={`${match.won ? "Vitória" : "Derrota"} · ${match.kills}/${match.deaths}/${match.assists}`}
          >
            <ChampionAvatar
              championId={match.championId}
              ddragonVersion={ddragonVersion}
              size="sm"
              alt={`Campeão ${match.championId}`}
            />
          </span>
        ))}
        <span className="sp-streak__legend">
          {wins}V — {matches.length - wins}D nas últimas {matches.length}
        </span>
      </div>
    </div>
  );
}

function TrendRow({ label, trend, hasComparison }: { label: string; trend: string; hasComparison: boolean }) {
  // Sem um segundo bloco de partidas antigas, `trend` vem sempre "stable" -
  // mostrar isso como tendencia seria enganoso (achado da Fase 10).
  if (!hasComparison) {
    return (
      <SignalChip tone="info" title="Analise mais partidas no Pós-game pra o Sparta poder comparar dois períodos.">
        {label} · ainda sem comparação
      </SignalChip>
    );
  }
  const good = trend === "improving" || trend === "resolved";
  const bad = trend === "worsening" || trend === "new";
  const Icon = good ? TrendingUp : bad ? TrendingDown : Minus;
  return (
    <SignalChip tone={good ? "positive" : bad ? "negative" : "info"}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
        <Icon size={13} />
        {label}
      </span>
    </SignalChip>
  );
}
