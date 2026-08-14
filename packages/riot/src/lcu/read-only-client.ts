import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import https from "node:https";
import { HTTP_TIMEOUTS } from "../http/policy.js";

export interface LcuConnectionInfo {
  port: number;
  password: string;
  protocol: "https";
}

export type LcuReadStatus =
  | "OK"
  | "CLIENT_CLOSED"
  | "LOCKFILE_MISSING"
  | "LOCKFILE_INVALID"
  | "LOCAL_CREDENTIAL_INVALID"
  | "CONNECTION_REFUSED"
  | "REQUEST_TIMEOUT"
  | "ENDPOINT_UNAVAILABLE"
  | "OUTSIDE_CHAMP_SELECT"
  | "INVALID_RESPONSE";

export type LcuReadResult<T> = { status: "OK"; data: T } | { status: Exclude<LcuReadStatus, "OK"> };

/**
 * Fase atual do gameflow do cliente League of Legends.
 * "ChampSelect" e o unico valor que o Sparta usa hoje, para trocar
 * automaticamente a aba da UI para o modo Champion Select.
 */
export type LcuGameflowPhase =
  | "None"
  | "Lobby"
  | "Matchmaking"
  | "CheckedIntoTournament"
  | "ReadyCheck"
  | "ChampSelect"
  | "GameStart"
  | "FailedToLaunch"
  | "InProgress"
  | "Reconnect"
  | "WaitingForStats"
  | "PreEndOfGame"
  | "EndOfGame"
  | (string & {});

/** Uma acao dentro de uma rodada de champion select (pick ou ban). */
export interface LcuChampSelectAction {
  actorCellId: number;
  type: string;
  completed: boolean;
  /**
   * Campeao alvo da acao. Em bans concluidos e o campeao banido; em picks e
   * o campeao escolhido. `0` enquanto a acao ainda nao foi travada, e por
   * isso opcional aqui - o LCU nem sempre inclui a chave.
   */
  championId?: number;
}

/** Um jogador (aliado ou inimigo) na sessao de champion select. */
export interface LcuChampSelectTeamMember {
  cellId: number;
  championId: number;
  assignedPosition?: string;
}

export interface LcuChampionSelectSnapshot {
  sessionExists: boolean;
  /** Identidade da sessão fornecida pelo LCU quando `gameId` já está disponível. */
  sessionId?: string;
  localPlayerCellId?: number;
  /** Array de rodadas - cada rodada e um array de acoes (pick/ban). */
  actions?: LcuChampSelectAction[][];
  myTeam?: LcuChampSelectTeamMember[];
  theirTeam?: LcuChampSelectTeamMember[];
}

export function extractChampionSelectSessionId(
  payload: Record<string, unknown>
): string | undefined {
  const gameId = payload.gameId;
  return typeof gameId === "number" && Number.isSafeInteger(gameId) && gameId > 0
    ? String(gameId)
    : undefined;
}

const DEFAULT_LOCKFILE_PATHS = [
  "C:/Riot Games/League of Legends/lockfile",
  join(homedir(), "AppData/Local/Riot Games/League of Legends/lockfile"),
  "/Applications/League of Legends.app/Contents/LoL/lockfile"
];

function resolveLockfilePath(): string | null {
  const custom = process.env.LEAGUE_CLIENT_PATH;
  if (custom) {
    const candidate = join(custom, "lockfile");
    if (existsSync(candidate)) return candidate;
  }
  return DEFAULT_LOCKFILE_PATHS.find((candidate) => existsSync(candidate)) ?? null;
}

export function parseLcuLockfile(raw: string): LcuReadResult<LcuConnectionInfo> {
  const parts = raw.trim().split(":");
  const port = Number(parts[2]);
  const password = parts[3];
  if (!Number.isInteger(port) || port <= 0 || port > 65_535 || !password || parts[4] !== "https") {
    return { status: "LOCKFILE_INVALID" };
  }
  return { status: "OK", data: { port, password, protocol: "https" } };
}

/** Identidade oficial da partida observada no gameflow local. */
export interface LcuObservedGame {
  gameId: string;
}

function missingLockfileStatus(): "CLIENT_CLOSED" | "LOCKFILE_MISSING" {
  const custom = process.env.LEAGUE_CLIENT_PATH;
  if (custom && existsSync(custom)) return "CLIENT_CLOSED";
  return DEFAULT_LOCKFILE_PATHS.some((candidate) => existsSync(dirname(candidate)))
    ? "CLIENT_CLOSED"
    : "LOCKFILE_MISSING";
}

export function classifyLcuNetworkFailure(
  timedOut: boolean,
  code?: string
): Exclude<LcuReadStatus, "OK"> {
  if (timedOut) return "REQUEST_TIMEOUT";
  return code === "ECONNREFUSED" ? "CONNECTION_REFUSED" : "ENDPOINT_UNAVAILABLE";
}

function readConnectionInfo(): LcuReadResult<LcuConnectionInfo> {
  const lockfilePath = resolveLockfilePath();
  if (!lockfilePath) return { status: missingLockfileStatus() };
  try {
    // Formato do lockfile: processName:pid:port:password:protocol
    const raw = readFileSync(lockfilePath, "utf-8").trim();
    return parseLcuLockfile(raw);
  } catch {
    return { status: "LOCKFILE_INVALID" };
  }
}

function requestLcu<T>(
  connection: LcuConnectionInfo,
  path: string,
  validate: (payload: unknown) => payload is T,
  notFoundStatus: "ENDPOINT_UNAVAILABLE" | "OUTSIDE_CHAMP_SELECT"
): Promise<LcuReadResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const finish = (result: LcuReadResult<T>) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const auth = Buffer.from(`riot:${connection.password}`).toString("base64");
    const request = https.request(
      {
        host: "127.0.0.1",
        port: connection.port,
        path,
        method: "GET",
        // O LCU usa certificado autoassinado local; conexao restrita a 127.0.0.1.
        rejectUnauthorized: false,
        headers: { Authorization: `Basic ${auth}` }
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode === 404) {
            finish({ status: notFoundStatus });
            return;
          }
          if (response.statusCode === 401 || response.statusCode === 403) {
            finish({ status: "LOCAL_CREDENTIAL_INVALID" });
            return;
          }
          if (!response.statusCode || response.statusCode >= 400) {
            finish({ status: "ENDPOINT_UNAVAILABLE" });
            return;
          }
          if (!body) {
            finish({ status: "INVALID_RESPONSE" });
            return;
          }
          try {
            const payload: unknown = JSON.parse(body);
            finish(
              validate(payload) ? { status: "OK", data: payload } : { status: "INVALID_RESPONSE" }
            );
          } catch {
            finish({ status: "INVALID_RESPONSE" });
          }
        });
      }
    );
    request.setTimeout(HTTP_TIMEOUTS.lcuMs, () => {
      timedOut = true;
      request.destroy();
      finish({ status: "REQUEST_TIMEOUT" });
    });
    request.on("error", (error: Error & { code?: string }) => {
      finish({ status: classifyLcuNetworkFailure(timedOut, error.code) });
    });
    request.end();
  });
}

function isGameflowPhase(payload: unknown): payload is LcuGameflowPhase {
  return typeof payload === "string";
}

function isSession(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload);
}

export function extractObservedGame(payload: Record<string, unknown>): LcuObservedGame | undefined {
  const gameData =
    typeof payload.gameData === "object" && payload.gameData !== null
      ? (payload.gameData as Record<string, unknown>)
      : undefined;
  const rawGameId = gameData?.gameId;
  const gameId =
    typeof rawGameId === "number" && Number.isSafeInteger(rawGameId)
      ? String(rawGameId)
      : typeof rawGameId === "string"
        ? rawGameId.trim()
        : "";
  return /^\d+$/.test(gameId) && gameId !== "0" ? { gameId } : undefined;
}

/**
 * Cliente local e somente leitura para o League Client Update (LCU).
 *
 * Escopo (ver docs/riot-compliance.md):
 * - Le a fase do gameflow e a sessao de champion select apenas para
 *   refletir estado na UI do Sparta (ex.: trocar de aba automaticamente).
 * - Nunca envia acoes de escrita ao cliente: nao automatiza pick, ban,
 *   troca de campeao ou runas.
 *
 * Endpoints usados (documentados):
 * - GET /lol-gameflow/v1/gameflow-phase
 * - GET /lol-gameflow/v1/session
 * - GET /lol-champ-select/v1/session
 */
export class LcuReadOnlyClient {
  isClientRunning(): boolean {
    return resolveLockfilePath() !== null;
  }

  async getGameflowPhase(): Promise<LcuReadResult<LcuGameflowPhase>> {
    const connection = readConnectionInfo();
    if (connection.status !== "OK") return connection;
    return requestLcu(
      connection.data,
      "/lol-gameflow/v1/gameflow-phase",
      isGameflowPhase,
      "ENDPOINT_UNAVAILABLE"
    );
  }

  async getChampionSelectSession(): Promise<LcuReadResult<LcuChampionSelectSnapshot>> {
    const connection = readConnectionInfo();
    if (connection.status !== "OK") return connection;
    const session = await requestLcu(
      connection.data,
      "/lol-champ-select/v1/session",
      isSession,
      "OUTSIDE_CHAMP_SELECT"
    );
    if (session.status !== "OK") return session;
    const sessionId = extractChampionSelectSessionId(session.data);

    return {
      status: "OK",
      data: {
        sessionExists: true,
        ...(sessionId ? { sessionId } : {}),
        localPlayerCellId: session.data.localPlayerCellId as number | undefined,
        actions: session.data.actions as LcuChampSelectAction[][] | undefined,
        myTeam: session.data.myTeam as LcuChampSelectTeamMember[] | undefined,
        theirTeam: session.data.theirTeam as LcuChampSelectTeamMember[] | undefined
      }
    };
  }

  async getObservedGame(): Promise<LcuReadResult<LcuObservedGame | undefined>> {
    const connection = readConnectionInfo();
    if (connection.status !== "OK") return connection;
    const session = await requestLcu(
      connection.data,
      "/lol-gameflow/v1/session",
      isSession,
      "ENDPOINT_UNAVAILABLE"
    );
    if (session.status !== "OK") return session;
    return { status: "OK", data: extractObservedGame(session.data) };
  }
}
