/**
 * Live Client Data API (Game Client API local, https://127.0.0.1:2999).
 *
 * PROTOTYPE_LOCAL_ONLY / NOT_APPROVED_FOR_PUBLIC_LIVE_GUIDANCE.
 *
 * Fundacao factual e somente leitura pra observar uma partida em andamento
 * na propria maquina. NAO contem - e nao deve ganhar sem revisao de
 * politica - narrador, TTS, coach, recomendacao durante a partida, overlay,
 * automacao, timer inferido ou qualquer analise de inimigo. Ver
 * `docs/live-client-capability-matrix.md`.
 *
 * NAO confundir com a League Client API (LCU, `../lcu/`): sao superficies
 * diferentes, documentadas em secoes separadas pela Riot. O disclaimer de
 * "not officially supported for use with third party applications" pertence
 * a secao do LCU; a Game Client API e apresentada como API HTTPS local para
 * aplicacoes nativas, sem disclaimer equivalente.
 *
 * O produto fala com contrato proprio (`LiveGameSnapshot`) pela mesma regra
 * ja aplicada ao Match-V5 desde a Fase 1: o dominio nao se acopla ao formato
 * de payload de terceiro - aqui reforcado porque o schema acompanha o patch
 * do jogo.
 */
export {
  LIVE_CLIENT_HOST,
  LIVE_CLIENT_PORT,
  LIVE_CLIENT_TIMEOUT_MS,
  requestLiveClient,
  verifyGameClientCertificate,
  type LiveClientResult,
  type LiveClientStatus
} from "./live-client-client.js";
export {
  LIVE_CLIENT_POLL_INTERVAL_MS,
  LiveClientObserver,
  type LiveObservationResult
} from "./live-client-observer.js";
export {
  GAME_TIME_REGRESSION_TOLERANCE_SECONDS,
  LiveGameSession,
  MAX_CONSECUTIVE_FAILURES,
  type LiveSessionObservation
} from "./live-game-session.js";
export {
  normalizeActivePlayer,
  normalizeChampionStats,
  normalizeEvents,
  normalizeGameInfo,
  normalizeScores,
  readNumber,
  readString,
  redactSnapshotForTransport,
  type LiveActivePlayer,
  type LiveAvailability,
  type LiveChampionStats,
  type LiveGameEvent,
  type LiveGameInfo,
  type LiveGameSessionState,
  type LiveGameSnapshot,
  type LivePlayerScores
} from "./live-game-snapshot.js";
export { riotRootCertificate } from "./riot-root-certificate.js";
