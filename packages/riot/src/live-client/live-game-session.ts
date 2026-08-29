import type {
  LiveGameEvent,
  LiveGameSessionState,
  LiveGameSnapshot,
  LiveActivePlayer,
  LiveAvailability,
  LiveGameInfo,
  LivePlayerScores
} from "./live-game-snapshot.js";

/**
 * Quantas leituras falhas seguidas uma sessao LIVE tolera antes de ser
 * considerada encerrada. Com polling de 1000ms isso e ~3s de silencio -
 * suficiente pra atravessar um hiccup do Game Client sem encerrar a
 * sessao, curto o bastante pra nao segurar uma partida que ja acabou.
 */
export const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Queda de `gameTime` maior que isso indica PARTIDA DIFERENTE, nao
 * flutuacao. O relogio da Riot so anda pra frente dentro de uma partida;
 * uma folga pequena absorve jitter de leitura, e qualquer coisa alem disso
 * so acontece quando um jogo novo comecou (relogio volta a ~0).
 */
export const GAME_TIME_REGRESSION_TOLERANCE_SECONDS = 30;

export interface LiveSessionObservation {
  game: LiveGameInfo;
  activePlayer: LiveActivePlayer;
  scores?: LivePlayerScores;
  events: LiveGameEvent[];
  availability: LiveAvailability;
}

/**
 * Maquina de estados de UMA observacao ao vivo.
 *
 * Duas garantias que justificam a classe existir, no lugar de derivar
 * estado direto de "a porta respondeu":
 *
 * 1. IDENTIDADE. Cada partida observada ganha um `sessionId` proprio e uma
 *    `revision` monotonica. Uma resposta em voo quando a sessao troca e
 *    descartada por `isCurrent()` - mesma filosofia de `draftRevision` no
 *    Champion Select, e o que impede o placar de uma partida de aparecer
 *    na seguinte.
 *
 * 2. CONTINUIDADE. Falha isolada nao encerra a partida (vira `DEGRADED`);
 *    so a ausencia sustentada encerra. Isso separa "o Game Client engasgou"
 *    de "a partida acabou", que sao a mesma coisa pra quem so olha se a
 *    porta respondeu.
 *
 * O `sessionId` e um identificador TECNICO local (contador + instante de
 * inicio). Nao e o `gameId` da Riot, nao e derivado de identidade nenhuma
 * do jogador e nao serve pra correlacionar partidas entre execucoes.
 */
export class LiveGameSession {
  private state: LiveGameSessionState = "UNAVAILABLE";
  private sessionCounter = 0;
  private currentSessionId = "";
  private revision = 0;
  private consecutiveFailures = 0;
  private lastGameTimeSeconds: number | undefined;
  private seenEventIds = new Set<number>();

  getState(): LiveGameSessionState {
    return this.state;
  }

  getSessionId(): string {
    return this.currentSessionId;
  }

  /** Revisao atual: quem dispara uma leitura guarda e confere na volta. */
  getRevision(): number {
    return this.revision;
  }

  /**
   * `true` se a revisao capturada antes da leitura ainda vale. Resposta
   * atrasada de uma sessao anterior devolve `false` e deve ser jogada fora
   * sem tocar em estado nenhum.
   */
  isCurrent(revision: number): boolean {
    return revision === this.revision;
  }

  /**
   * Registra uma leitura bem-sucedida e devolve o snapshot resultante, ou
   * `null` quando a leitura e obsoleta (sessao ja trocou).
   */
  observe(observation: LiveSessionObservation, revision: number, now: Date): LiveGameSnapshot | null {
    if (!this.isCurrent(revision)) return null;

    const gameTime = observation.game.gameTimeSeconds;
    const startsNewGame =
      this.state === "UNAVAILABLE" ||
      this.state === "ENDED" ||
      this.hasGameTimeRegressed(gameTime);

    if (startsNewGame) this.startSession(now);

    this.consecutiveFailures = 0;
    this.state = "LIVE";
    if (gameTime !== undefined) this.lastGameTimeSeconds = gameTime;

    return {
      observedAt: now.toISOString(),
      sessionId: this.currentSessionId,
      game: observation.game,
      activePlayer: { ...observation.activePlayer, scores: observation.scores },
      newEvents: this.extractNewEvents(observation.events),
      availability: observation.availability
    };
  }

  /**
   * Registra uma leitura falha. Sessao LIVE degrada; so encerra depois de
   * `MAX_CONSECUTIVE_FAILURES`. Fora de partida, permanece indisponivel.
   */
  observeFailure(revision: number, gameReachable: boolean): LiveGameSessionState {
    if (!this.isCurrent(revision)) return this.state;

    if (this.state === "LIVE" || this.state === "DEGRADED") {
      this.consecutiveFailures += 1;
      this.state =
        this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? this.endSession() : "DEGRADED";
      return this.state;
    }

    this.state = gameReachable ? "CONNECTING" : "UNAVAILABLE";
    return this.state;
  }

  /**
   * Encerramento explicito - Game Client fechou, app encerrando, usuario
   * saiu. Invalida a revisao pra qualquer resposta em voo ser descartada.
   */
  end(): void {
    if (this.state === "LIVE" || this.state === "DEGRADED") {
      this.endSession();
      return;
    }
    this.state = "UNAVAILABLE";
    this.revision += 1;
    this.resetSessionData();
  }

  private hasGameTimeRegressed(gameTime: number | undefined): boolean {
    if (gameTime === undefined || this.lastGameTimeSeconds === undefined) return false;
    return gameTime < this.lastGameTimeSeconds - GAME_TIME_REGRESSION_TOLERANCE_SECONDS;
  }

  private startSession(now: Date): void {
    this.sessionCounter += 1;
    this.revision += 1;
    this.currentSessionId = `live-${now.getTime().toString(36)}-${this.sessionCounter}`;
    this.resetSessionData();
  }

  private endSession(): "ENDED" {
    this.state = "ENDED";
    this.revision += 1;
    this.resetSessionData();
    return "ENDED";
  }

  /**
   * Zera TUDO que pertence a partida observada. Sem isso, os IDs de evento
   * ja vistos sobreviveriam a troca de partida e a partida nova comecaria
   * suprimindo os proprios eventos como se fossem repetidos.
   */
  private resetSessionData(): void {
    this.consecutiveFailures = 0;
    this.lastGameTimeSeconds = undefined;
    this.seenEventIds = new Set();
  }

  /**
   * Filtra so o que ainda nao foi visto NESTA sessao.
   *
   * `/eventdata` devolve o historico inteiro a cada chamada, entao tratar a
   * resposta como "eventos novos" republicaria a partida inteira a cada
   * segundo. A chave e o `EventID` da propria Riot - identidade factual,
   * nao heuristica de conteudo/tempo. Idempotente por construcao: reprocessar
   * a mesma resposta duas vezes nao produz evento nenhum na segunda.
   *
   * Ordena por ID pra o consumidor receber em ordem factual mesmo se a API
   * devolver fora de ordem.
   */
  private extractNewEvents(events: LiveGameEvent[]): LiveGameEvent[] {
    const fresh: LiveGameEvent[] = [];
    for (const event of events) {
      if (this.seenEventIds.has(event.id)) continue;
      this.seenEventIds.add(event.id);
      fresh.push(event);
    }
    return fresh.sort((left, right) => left.id - right.id);
  }
}
