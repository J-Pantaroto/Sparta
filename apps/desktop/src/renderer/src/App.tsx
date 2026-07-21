import { Activity, BarChart3, Crosshair, Gauge, Shield, Swords } from "lucide-react";
import { recommendPicks, type DraftState, type PickRecommendation } from "@sparta/core";
import { useEffect, useMemo, useState } from "react";
import { championStats, championTags, compositionRules, playerProfile } from "./features/mock-data";
import { championSplashUrl, championSquareUrl, fetchLatestDataDragonVersion } from "./features/datadragon";
import { fetchSession, SESSION_TOKEN_KEY, type RiotAccountSummary, type SessionUser } from "./features/api-client";
import { AuthScreen } from "./features/AuthScreen";
import { LinkRiotAccountScreen } from "./features/LinkRiotAccountScreen";

type Page = "dashboard" | "profile" | "select" | "pregame" | "postgame";

const pageLabels: Record<Page, string> = {
  dashboard: "Dashboard",
  profile: "Perfil",
  select: "Champion Select",
  pregame: "Pré-game",
  postgame: "Pós-game"
};

type SessionStatus = "checking" | "auth" | "link-account" | "ready";

export function App() {
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

  const recommendations = useMemo<PickRecommendation[]>(() => {
    return recommendPicks({
      draft,
      player: playerProfile,
      championStats,
      championTags,
      matchups: [],
      compositionRules,
      patchMeta: null
    });
  }, [draft]);

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
  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.onGameflowPhase) return;
    const unsubscribe = window.sparta.onGameflowPhase((phase) => {
      if (phase === "ChampSelect") setPage("select");
    });
    return unsubscribe;
  }, [sessionStatus]);

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

  const loginSplash = useMemo(() => championSplashUrl("Yasuo"), []);

  if (sessionStatus === "checking") {
    return <div className="auth-shell" style={{ backgroundImage: `url(${loginSplash})` }} />;
  }

  if (sessionStatus === "auth") {
    return (
      <AuthScreen splashUrl={loginSplash} onAuthenticated={handleAuthenticated} onSkip={() => setSessionStatus("ready")} />
    );
  }

  if (sessionStatus === "link-account" && sessionToken) {
    return (
      <LinkRiotAccountScreen
        token={sessionToken}
        splashUrl={loginSplash}
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
              {pageLabels[item]}
            </button>
          ))}
        </nav>
      </aside>

      <section className="content">
        {page === "dashboard" && <Dashboard riotAccounts={riotAccounts} />}
        {page === "profile" && <Profile ddragonVersion={ddragonVersion} />}
        {page === "select" && (
          <ChampionSelect draft={draft} setDraft={setDraft} recommendations={recommendations} ddragonVersion={ddragonVersion} />
        )}
        {page === "pregame" && <PreGame />}
        {page === "postgame" && <PostGame />}
      </section>
    </main>
  );
}

function Dashboard({ riotAccounts }: { riotAccounts: RiotAccountSummary[] }) {
  const account = riotAccounts[0];
  return (
    <>
      <header className="page-header hero-splash" style={{ backgroundImage: `url(${championSplashUrl("Orianna")})` }}>
        <span>{account ? `${account.gameName}#${account.tagLine}` : "Sparta MVP"}</span>
        <h1>Escolhas melhores antes da partida. Revisões melhores depois.</h1>
      </header>
      <section className="metric-grid">
        <Metric label="Forma 10 jogos" value="66" detail="estável" />
        <Metric label="Melhor campeão" value="Orianna" detail="score 76.8" />
        <Metric label="Risco atual" value="Mortes cedo" detail="médio" />
        <Metric label="Escopo" value="Pré e pós-game" detail="sem assistência in-game" />
      </section>
      <section className="panel wide">
        <h2>Princípio do produto</h2>
        <p>
          O Sparta recomenda campeões com base em desempenho, forma recente e draft. Ele não executa ações no cliente,
          não automatiza pick/ban e não oferece orientação em tempo real durante a partida.
        </p>
      </section>
    </>
  );
}

function Profile({ ddragonVersion }: { ddragonVersion: string }) {
  return (
    <>
      <header className="page-header compact">
        <span>Perfil do jogador</span>
        <h1>{playerProfile.account.gameName}#{playerProfile.account.tagLine}</h1>
      </header>
      <section className="table-panel">
        {championStats.map((champion) => (
          <article className="champion-row" key={champion.championId}>
            <div className="champion-identity">
              <img
                className="champion-icon"
                src={championSquareUrl(champion.championName, ddragonVersion)}
                alt={champion.championName}
              />
              <strong>{champion.championName}</strong>
            </div>
            <span>{champion.games} partidas</span>
            <span>{Math.round((champion.wins / champion.games) * 100)}% WR</span>
            <span>{champion.csPerMinute.toFixed(1)} CS/min</span>
            <span>{champion.damagePerMinute} dano/min</span>
          </article>
        ))}
      </section>
    </>
  );
}

function ChampionSelect({
  draft,
  setDraft,
  recommendations,
  ddragonVersion
}: {
  draft: DraftState;
  setDraft: (draft: DraftState) => void;
  recommendations: PickRecommendation[];
  ddragonVersion: string;
}) {
  return (
    <>
      <header className="page-header compact">
        <span>Modo manual</span>
        <h1>Champion Select</h1>
      </header>
      <section className="draft-controls">
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
        <button
          onClick={() =>
            setDraft({
              ...draft,
              enemyLaneChampionId: draft.enemyLaneChampionId ? undefined : 157,
              enemies: draft.enemyLaneChampionId
                ? []
                : [{ championId: 157, championName: "Yasuo", role: "MID", team: "enemy" }]
            })
          }
        >
          <Swords size={16} />
          Alternar inimigo revelado
        </button>
      </section>
      <section className="recommendation-list">
        {recommendations.map((recommendation) => (
          <article className="recommendation" key={recommendation.championId}>
            <div>
              <span>{recommendation.category}</span>
              <div className="recommendation-title">
                <img
                  className="champion-icon sm"
                  src={championSquareUrl(recommendation.championName, ddragonVersion)}
                  alt={recommendation.championName}
                />
                <h2>{recommendation.championName}</h2>
              </div>
            </div>
            <strong>{recommendation.totalScore}</strong>
            <p>{recommendation.reasons[0]?.detail}</p>
            {recommendation.warnings.length > 0 ? <small>{recommendation.warnings[0].detail}</small> : null}
          </article>
        ))}
      </section>
    </>
  );
}

function PreGame() {
  return (
    <section className="panel wide">
      <h1>Análise pré-game</h1>
      <p>
        Condição de vitória sugerida: jogar por prioridade no mid, preparar visão antes dos objetivos e usar janelas de
        ultimate para lutas agrupadas.
      </p>
    </section>
  );
}

function PostGame() {
  return (
    <section className="panel wide">
      <h1>Análise pós-game</h1>
      <p>
        A primeira versão compara plano esperado com execução usando mortes cedo, CS aos 10/15, dano, visão,
        participação em abates e participação em objetivos.
      </p>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
