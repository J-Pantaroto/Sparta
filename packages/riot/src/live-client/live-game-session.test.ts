import { describe, expect, it } from "vitest";
import {
  GAME_TIME_REGRESSION_TOLERANCE_SECONDS,
  LiveGameSession,
  MAX_CONSECUTIVE_FAILURES,
  type LiveSessionObservation
} from "./live-game-session.js";
import type { LiveGameEvent } from "./live-game-snapshot.js";

const AT = new Date("2026-08-29T12:00:00.000Z");

function observation(gameTimeSeconds: number, events: LiveGameEvent[] = []): LiveSessionObservation {
  return {
    game: { gameTimeSeconds, mode: "PRACTICETOOL" },
    activePlayer: { level: 9, currentGold: 1260 },
    scores: { kills: 2, deaths: 1, assists: 3, creepScore: 84 },
    events,
    availability: { game: true, activePlayer: true, scores: true, events: true }
  };
}

function observe(session: LiveGameSession, gameTime: number, events: LiveGameEvent[] = []) {
  return session.observe(observation(gameTime, events), session.getRevision(), AT);
}

describe("LiveGameSession - ciclo de vida", () => {
  it("comeca indisponivel: sem partida nao ha sessao", () => {
    const session = new LiveGameSession();
    expect(session.getState()).toBe("UNAVAILABLE");
    expect(session.getSessionId()).toBe("");
  });

  it("primeira leitura valida abre uma sessao com identidade propria", () => {
    const session = new LiveGameSession();
    const snapshot = observe(session, 42);
    expect(session.getState()).toBe("LIVE");
    expect(snapshot?.sessionId).toMatch(/^live-/);
    expect(snapshot?.game.gameTimeSeconds).toBe(42);
  });

  it("falha isolada degrada mas NAO encerra a partida", () => {
    const session = new LiveGameSession();
    observe(session, 42);
    expect(session.observeFailure(session.getRevision(), true)).toBe("DEGRADED");
    // E se voltar a responder, volta a LIVE na mesma sessao.
    const sessionId = session.getSessionId();
    observe(session, 43);
    expect(session.getState()).toBe("LIVE");
    expect(session.getSessionId()).toBe(sessionId);
  });

  it("ausencia sustentada encerra a sessao", () => {
    const session = new LiveGameSession();
    observe(session, 42);
    for (let attempt = 0; attempt < MAX_CONSECUTIVE_FAILURES; attempt += 1) {
      session.observeFailure(session.getRevision(), false);
    }
    expect(session.getState()).toBe("ENDED");
  });

  it("Game Client alcancavel mas sem partida fica em CONNECTING, nao em erro", () => {
    const session = new LiveGameSession();
    expect(session.observeFailure(session.getRevision(), true)).toBe("CONNECTING");
    expect(session.observeFailure(session.getRevision(), false)).toBe("UNAVAILABLE");
  });
});

describe("LiveGameSession - isolamento entre partidas", () => {
  it("regressao de gameTime abre sessao NOVA (segunda partida)", () => {
    const session = new LiveGameSession();
    const first = observe(session, 1_500);
    const second = observe(session, 12);
    expect(second?.sessionId).not.toBe(first?.sessionId);
    expect(session.getState()).toBe("LIVE");
  });

  it("flutuacao pequena do relogio NAO abre sessao nova", () => {
    const session = new LiveGameSession();
    const first = observe(session, 600);
    const jitter = observe(session, 600 - (GAME_TIME_REGRESSION_TOLERANCE_SECONDS - 1));
    expect(jitter?.sessionId).toBe(first?.sessionId);
  });

  it("resposta obsoleta de uma sessao anterior e descartada", () => {
    const session = new LiveGameSession();
    observe(session, 500);
    const staleRevision = session.getRevision();

    session.end(); // partida acabou; revisao avanca

    // Resposta em voo da partida antiga chega agora - nao pode revivê-la.
    const leaked = session.observe(observation(505), staleRevision, AT);
    expect(leaked).toBeNull();
    expect(session.getState()).not.toBe("LIVE");
  });

  it("falha obsoleta nao altera o estado da sessao atual", () => {
    const session = new LiveGameSession();
    observe(session, 500);
    const staleRevision = session.getRevision();
    session.end();
    observe(session, 10); // nova partida
    const currentId = session.getSessionId();

    session.observeFailure(staleRevision, false);
    expect(session.getState()).toBe("LIVE");
    expect(session.getSessionId()).toBe(currentId);
  });

  it("eventos da partida anterior nao suprimem os da partida nova", () => {
    const session = new LiveGameSession();
    const events = [{ id: 0, name: "GameStart" }];
    const first = observe(session, 900, events);
    expect(first?.newEvents).toHaveLength(1);

    // Segunda partida: mesmos EventIDs (a Riot recomeca do 0) precisam
    // ser tratados como NOVOS, senao a partida nova nasce muda.
    const second = observe(session, 5, events);
    expect(second?.sessionId).not.toBe(first?.sessionId);
    expect(second?.newEvents).toHaveLength(1);
  });
});

describe("LiveGameSession - eventos idempotentes", () => {
  it("primeiro lote entrega todos os eventos", () => {
    const session = new LiveGameSession();
    const snapshot = observe(session, 70, [
      { id: 0, name: "GameStart" },
      { id: 1, name: "MinionsSpawning" }
    ]);
    expect(snapshot?.newEvents.map((event) => event.id)).toEqual([0, 1]);
  });

  it("reprocessar a mesma resposta nao produz evento nenhum", () => {
    const session = new LiveGameSession();
    const events = [{ id: 0, name: "GameStart" }];
    observe(session, 70, events);
    const repeat = observe(session, 71, events);
    expect(repeat?.newEvents).toEqual([]);
  });

  it("historico crescente entrega somente o delta", () => {
    const session = new LiveGameSession();
    observe(session, 70, [{ id: 0, name: "GameStart" }]);
    const grown = observe(session, 130, [
      { id: 0, name: "GameStart" },
      { id: 1, name: "MinionsSpawning" },
      { id: 2, name: "FirstBlood" }
    ]);
    expect(grown?.newEvents.map((event) => event.id)).toEqual([1, 2]);
  });

  it("eventos fora de ordem saem ordenados por id", () => {
    const session = new LiveGameSession();
    const snapshot = observe(session, 200, [
      { id: 5, name: "ChampionKill" },
      { id: 3, name: "TurretKilled" },
      { id: 4, name: "Multikill" }
    ]);
    expect(snapshot?.newEvents.map((event) => event.id)).toEqual([3, 4, 5]);
  });

  it("reconexao nao reproduz o historico ja visto", () => {
    const session = new LiveGameSession();
    const history = [
      { id: 0, name: "GameStart" },
      { id: 1, name: "MinionsSpawning" }
    ];
    observe(session, 70, history);
    session.observeFailure(session.getRevision(), true); // hiccup
    const afterReconnect = observe(session, 75, history);
    expect(afterReconnect?.newEvents).toEqual([]);
  });
});
