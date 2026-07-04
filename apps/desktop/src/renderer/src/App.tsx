import { Activity, BarChart3, Crosshair, Gauge, Shield, Swords } from "lucide-react";
import { recommendPicks, type DraftState, type PickRecommendation } from "@sparta/core";
import { useMemo, useState } from "react";
import { championStats, championTags, compositionRules, playerProfile } from "./features/mock-data";

type Page = "dashboard" | "profile" | "select" | "pregame" | "postgame";

const pageLabels: Record<Page, string> = {
  dashboard: "Dashboard",
  profile: "Perfil",
  select: "Champion Select",
  pregame: "Pré-game",
  postgame: "Pós-game"
};

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [draft, setDraft] = useState<DraftState>({
    playerRole: "MID",
    pickOrder: 1,
    allies: [],
    enemies: [],
    bannedChampionIds: []
  });

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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>Sparta</strong>
            <span>Draft intelligence</span>
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
        {page === "dashboard" && <Dashboard />}
        {page === "profile" && <Profile />}
        {page === "select" && <ChampionSelect draft={draft} setDraft={setDraft} recommendations={recommendations} />}
        {page === "pregame" && <PreGame />}
        {page === "postgame" && <PostGame />}
      </section>
    </main>
  );
}

function Dashboard() {
  return (
    <>
      <header className="page-header">
        <span>Sparta MVP</span>
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

function Profile() {
  return (
    <>
      <header className="page-header compact">
        <span>Perfil do jogador</span>
        <h1>{playerProfile.account.gameName}#{playerProfile.account.tagLine}</h1>
      </header>
      <section className="table-panel">
        {championStats.map((champion) => (
          <article className="champion-row" key={champion.championId}>
            <strong>{champion.championName}</strong>
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
  recommendations
}: {
  draft: DraftState;
  setDraft: (draft: DraftState) => void;
  recommendations: PickRecommendation[];
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
              <h2>{recommendation.championName}</h2>
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
