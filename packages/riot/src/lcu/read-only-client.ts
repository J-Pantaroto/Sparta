import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import https from "node:https";

export interface LcuConnectionInfo {
  port: number;
  password: string;
  protocol: "https";
}

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

export interface LcuChampionSelectSnapshot {
  sessionExists: boolean;
  localPlayerCellId?: number;
  actions?: unknown[];
  myTeam?: unknown[];
  theirTeam?: unknown[];
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

function readConnectionInfo(): LcuConnectionInfo | null {
  const lockfilePath = resolveLockfilePath();
  if (!lockfilePath) return null;
  try {
    // Formato do lockfile: processName:pid:port:password:protocol
    const raw = readFileSync(lockfilePath, "utf-8").trim();
    const parts = raw.split(":");
    const port = Number(parts[2]);
    const password = parts[3];
    if (!port || !password) return null;
    return { port, password, protocol: "https" };
  } catch {
    return null;
  }
}

function requestLcu<T>(connection: LcuConnectionInfo, path: string): Promise<T | null> {
  return new Promise((resolve) => {
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
          if (!response.statusCode || response.statusCode >= 400 || !body) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            resolve(null);
          }
        });
      }
    );
    request.on("error", () => resolve(null));
    request.end();
  });
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
 * - GET /lol-champ-select/v1/session
 */
export class LcuReadOnlyClient {
  isClientRunning(): boolean {
    return resolveLockfilePath() !== null;
  }

  async getGameflowPhase(): Promise<LcuGameflowPhase | null> {
    const connection = readConnectionInfo();
    if (!connection) return null;
    return requestLcu<LcuGameflowPhase>(connection, "/lol-gameflow/v1/gameflow-phase");
  }

  async getChampionSelectSession(): Promise<LcuChampionSelectSnapshot> {
    const connection = readConnectionInfo();
    if (!connection) return { sessionExists: false };
    const session = await requestLcu<Record<string, unknown>>(connection, "/lol-champ-select/v1/session");
    if (!session) return { sessionExists: false };
    return {
      sessionExists: true,
      localPlayerCellId: session.localPlayerCellId as number | undefined,
      actions: session.actions as unknown[] | undefined,
      myTeam: session.myTeam as unknown[] | undefined,
      theirTeam: session.theirTeam as unknown[] | undefined
    };
  }
}
