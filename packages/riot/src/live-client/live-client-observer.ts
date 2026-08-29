import { requestLiveClient, type LiveClientResult } from "./live-client-client.js";
import { LiveGameSession, type LiveSessionObservation } from "./live-game-session.js";
import {
  normalizeActivePlayer,
  normalizeEvents,
  normalizeGameInfo,
  normalizeScores,
  type LiveGameSessionState,
  type LiveGameSnapshot
} from "./live-game-snapshot.js";

/**
 * Intervalo de polling. 1000ms e conservador de proposito: nada nesta
 * fundacao precisa de resolucao sub-segundo (o relogio do jogo anda em
 * segundos e os eventos sao discretos), e um intervalo menor so
 * multiplicaria carga no Game Client local sem produzir informacao nova.
 * Ajustar isso exige razao tecnica medida, nao preferencia.
 */
export const LIVE_CLIENT_POLL_INTERVAL_MS = 1_000;

/**
 * ENDPOINTS CONSUMIDOS - e por que estes, e so estes.
 *
 * A API expoe 12 endpoints. Consumimos 4, pelo principio de minimizacao:
 * um endpoint so entra se algum dado que a fundacao precisa nao existir em
 * outro que ja consumimos.
 *
 * - `/gamestats`   : relogio/modo/mapa. Base do lifecycle (deteccao de
 *                    partida nova por regressao de `gameTime`).
 * - `/activeplayer`: nivel, ouro, championStats e o Riot ID que a propria
 *                    API exige como parametro de `/playerscores`.
 * - `/playerscores`: K/D/A, CS e ward score - SOMENTE do jogador ativo.
 * - `/eventdata`   : eventos factuais ja ocorridos.
 *
 * NAO consumidos, deliberadamente:
 * - `/playerlist`  : traz os 10 jogadores, incluindo Riot IDs e itens dos
 *                    inimigos. Nada na fundacao precisa disso, e consumi-lo
 *                    seria coletar dado de terceiros sem finalidade.
 * - `/allgamedata` : superconjunto de tudo, inclusive `playerlist`. Mesmo
 *                    motivo, agravado.
 * - `/activeplayerabilities` e `/activeplayerrunes`: REDUNDANTES - a Riot
 *                    ja devolve `abilities` e `fullRunes` embutidos em
 *                    `/activeplayer`. Duas chamadas a mais por segundo pra
 *                    obter o que ja veio na primeira nao se justifica.
 * - `/playersummonerspells`, `/playermainrunes`, `/playeritems`,
 *   `/activeplayername`: nao usados por esta fundacao.
 */
const ENDPOINTS = {
  gameStats: "/liveclientdata/gamestats",
  activePlayer: "/liveclientdata/activeplayer",
  eventData: "/liveclientdata/eventdata",
  playerScores: (riotId: string) =>
    `/liveclientdata/playerscores?riotId=${encodeURIComponent(riotId)}`
} as const;

function isJsonObject(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload);
}

export interface LiveObservationResult {
  state: LiveGameSessionState;
  snapshot: LiveGameSnapshot | null;
}

/**
 * Orquestra uma rodada de leitura e alimenta a `LiveGameSession`.
 *
 * Single-flight: `poll()` recusa reentrancia enquanto a rodada anterior nao
 * terminou. Sem isso, um Game Client lento acumularia requisicoes a cada
 * tick de 1s ate saturar - o modo de falha que o pedido pede explicitamente
 * pra evitar.
 */
export class LiveClientObserver {
  private readonly session = new LiveGameSession();
  private inFlight = false;
  private abortController: AbortController | undefined;

  getState(): LiveGameSessionState {
    return this.session.getState();
  }

  getSessionId(): string {
    return this.session.getSessionId();
  }

  async poll(now: Date = new Date()): Promise<LiveObservationResult | null> {
    if (this.inFlight) return null;
    this.inFlight = true;
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    // Capturada ANTES da primeira leitura: se a sessao trocar enquanto as
    // requisicoes estao em voo, tudo que voltar e descartado.
    const revision = this.session.getRevision();

    try {
      const gameStats = await requestLiveClient(ENDPOINTS.gameStats, isJsonObject, { signal });

      if (gameStats.status !== "OK") {
        // `GAME_NOT_RUNNING` = repouso; o resto = o cliente respondeu antes
        // e falhou agora, o que mantem a sessao viva por ate 3 tentativas.
        const reachable = gameStats.status !== "GAME_NOT_RUNNING";
        return { state: this.session.observeFailure(revision, reachable), snapshot: null };
      }

      const [activePlayerResult, eventDataResult] = await Promise.all([
        requestLiveClient(ENDPOINTS.activePlayer, isJsonObject, { signal }),
        requestLiveClient(ENDPOINTS.eventData, isJsonObject, { signal })
      ]);

      const activePlayer =
        activePlayerResult.status === "OK"
          ? normalizeActivePlayer(activePlayerResult.data)
          : normalizeActivePlayer(undefined);

      // `/playerscores` exige o Riot ID; sem ele a leitura simplesmente nao
      // acontece - e o placar fica ausente, nao zerado.
      const scoresResult: LiveClientResult<Record<string, unknown>> | undefined = activePlayer.riotId
        ? await requestLiveClient(ENDPOINTS.playerScores(activePlayer.riotId), isJsonObject, {
            signal
          })
        : undefined;

      const observation: LiveSessionObservation = {
        game: normalizeGameInfo(gameStats.data),
        activePlayer,
        scores: scoresResult?.status === "OK" ? normalizeScores(scoresResult.data) : undefined,
        events: eventDataResult.status === "OK" ? normalizeEvents(eventDataResult.data) : [],
        availability: {
          game: true,
          activePlayer: activePlayerResult.status === "OK",
          scores: scoresResult?.status === "OK",
          events: eventDataResult.status === "OK"
        }
      };

      const snapshot = this.session.observe(observation, revision, now);
      return { state: this.session.getState(), snapshot };
    } finally {
      this.inFlight = false;
      this.abortController = undefined;
    }
  }

  /** Encerra a sessao e aborta o que estiver em voo. */
  stop(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    this.session.end();
  }
}
