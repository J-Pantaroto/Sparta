/**
 * Contrato PROPRIO do Sparta pra observacao ao vivo. Deliberadamente NAO e
 * o JSON da Riot, pela mesma regra ja aplicada ao Match-V5 desde a Fase 1
 * (mappers em `../mappers/`): o dominio nao se acopla ao formato de payload
 * de terceiro. Aqui isso pesa mais porque o schema da Game Client API
 * acompanha o patch do jogo e pode ganhar campos a qualquer atualizacao.
 *
 * (NAO confundir com a League Client API: o disclaimer de "not officially
 * supported for use with third party applications" da documentacao da Riot
 * pertence a secao do LCU, nao a da Game Client API. Ver `./index.ts`.)
 *
 * REGRA CENTRAL: ausente != zero.
 *
 * Todo campo que a API pode nao devolver e opcional aqui. Um `0` neste
 * contrato significa "a API devolveu zero" - nunca "nao veio". Preencher
 * ausencia com zero produziria um ouro de 0, um KDA de 0/0/0 ou um nivel 0
 * que o jogador leria como fato. Mesmo principio ja aplicado em
 * `StatCoverage` e nas metricas de recomendacao.
 */

/** Estados de uma sessao de observacao ao vivo. */
export type LiveGameSessionState =
  /** Nada escutando em :2999. Estado de repouso, nao erro. */
  | "UNAVAILABLE"
  /** Porta respondeu, mas ainda nao ha snapshot valido o bastante. */
  | "CONNECTING"
  /** Observando uma partida com dado valido. */
  | "LIVE"
  /** Estava LIVE e as leituras comecaram a falhar - a sessao sobrevive. */
  | "DEGRADED"
  /** A partida observada terminou; a sessao esta fechada e nao volta. */
  | "ENDED";

/** Estatisticas de campeao do proprio jogador, como a API as devolve. */
export interface LiveChampionStats {
  abilityPower?: number;
  armor?: number;
  attackDamage?: number;
  currentHealth?: number;
  maxHealth?: number;
  magicResist?: number;
  moveSpeed?: number;
  resourceValue?: number;
  resourceMax?: number;
  resourceType?: string;
}

/** Placar do proprio jogador. Nenhum campo de outro jogador entra aqui. */
export interface LivePlayerScores {
  kills?: number;
  deaths?: number;
  assists?: number;
  creepScore?: number;
  wardScore?: number;
}

export interface LiveActivePlayer {
  /**
   * Riot ID do proprio jogador. Presente aqui porque a API o exige como
   * parametro de `/playerscores`, mas NAO e propagado pro renderer nem
   * gravado em disco - ver `redactSnapshotForTransport`.
   */
  riotId?: string;
  level?: number;
  currentGold?: number;
  championStats?: LiveChampionStats;
  scores?: LivePlayerScores;
}

export interface LiveGameInfo {
  /** Segundos desde o inicio, como a API devolve. `0` real e valido. */
  gameTimeSeconds?: number;
  mode?: string;
  mapName?: string;
  mapNumber?: number;
  mapTerrain?: string;
}

/**
 * Evento factual observado. Preserva exatamente o que a API devolveu -
 * nenhum evento e inferido, derivado ou sintetizado.
 */
export interface LiveGameEvent {
  /** `EventID` da propria API: a chave de deduplicacao. */
  id: number;
  /** `EventName` cru, sem traducao nem interpretacao. */
  name: string;
  gameTimeSeconds?: number;
}

/**
 * Que partes da observacao estao disponiveis nesta leitura. Torna a
 * degradacao parcial legivel: `gamestats` pode responder enquanto
 * `playerscores` falha, e isso e diferente de "tudo indisponivel".
 */
export interface LiveAvailability {
  game: boolean;
  activePlayer: boolean;
  scores: boolean;
  events: boolean;
}

export interface LiveGameSnapshot {
  /** ISO do instante da leitura - metadado do Sparta, nao da Riot. */
  observedAt: string;
  /** Identidade da sessao de observacao (ver `live-game-session.ts`). */
  sessionId: string;
  game: LiveGameInfo;
  activePlayer: LiveActivePlayer;
  /** Somente eventos NOVOS desde o snapshot anterior desta sessao. */
  newEvents: LiveGameEvent[];
  availability: LiveAvailability;
}

// ─── Leitura defensiva de payload ────────────────────────────────────────
//
// Cada helper devolve `undefined` quando o campo nao veio OU veio com tipo
// inesperado. Nunca converte, nunca assume, nunca substitui por zero.

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Numero finito de verdade. `NaN`/`Infinity`/string numerica nao passam. */
export function readNumber(source: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readString(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function normalizeGameInfo(payload: unknown): LiveGameInfo {
  const source = asRecord(payload);
  return {
    gameTimeSeconds: readNumber(source, "gameTime"),
    mode: readString(source, "gameMode"),
    mapName: readString(source, "mapName"),
    mapNumber: readNumber(source, "mapNumber"),
    mapTerrain: readString(source, "mapTerrain")
  };
}

export function normalizeChampionStats(payload: unknown): LiveChampionStats | undefined {
  const source = asRecord(payload);
  if (!source) return undefined;
  const stats: LiveChampionStats = {
    abilityPower: readNumber(source, "abilityPower"),
    armor: readNumber(source, "armor"),
    attackDamage: readNumber(source, "attackDamage"),
    currentHealth: readNumber(source, "currentHealth"),
    maxHealth: readNumber(source, "maxHealth"),
    magicResist: readNumber(source, "magicResist"),
    moveSpeed: readNumber(source, "moveSpeed"),
    resourceValue: readNumber(source, "resourceValue"),
    resourceMax: readNumber(source, "resourceMax"),
    resourceType: readString(source, "resourceType")
  };
  // Objeto sem NENHUM campo reconhecido nao vira `{}` - vira ausencia.
  return Object.values(stats).some((value) => value !== undefined) ? stats : undefined;
}

export function normalizeActivePlayer(payload: unknown): LiveActivePlayer {
  const source = asRecord(payload);
  return {
    riotId: readString(source, "riotId"),
    level: readNumber(source, "level"),
    currentGold: readNumber(source, "currentGold"),
    championStats: normalizeChampionStats(source?.championStats)
  };
}

export function normalizeScores(payload: unknown): LivePlayerScores | undefined {
  const source = asRecord(payload);
  if (!source) return undefined;
  const scores: LivePlayerScores = {
    kills: readNumber(source, "kills"),
    deaths: readNumber(source, "deaths"),
    assists: readNumber(source, "assists"),
    creepScore: readNumber(source, "creepScore"),
    wardScore: readNumber(source, "wardScore")
  };
  return Object.values(scores).some((value) => value !== undefined) ? scores : undefined;
}

/**
 * Normaliza a lista de eventos. Descarta entradas sem `EventID` numerico -
 * sem identidade nao ha como deduplicar, e um evento repetido a cada poll
 * seria pior que um evento ausente.
 */
export function normalizeEvents(payload: unknown): LiveGameEvent[] {
  const source = asRecord(payload);
  const raw = source?.Events;
  if (!Array.isArray(raw)) return [];
  const events: LiveGameEvent[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const id = readNumber(record, "EventID");
    const name = readString(record, "EventName");
    if (id === undefined || name === undefined) continue;
    events.push({ id, name, gameTimeSeconds: readNumber(record, "EventTime") });
  }
  return events;
}

/**
 * Remove o Riot ID antes de o snapshot cruzar o IPC pro renderer.
 *
 * O Riot ID e necessario no processo main (a API exige o parametro em
 * `/playerscores`), mas o renderer nao precisa dele pra nada nesta etapa -
 * e o diagnostico nao o exibe. Minimizacao de dado na fronteira, nao
 * confianca de que ninguem vai loga-lo depois.
 */
export function redactSnapshotForTransport(snapshot: LiveGameSnapshot): LiveGameSnapshot {
  // Reconstroi o objeto sem `riotId` em vez de descartar por destructuring:
  // a chave nao chega a existir no resultado, entao nem serializada ela e.
  const activePlayer: LiveActivePlayer = {
    level: snapshot.activePlayer.level,
    currentGold: snapshot.activePlayer.currentGold,
    championStats: snapshot.activePlayer.championStats,
    scores: snapshot.activePlayer.scores
  };
  return { ...snapshot, activePlayer };
}
