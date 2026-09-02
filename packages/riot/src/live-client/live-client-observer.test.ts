import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveClientResult, LiveClientStatus } from "./live-client-client.js";

/**
 * O observador e o unico ponto que decide QUAIS endpoints da Game Client API
 * sao chamados. Por isso o cliente HTTP e substituido aqui: o que precisa ser
 * provado nao e o transporte (coberto em `live-client-client.test.ts`), e sim
 * a politica - minimizacao de endpoints, single-flight, e ausencia virando
 * indisponibilidade em vez de zero.
 */
const requestLiveClient = vi.fn();
vi.mock("./live-client-client.js", () => ({
  requestLiveClient: (...args: unknown[]) => requestLiveClient(...args),
  LIVE_CLIENT_HOST: "127.0.0.1",
  LIVE_CLIENT_PORT: 2999,
  LIVE_CLIENT_TIMEOUT_MS: 800
}));

const { LiveClientObserver } = await import("./live-client-observer.js");

const ok = <T>(data: T): LiveClientResult<T> => ({ status: "OK", data });
const fail = <T>(status: Exclude<LiveClientStatus, "OK">): LiveClientResult<T> => ({ status });

const GAME_STATS = { gameTime: 305.5, gameMode: "CLASSIC", mapName: "Map11", mapNumber: 11 };
const ACTIVE_PLAYER = {
  riotId: "Zekerus#117",
  level: 9,
  currentGold: 2400,
  championStats: { attackDamage: 120 }
};
const SCORES = { kills: 3, deaths: 1, assists: 4, creepScore: 88, wardScore: 9.5 };
const EVENTS = { Events: [{ EventID: 0, EventName: "GameStart", EventTime: 0.01 }] };

const HAPPY_ROUTES: Record<string, LiveClientResult<unknown>> = {
  "/liveclientdata/gamestats": ok(GAME_STATS),
  "/liveclientdata/activeplayer": ok(ACTIVE_PLAYER),
  "/liveclientdata/playerscores": ok(SCORES),
  "/liveclientdata/eventdata": ok(EVENTS)
};

/** Responde por caminho, ignorando a query - so o endpoint importa aqui. */
function routeBy(routes: Record<string, LiveClientResult<unknown>>) {
  requestLiveClient.mockImplementation((path: string) => {
    const endpoint = String(path).split("?")[0];
    return Promise.resolve(routes[endpoint] ?? fail("ENDPOINT_UNAVAILABLE"));
  });
}

function pathsCalled(): string[] {
  return requestLiveClient.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  requestLiveClient.mockReset();
});

describe("minimizacao de endpoints", () => {
  it("consome exatamente os quatro endpoints da fundacao", async () => {
    routeBy(HAPPY_ROUTES);
    await new LiveClientObserver().poll();

    const endpoints = pathsCalled().map((path) => path.split("?")[0]);
    expect(new Set(endpoints)).toEqual(
      new Set([
        "/liveclientdata/gamestats",
        "/liveclientdata/activeplayer",
        "/liveclientdata/playerscores",
        "/liveclientdata/eventdata"
      ])
    );
  });

  it("NUNCA consulta playerlist, allgamedata ou dados de terceiros", async () => {
    routeBy(HAPPY_ROUTES);
    await new LiveClientObserver().poll();

    // Proibicao estrutural, nao filtragem posterior: o dado do adversario
    // nunca entra no processo porque a chamada nunca acontece.
    for (const forbidden of [
      "playerlist",
      "allgamedata",
      "playeritems",
      "playersummonerspells",
      "playermainrunes"
    ]) {
      expect(pathsCalled().some((path) => path.includes(forbidden))).toBe(false);
    }
  });

  it("nao consulta os endpoints redundantes de habilidade/runa/nome", async () => {
    routeBy(HAPPY_ROUTES);
    await new LiveClientObserver().poll();

    for (const redundant of ["activeplayerabilities", "activeplayerrunes", "activeplayername"]) {
      expect(pathsCalled().some((path) => path.includes(redundant))).toBe(false);
    }
  });

  it("pede o placar SOMENTE do jogador ativo, com o Riot ID escapado", async () => {
    routeBy(HAPPY_ROUTES);
    await new LiveClientObserver().poll();

    const scores = pathsCalled().find((path) => path.includes("playerscores"));
    expect(scores).toBe("/liveclientdata/playerscores?riotId=Zekerus%23117");
  });

  it("fora de partida para na primeira leitura, sem varrer o resto da API", async () => {
    routeBy({ "/liveclientdata/gamestats": fail("GAME_NOT_RUNNING") });

    const result = await new LiveClientObserver().poll();

    expect(result?.state).toBe("UNAVAILABLE");
    expect(result?.snapshot).toBeNull();
    expect(pathsCalled()).toEqual(["/liveclientdata/gamestats"]);
  });
});

describe("ausencia nao vira zero", () => {
  it("sem Riot ID, o placar fica ausente e a chamada nem acontece", async () => {
    routeBy({ ...HAPPY_ROUTES, "/liveclientdata/activeplayer": ok({ level: 4 }) });

    const result = await new LiveClientObserver().poll();

    expect(pathsCalled().some((path) => path.includes("playerscores"))).toBe(false);
    expect(result?.snapshot?.activePlayer.scores).toBeUndefined();
    expect(result?.snapshot?.availability.scores).toBe(false);
    expect(result?.snapshot?.activePlayer.level).toBe(4);
  });

  it("falha parcial e reportada por parte, sem inventar evento", async () => {
    routeBy({ ...HAPPY_ROUTES, "/liveclientdata/eventdata": fail("HTTP_ERROR") });

    const result = await new LiveClientObserver().poll();

    expect(result?.state).toBe("LIVE");
    expect(result?.snapshot?.availability).toEqual({
      game: true,
      activePlayer: true,
      scores: true,
      events: false
    });
    expect(result?.snapshot?.newEvents).toEqual([]);
  });

  it("gameTime zero real e preservado", async () => {
    routeBy({ ...HAPPY_ROUTES, "/liveclientdata/gamestats": ok({ ...GAME_STATS, gameTime: 0 }) });

    const result = await new LiveClientObserver().poll();

    expect(result?.snapshot?.game.gameTimeSeconds).toBe(0);
  });
});

describe("polling conservador", () => {
  it("single-flight: rodada nova nao comeca com a anterior em voo", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    requestLiveClient.mockImplementation(async (path: string) => {
      const endpoint = String(path).split("?")[0];
      if (endpoint === "/liveclientdata/gamestats") {
        await blocked;
        return ok(GAME_STATS);
      }
      return HAPPY_ROUTES[endpoint] ?? fail("ENDPOINT_UNAVAILABLE");
    });

    const observer = new LiveClientObserver();
    const first = observer.poll();
    const second = await observer.poll();

    // A segunda tentativa e descartada - requisicoes nao se acumulam a cada
    // tick quando o Game Client esta lento.
    expect(second).toBeNull();
    expect(pathsCalled()).toEqual(["/liveclientdata/gamestats"]);

    release?.();
    await first;
    expect(await observer.poll()).not.toBeNull();
  });

  it("resposta em voo quando a sessao termina nao vira snapshot", async () => {
    routeBy(HAPPY_ROUTES);
    const observer = new LiveClientObserver();
    await observer.poll();

    // Rodada nova segurada no meio; a sessao e encerrada enquanto ela corre.
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    requestLiveClient.mockImplementation(async (path: string) => {
      const endpoint = String(path).split("?")[0];
      if (endpoint === "/liveclientdata/gamestats") await blocked;
      return HAPPY_ROUTES[endpoint] ?? fail("ENDPOINT_UNAVAILABLE");
    });

    const inFlight = observer.poll();
    observer.stop();
    release?.();
    const result = await inFlight;

    // A leitura obsoleta e descartada sem tocar em estado: nada da sessao
    // encerrada atravessa pra depois dela.
    expect(result?.snapshot).toBeNull();
    expect(observer.getState()).toBe("ENDED");
  });

  it("dedupe entre rodadas: o mesmo EventID nao volta como novo", async () => {
    routeBy(HAPPY_ROUTES);
    const observer = new LiveClientObserver();

    const first = await observer.poll();
    const second = await observer.poll();

    // `/eventdata` devolve o historico inteiro a cada chamada.
    expect(first?.snapshot?.newEvents.map((event) => event.id)).toEqual([0]);
    expect(second?.snapshot?.newEvents).toEqual([]);
  });

  it("falha isolada degrada; ausencia sustentada encerra", async () => {
    routeBy(HAPPY_ROUTES);
    const observer = new LiveClientObserver();
    await observer.poll();

    routeBy({ "/liveclientdata/gamestats": fail("REQUEST_TIMEOUT") });
    expect((await observer.poll())?.state).toBe("DEGRADED");
    expect((await observer.poll())?.state).toBe("DEGRADED");
    expect((await observer.poll())?.state).toBe("ENDED");
  });

  it("stop() encerra a sessao; a proxima partida nasce limpa", async () => {
    routeBy(HAPPY_ROUTES);
    const observer = new LiveClientObserver();
    await observer.poll();
    expect(observer.getState()).toBe("LIVE");
    const sessionId = observer.getSessionId();

    observer.stop();
    expect(observer.getState()).toBe("ENDED");

    const next = await observer.poll();
    // Sessao nova: nem identidade nem eventos da anterior atravessam.
    expect(next?.snapshot?.sessionId).not.toBe(sessionId);
    expect(next?.snapshot?.newEvents.map((event) => event.id)).toEqual([0]);
  });
});
