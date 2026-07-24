import { Activity, BarChart3, Crosshair, Gauge, Settings as SettingsIcon, Shield, Swords, TrendingUp } from "lucide-react";
import {
  rankChampionPool,
  recommendBuild,
  scoreChampionPerformance,
  summarizeEnemyDamageLean,
  type ChampionClassProfile,
  type Confidence,
  type DraftState,
  type ItemSummary,
  type PickRecommendation,
  type PlayerWeakness,
  type RecommendedItem,
  type Role
} from "@sparta/core";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  championSplashUrl,
  fetchAllChampions,
  fetchChampionClassProfiles,
  fetchItemCatalog,
  fetchLatestDataDragonVersion,
  itemIconUrl,
  type DataDragonChampionSummary
} from "./features/datadragon";
import {
  fetchDraftRecommendations,
  fetchPlayerProfile,
  fetchSession,
  SESSION_TOKEN_KEY,
  type PlayerProfileResponse,
  type RiotAccountSummary,
  type SessionUser
} from "./features/api-client";
import { useAsyncData } from "./features/use-async-data";
import { AuthScreen } from "./features/AuthScreen";
import { ChampionGridPicker } from "./features/ChampionGridPicker";
import { ChampionIcon } from "./features/ChampionIcon";
import { Loading } from "./features/Loading";
import { ThemedHeader } from "./features/ThemedHeader";
import { LinkRiotAccountScreen } from "./features/LinkRiotAccountScreen";
import { PostGameScreen } from "./features/PostGameScreen";
import { GrowthJourneyScreen } from "./features/GrowthJourneyScreen";
import { ScoreBadge } from "./features/ScoreBadge";
import { SettingsScreen } from "./features/SettingsScreen";
import { SignalChip } from "./features/SignalChip";
import { StatBar } from "./features/StatBar";
import { FeaturedChampionProvider, useFeaturedChampion } from "./features/featured-champion-context";

type Page = "dashboard" | "profile" | "select" | "pregame" | "postgame" | "growth" | "settings";

const pageLabels: Record<Page, string> = {
  dashboard: "Dashboard",
  profile: "Perfil",
  select: "Champion Select",
  pregame: "Pré-game",
  postgame: "Pós-game",
  growth: "Evolução",
  settings: "Configurações"
};

const trendLabels: Record<string, string> = {
  improving: "melhorando",
  declining: "piorando",
  // "estável" sozinho soa como um veredito sem contexto (feedback real de
  // usuário) - descreve o que de fato significa aqui: as ultimas partidas
  // nao mudaram o score o suficiente pra contar como tendencia.
  stable: "sem variação recente"
};

const severityLabels: Record<PlayerWeakness["severity"], string> = {
  low: "baixa",
  medium: "média",
  high: "alta"
};

const confidenceLabels: Record<Confidence, string> = {
  low: "baixa",
  medium: "média",
  high: "alta"
};

const ROLES: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

const roleLabels: Record<Role, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MID: "Mid",
  ADC: "ADC",
  SUPPORT: "Suporte"
};

// Rotulos legiveis pras chaves de PickRecommendation.metrics (@sparta/core) -
// usados nas barras dos cards de recomendacao do Champion Select.
const metricLabels: Record<string, string> = {
  personalPerformance: "Desempenho pessoal",
  recentForm: "Forma recente",
  matchup: "Matchup",
  blindSafety: "Segurança em blind",
  allySynergy: "Sinergia com o time",
  enemyDraftAnswer: "Resposta ao draft inimigo",
  compositionFit: "Encaixe de composição",
  meta: "Meta do patch"
};

type SessionStatus = "checking" | "auth" | "link-account" | "ready";

export function App() {
  return (
    <FeaturedChampionProvider>
      <AppShell />
    </FeaturedChampionProvider>
  );
}

function AppShell() {
  const { splashUrl } = useFeaturedChampion();
  const [page, setPage] = useState<Page>("dashboard");
  const [draft, setDraft] = useState<DraftState>({
    playerRole: "MID",
    pickOrder: 1,
    allies: [],
    enemies: [],
    bannedChampionIds: []
  });

  const [ddragonVersion, setDdragonVersion] = useState<string>("14.14.1");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("checking");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [riotAccounts, setRiotAccounts] = useState<RiotAccountSummary[]>([]);

  const recommendationsQuery = useAsyncData<PickRecommendation[]>(
    () => (sessionToken ? fetchDraftRecommendations(sessionToken, draft).then((result) => result.recommendations) : undefined),
    [sessionToken, draft]
  );

  // Versao real do Data Dragon (com fallback silencioso se offline).
  useEffect(() => {
    void fetchLatestDataDragonVersion().then(setDdragonVersion);
  }, []);

  // Restaura sessao salva localmente, se existir.
  useEffect(() => {
    const storedToken = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!storedToken) {
      setSessionStatus("auth");
      return;
    }
    fetchSession(storedToken)
      .then((result) => {
        setSessionToken(storedToken);
        setSessionUser(result.user);
        setRiotAccounts(result.riotAccounts);
        setSessionStatus(result.riotAccounts.length > 0 ? "ready" : "link-account");
      })
      .catch(() => {
        localStorage.removeItem(SESSION_TOKEN_KEY);
        setSessionStatus("auth");
      });
  }, []);

  // Deteccao automatica de champion select via LCU (somente leitura).
  // `champSelectActive` libera a tela de Champion Select (fora dele, a aba
  // mostra uma tela de espera + botao de simulacao manual).
  const [champSelectActive, setChampSelectActive] = useState(false);
  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.onGameflowPhase) return;
    const unsubscribe = window.sparta.onGameflowPhase((phase) => {
      const active = phase === "ChampSelect";
      setChampSelectActive(active);
      if (active) setPage("select");
    });
    return unsubscribe;
  }, [sessionStatus]);

  // Ordem de pick real (derivada da sessao do LCU), quando disponivel -
  // substitui o input manual. null fora do champion select ou sem cliente
  // do League real (dev/testing) - o input manual continua funcionando.
  const [autoPickOrder, setAutoPickOrder] = useState<number | null>(null);
  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.onPickOrder) return;
    const unsubscribe = window.sparta.onPickOrder(setAutoPickOrder);
    return unsubscribe;
  }, [sessionStatus]);

  useEffect(() => {
    if (autoPickOrder === null) return;
    setDraft((current) => (current.pickOrder === autoPickOrder ? current : { ...current, pickOrder: autoPickOrder }));
  }, [autoPickOrder]);

  // Papel real do jogador (derivado do assignedPosition do LCU), quando
  // disponivel - reflete troca de lane ao vivo. null sem cliente do League
  // (dev/testing) - o seletor manual continua disponivel.
  const [autoPlayerRole, setAutoPlayerRole] = useState<Role | null>(null);
  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.onPlayerRole) return;
    const unsubscribe = window.sparta.onPlayerRole(setAutoPlayerRole);
    return unsubscribe;
  }, [sessionStatus]);

  useEffect(() => {
    if (autoPlayerRole === null) return;
    setDraft((current) => (current.playerRole === autoPlayerRole ? current : { ...current, playerRole: autoPlayerRole }));
  }, [autoPlayerRole]);

  function handleAuthenticated(token: string) {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    setSessionToken(token);
    fetchSession(token)
      .then((result) => {
        setSessionUser(result.user);
        setRiotAccounts(result.riotAccounts);
        setSessionStatus(result.riotAccounts.length > 0 ? "ready" : "link-account");
      })
      .catch(() => setSessionStatus("link-account"));
  }

  function handleLinked(account: RiotAccountSummary) {
    setRiotAccounts((current) => [...current, account]);
    setSessionStatus("ready");
  }

  if (sessionStatus === "checking") {
    return <div className="auth-shell" style={{ backgroundImage: `url(${splashUrl})` }} />;
  }

  if (sessionStatus === "auth") {
    return (
      <AuthScreen splashUrl={splashUrl} onAuthenticated={handleAuthenticated} onSkip={() => setSessionStatus("ready")} />
    );
  }

  if (sessionStatus === "link-account" && sessionToken) {
    return (
      <LinkRiotAccountScreen
        token={sessionToken}
        splashUrl={splashUrl}
        onLinked={handleLinked}
        onSkip={() => setSessionStatus("ready")}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>Sparta</strong>
            <span>{sessionUser?.displayName ?? sessionUser?.email ?? "Draft intelligence"}</span>
          </div>
        </div>
        <nav>
          {(Object.keys(pageLabels) as Page[]).map((item) => (
            <button className={page === item ? "active" : ""} key={item} onClick={() => setPage(item)}>
              {item === "dashboard" && <Gauge size={18} />}
              {item === "profile" && <Activity size={18} />}
              {item === "select" && <Crosshair size={18} />}
              {item === "pregame" && <Shield size={18} />}
              {item === "postgame" && <BarChart3 size={18} />}
              {item === "growth" && <TrendingUp size={18} />}
              {item === "settings" && <SettingsIcon size={18} />}
              {pageLabels[item]}
            </button>
          ))}
        </nav>
      </aside>

      <section className="content">
        {page === "dashboard" && <Dashboard riotAccounts={riotAccounts} ddragonVersion={ddragonVersion} />}
        {page === "profile" && <Profile riotAccounts={riotAccounts} ddragonVersion={ddragonVersion} />}
        {page === "select" && (
          <ChampionSelect
            draft={draft}
            setDraft={setDraft}
            autoPickOrder={autoPickOrder}
            autoPlayerRole={autoPlayerRole}
            champSelectActive={champSelectActive}
            recommendations={recommendationsQuery.data ?? []}
            recommendationsStatus={recommendationsQuery.status}
            noAccountLinked={riotAccounts.length === 0}
            ddragonVersion={ddragonVersion}
          />
        )}
        {page === "pregame" && <PreGame draft={draft} ddragonVersion={ddragonVersion} />}
        {page === "postgame" && (
          <PostGameScreen riotAccounts={riotAccounts} sessionToken={sessionToken} ddragonVersion={ddragonVersion} />
        )}
        {page === "growth" && <GrowthJourneyScreen riotAccounts={riotAccounts} />}
        {page === "settings" && <SettingsScreen ddragonVersion={ddragonVersion} sessionToken={sessionToken} />}
      </section>
    </main>
  );
}

function Dashboard({ riotAccounts, ddragonVersion }: { riotAccounts: RiotAccountSummary[]; ddragonVersion: string }) {
  const account = riotAccounts[0];
  const { splashUrl: heroSplash } = useFeaturedChampion();

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
    <>
      <header className="page-header hero-splash" style={{ backgroundImage: `url(${heroSplash})` }}>
        <span>{account ? `${account.gameName}#${account.tagLine}` : "Sparta MVP"}</span>
        <h1>Escolhas melhores antes da partida. Revisões melhores depois.</h1>
      </header>

      {profile.status === "loading" && <Loading label="Carregando seu perfil..." />}

      <section className="metric-grid">
        <Metric
          label="Forma recente"
          value=""
          detail={recentForm ? (trendLabels[recentForm.trend] ?? recentForm.trend) : "sem dado"}
          badge={recentForm && <ScoreBadge score={recentForm.last10Score} />}
        />
        <Metric
          label="Melhor campeão"
          value={topChampion?.championName ?? "—"}
          detail={topChampion ? "score de desempenho" : "sem partidas suficientes"}
          icon={
            topChampion && (
              <ChampionIcon championId={topChampion.championId} ddragonVersion={ddragonVersion} size="sm" alt={topChampion.championName} />
            )
          }
          badge={topChampion && <ScoreBadge score={topChampion.score} size="sm" />}
        />
        <Metric
          label="Ponto forte"
          value={strengths[0]?.label ?? "Sem dado"}
          detail={strengths[0] ? confidenceLabels[strengths[0].confidence] : "—"}
        />
        <Metric label="Risco atual" value={weaknesses[0]?.label ?? "Sem dado"} detail={weaknesses[0] ? severityLabels[weaknesses[0].severity] : "—"} />
      </section>

      {recentForm && (
        <section className="panel wide">
          <h2>Forma recente</h2>
          <p>Score de desempenho ponderado por recência - quanto mais recente a partida, mais peso ela tem.</p>
          <div className="form-scores">
            <div className="form-score">
              <ScoreBadge score={recentForm.last10Score} size="sm" />
              <span>Últimas 10</span>
            </div>
            <div className="form-score">
              <ScoreBadge score={recentForm.last20Score} size="sm" />
              <span>Últimas 20</span>
            </div>
            <div className="form-score">
              <ScoreBadge score={recentForm.last50Score} size="sm" />
              <span>Últimas 50</span>
            </div>
          </div>
        </section>
      )}

      {topChampions.length > 0 && (
        <section className="panel wide">
          <h2>Seus melhores campeões</h2>
          <div className="leaderboard">
            {topChampions.map((champion, index) => (
              <div className="leaderboard-row" key={`${champion.championId}-${champion.role}`}>
                <span className="leaderboard-rank">#{index + 1}</span>
                <ChampionIcon championId={champion.championId} ddragonVersion={ddragonVersion} size="sm" alt={champion.championName} />
                <strong>{champion.championName}</strong>
                <span className="leaderboard-role">{roleLabels[champion.role]}</span>
                <span className="leaderboard-games">{champion.games} partidas</span>
                <ScoreBadge score={champion.score} size="sm" />
              </div>
            ))}
          </div>
        </section>
      )}

      {(strengths.length > 0 || weaknesses.length > 0) && (
        <section className="panel wide">
          <h2>Pontos fortes e fracos</h2>
          <div className="signal-chip-list">
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
          </div>
        </section>
      )}
    </>
  );
}

function Profile({ riotAccounts, ddragonVersion }: { riotAccounts: RiotAccountSummary[]; ddragonVersion: string }) {
  const account = riotAccounts[0];
  const profile = useAsyncData<PlayerProfileResponse>(
    () => (account ? fetchPlayerProfile(account.gameName, account.tagLine) : undefined),
    [account?.gameName, account?.tagLine]
  );

  if (!account) {
    return (
      <section className="panel wide">
        <h1>Perfil do jogador</h1>
        <p>Vincule sua conta Riot para ver seu perfil real.</p>
      </section>
    );
  }

  return (
    <>
      <ThemedHeader label="Perfil do jogador" title={`${account.gameName}#${account.tagLine}`} />
      {profile.status === "loading" && <Loading />}
      {profile.status === "error" && <p>{profile.error}</p>}
      {profile.data && (
        <>
          <section className="table-panel">
            {profile.data.championStats.map((champion) => {
              const performance = scoreChampionPerformance(champion);
              return (
                <article className="champion-row" key={`${champion.championId}-${champion.role}`}>
                  <div className="champion-identity">
                    <ChampionIcon championId={champion.championId} ddragonVersion={ddragonVersion} alt={champion.championName} />
                    <strong>{champion.championName}</strong>
                    {performance.eligible && <ScoreBadge score={performance.score} size="sm" />}
                  </div>
                  <span>{champion.games} partidas</span>
                  <span>{Math.round((champion.wins / champion.games) * 100)}% WR</span>
                  <div className="champion-row-bars">
                    <StatBar label="KDA" value={performance.components.kda} />
                    <StatBar label="CS/min" value={performance.components.cs} />
                    <StatBar label="Dano/min" value={performance.components.damage} />
                  </div>
                </article>
              );
            })}
          </section>
          <section className="panel wide">
            <h2>Pontos fortes e fracos</h2>
            {profile.data.strengths.length === 0 && profile.data.weaknesses.length === 0 ? (
              <p>Ainda sem histórico suficiente pra apontar pontos fortes/fracos.</p>
            ) : (
              <div className="signal-chip-list">
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
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

const MAX_ENEMIES = 5;

function ChampionSelect({
  draft,
  setDraft,
  autoPickOrder,
  autoPlayerRole,
  champSelectActive,
  recommendations,
  recommendationsStatus,
  noAccountLinked,
  ddragonVersion
}: {
  draft: DraftState;
  setDraft: (draft: DraftState) => void;
  autoPickOrder: number | null;
  autoPlayerRole: Role | null;
  champSelectActive: boolean;
  recommendations: PickRecommendation[];
  recommendationsStatus: string;
  noAccountLinked: boolean;
  ddragonVersion: string;
}) {
  const [confirmedChampion, setConfirmedChampion] = useState<{ championId: number; championName: string } | null>(null);
  // Modo de simulacao manual: liberado so quando NAO ha sessao real de
  // champion select detectada (senao a tela abre direto). Deixa testar a
  // tela sem o cliente do League aberto.
  const [devOverride, setDevOverride] = useState(false);

  function toggleEnemy(champion: DataDragonChampionSummary) {
    const alreadyPicked = draft.enemies.some((enemy) => enemy.championId === champion.id);
    if (alreadyPicked) {
      setDraft({ ...draft, enemies: draft.enemies.filter((enemy) => enemy.championId !== champion.id) });
      return;
    }
    if (draft.enemies.length >= MAX_ENEMIES) return;
    // "role" e obrigatorio no tipo DraftPick mas nao e usado pelo motor de
    // build (so championId importa aqui) - mantido como placeholder, mesmo
    // padrao do antigo botao-demo que hardcodava "MID" pro Yasuo.
    setDraft({ ...draft, enemies: [...draft.enemies, { championId: champion.id, championName: champion.name, role: "MID", team: "enemy" }] });
  }

  function confirmChampion(recommendation: PickRecommendation) {
    setConfirmedChampion({ championId: recommendation.championId, championName: recommendation.championName });
    setDraft({ ...draft, selectedChampionId: recommendation.championId });
  }

  // Sem sessao real do LCU e sem o usuario ter pedido simulacao: tela de
  // espera. Champion Select nao e um modulo de uso livre (feedback do
  // usuario) - so faz sentido dentro de uma selecao de campeoes de verdade.
  if (!champSelectActive && !devOverride) {
    return (
      <>
        <ThemedHeader label="Champion Select" title="Aguardando sua seleção de campeões" />
        <section className="panel wide">
          <p>
            Esta tela é liberada automaticamente quando o cliente do League detectar que você entrou em uma seleção de
            campeões - a posição, a ordem de pick e o time inimigo passam a ser preenchidos sozinhos.
          </p>
          <button type="button" className="btn-secondary" onClick={() => setDevOverride(true)}>
            Simular manualmente
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      <ThemedHeader
        label={champSelectActive ? "Detectado via League Client" : "Modo manual (simulação)"}
        title="Champion Select"
      />
      {noAccountLinked && (
        <p>Sem conta Riot vinculada - as recomendações abaixo usam só a referência geral do papel, não seu histórico.</p>
      )}
      <section className="draft-controls">
        {autoPlayerRole !== null ? (
          <label>
            Posição
            <strong style={{ display: "block" }}>{roleLabels[autoPlayerRole]}</strong>
          </label>
        ) : (
          <label>
            Posição
            <select value={draft.playerRole} onChange={(event) => setDraft({ ...draft, playerRole: event.target.value as Role })}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
        )}
        {autoPickOrder !== null ? (
          <label>
            Pick order
            <strong style={{ display: "block" }}>{autoPickOrder}</strong>
          </label>
        ) : (
          <label>
            Pick order
            <input
              min={1}
              max={5}
              type="number"
              value={draft.pickOrder}
              onChange={(event) => setDraft({ ...draft, pickOrder: Number(event.target.value) })}
            />
          </label>
        )}
      </section>
      {recommendationsStatus === "loading" && <Loading label="Calculando recomendações..." />}
      {recommendationsStatus === "error" && <p>Não foi possível calcular recomendações agora.</p>}
      <section className="recommendation-list">
        {recommendations.map((recommendation) => {
          const topMetrics = Object.entries(recommendation.metrics)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
          return (
            <article className="recommendation" key={recommendation.championId}>
              <div className="recommendation-header">
                <div>
                  <span>{recommendation.category}</span>
                  <div className="recommendation-title">
                    <ChampionIcon
                      championId={recommendation.championId}
                      ddragonVersion={ddragonVersion}
                      size="sm"
                      alt={recommendation.championName}
                    />
                    <h2>{recommendation.championName}</h2>
                  </div>
                </div>
                <ScoreBadge score={recommendation.totalScore} />
              </div>
              <div className="recommendation-bars">
                {topMetrics.map(([key, value]) => (
                  <StatBar key={key} label={metricLabels[key] ?? key} value={value} />
                ))}
              </div>
              <div className="signal-chip-list">
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
              </div>
              <button type="button" onClick={() => confirmChampion(recommendation)}>
                {confirmedChampion?.championId === recommendation.championId ? "Campeão confirmado ✓" : "Confirmar campeão"}
              </button>
            </article>
          );
        })}
      </section>

      <section className="panel wide">
        <h2>
          <Swords size={16} /> Time inimigo ({draft.enemies.length}/{MAX_ENEMIES})
        </h2>
        <p>Selecione os campeões inimigos conhecidos - a build sugerida abaixo se ajusta ao que já foi revelado.</p>
        <ChampionGridPicker
          ddragonVersion={ddragonVersion}
          onSelect={toggleEnemy}
          isSelected={(champion) => draft.enemies.some((enemy) => enemy.championId === champion.id)}
          isDisabled={() => draft.enemies.length >= MAX_ENEMIES}
        />
      </section>

      {confirmedChampion && (
        <BuildPanel confirmedChampion={confirmedChampion} enemies={draft.enemies} ddragonVersion={ddragonVersion} />
      )}
    </>
  );
}

function BuildPanel({
  confirmedChampion,
  enemies,
  ddragonVersion
}: {
  confirmedChampion: { championId: number; championName: string };
  enemies: DraftState["enemies"];
  ddragonVersion: string;
}) {
  const classProfiles = useAsyncData<ChampionClassProfile[]>(() => fetchChampionClassProfiles(ddragonVersion), [ddragonVersion]);
  const itemCatalog = useAsyncData<ItemSummary[]>(() => fetchItemCatalog(ddragonVersion), [ddragonVersion]);

  const build = useMemo(() => {
    if (!classProfiles.data || !itemCatalog.data) return undefined;
    const ownChampion = classProfiles.data.find((champion) => champion.championId === confirmedChampion.championId);
    const enemyChampions = enemies
      .map((enemy) => classProfiles.data?.find((champion) => champion.championId === enemy.championId))
      .filter((champion): champion is ChampionClassProfile => champion !== undefined);
    return recommendBuild({ ownChampion, enemyChampions, items: itemCatalog.data });
  }, [classProfiles.data, itemCatalog.data, confirmedChampion.championId, enemies]);

  const loading = classProfiles.status === "loading" || itemCatalog.status === "loading";

  return (
    <section className="panel wide build-panel">
      <h2>Build sugerida - {confirmedChampion.championName}</h2>
      {loading && <Loading label="Carregando build..." />}
      {build && (
        <>
          <div className="build-slots">
            {build.boots && (
              <div className="build-slot">
                <span>Botas</span>
                <BuildItemIcon item={build.boots} ddragonVersion={ddragonVersion} />
              </div>
            )}
            <div className="build-slot">
              <span>Itens core</span>
              <div className="build-item-row">
                {build.coreItems.map((item) => (
                  <BuildItemIcon key={item.itemId} item={item} ddragonVersion={ddragonVersion} />
                ))}
              </div>
            </div>
            {build.situationalItems.length > 0 && (
              <div className="build-slot">
                <span>Situacional</span>
                <div className="build-item-row">
                  {build.situationalItems.map((item) => (
                    <BuildItemIcon key={item.itemId} item={item} ddragonVersion={ddragonVersion} />
                  ))}
                </div>
              </div>
            )}
          </div>
          {build.reasons.map((reason) => (
            <p key={reason.code}>✓ {reason.detail}</p>
          ))}
          {build.warnings.map((warning) => (
            <p key={warning.code}>
              <small>⚠ {warning.detail}</small>
            </p>
          ))}
        </>
      )}
    </section>
  );
}

function BuildItemIcon({ item, ddragonVersion }: { item: RecommendedItem; ddragonVersion: string }) {
  return (
    <div className="build-item" title={item.reason}>
      <img className="champion-icon sm" src={itemIconUrl(item.itemId, ddragonVersion)} alt={item.name} />
      <span>{item.name}</span>
    </div>
  );
}

function PreGame({ draft, ddragonVersion }: { draft: DraftState; ddragonVersion: string }) {
  const catalog = useAsyncData<DataDragonChampionSummary[]>(() => fetchAllChampions(ddragonVersion), [ddragonVersion]);
  const classProfiles = useAsyncData<ChampionClassProfile[]>(() => fetchChampionClassProfiles(ddragonVersion), [ddragonVersion]);

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
    <>
      <header className="page-header hero-splash" style={heroSplash ? { backgroundImage: `url(${heroSplash})` } : undefined}>
        <span>Pré-game</span>
        <h1>Análise pré-game</h1>
      </header>

      {!ownChampion && (
        <p>Confirme seu campeão no Champion Select pra ver o resumo do confronto aqui.</p>
      )}

      {ownChampion && (
        <section className="panel wide">
          <h2>Seu campeão</h2>
          <div className="build-item">
            <ChampionIcon
              championId={ownChampion.id}
              slug={ownChampion.key}
              ddragonVersion={ddragonVersion}
              size="sm"
              alt={ownChampion.name}
            />
            <span>{ownChampion.name}</span>
          </div>
        </section>
      )}

      {enemyChampions.length > 0 && (
        <section className="panel wide">
          <h2>Time inimigo</h2>
          <div className="build-item-row">
            {enemyChampions.map((champion) => (
              <div className="build-item" key={champion.id}>
                <ChampionIcon championId={champion.id} slug={champion.key} ddragonVersion={ddragonVersion} size="sm" alt={champion.name} />
                <span>{champion.name}</span>
              </div>
            ))}
          </div>
          {enemyLean && enemyLean.lean !== "BALANCED" && (
            <p>
              {enemyLean.lean === "MAGIC"
                ? `Time inimigo com foco mágico (méd. ${enemyLean.magicAvg}/10 vs ${enemyLean.attackAvg}/10 físico).`
                : `Time inimigo com foco físico (méd. ${enemyLean.attackAvg}/10 vs ${enemyLean.magicAvg}/10 mágico).`}
            </p>
          )}
        </section>
      )}

      <section className="panel wide">
        <h2>Condição de vitória</h2>
        <p>
          Jogar por prioridade no mid, preparar visão antes dos objetivos e usar janelas de ultimate para lutas agrupadas.
        </p>
      </section>
    </>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  badge
}: {
  label: string;
  value: string;
  detail: string;
  icon?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <article className="metric">
      <span>{label}</span>
      <div className="metric-value-row">
        {icon}
        <strong>{value}</strong>
        {badge}
      </div>
      <small>{detail}</small>
    </article>
  );
}
