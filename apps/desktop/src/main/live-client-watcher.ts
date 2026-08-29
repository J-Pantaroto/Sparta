import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  LIVE_CLIENT_POLL_INTERVAL_MS,
  LiveClientObserver,
  redactSnapshotForTransport,
  type LiveGameSessionState,
  type LiveGameSnapshot
} from "@sparta/riot";
import { assertTrustedIpcSender } from "./security-policy";

/**
 * Estado que o renderer pode ver. Deliberadamente pequeno: o snapshot
 * completo fica no main, e o que atravessa o IPC já passou por
 * `redactSnapshotForTransport` (sem Riot ID).
 */
export interface LiveClientState {
  enabled: boolean;
  state: LiveGameSessionState;
  sessionId: string;
  snapshot: LiveGameSnapshot | null;
  /** Últimos eventos observados, mantidos só pra o painel de diagnóstico. */
  recentEvents: { id: number; name: string; gameTimeSeconds?: number }[];
}

/** Quantos eventos o diagnóstico guarda. Nada é persistido em disco. */
const RECENT_EVENTS_LIMIT = 8;

const DISABLED_STATE: LiveClientState = {
  enabled: false,
  state: "UNAVAILABLE",
  sessionId: "",
  snapshot: null,
  recentEvents: []
};

let liveClientState: LiveClientState = DISABLED_STATE;

/**
 * Observação local e somente leitura da partida em andamento, via Game
 * Client API (https://127.0.0.1:2999).
 *
 * Escopo desta etapa (ver `docs/live-client-capability-matrix.md`): observar
 * e diagnosticar. Nenhuma orientação, narração, voz, overlay, automação ou
 * análise de adversário é produzida aqui - e nada disso deve ser adicionado
 * sem passar pela matriz de capacidade e pela comunicação à Riot.
 *
 * O renderer NUNCA escolhe URL: o canal devolve o contrato normalizado e
 * nada mais. Não existe (e não deve existir) um `fetch(url)` genérico
 * exposto pelo preload - é o que impede este watcher de virar um proxy HTTP
 * pra localhost.
 */
export function registerLiveClientWatcher(options: {
  enabled: boolean;
  expectedRendererUrl: () => string;
}): void {
  ipcMain.handle("sparta:live-client-state", (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, options.expectedRendererUrl());
    return liveClientState;
  });

  // Gate fechado: o canal existe (pro renderer poder perguntar e receber
  // `enabled: false`), mas nenhum poll acontece e nada é observado.
  if (!options.enabled) return;

  const observer = new LiveClientObserver();
  let lastState: LiveGameSessionState = "UNAVAILABLE";
  let lastSessionId = "";
  let recentEvents: LiveClientState["recentEvents"] = [];

  function broadcast(payload: LiveClientState) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("sparta:live-client", payload);
    }
  }

  async function poll() {
    const result = await observer.poll();
    // `null` = já havia uma rodada em voo (single-flight). Não acumula.
    if (!result) return;

    // Troca de sessão zera o histórico de eventos do diagnóstico, senão a
    // partida nova nasceria exibindo eventos da anterior.
    if (result.snapshot && result.snapshot.sessionId !== lastSessionId) {
      recentEvents = [];
      lastSessionId = result.snapshot.sessionId;
    }
    if (result.state === "ENDED" || result.state === "UNAVAILABLE") {
      recentEvents = [];
      lastSessionId = "";
    }

    if (result.snapshot?.newEvents.length) {
      recentEvents = [...result.snapshot.newEvents, ...recentEvents].slice(0, RECENT_EVENTS_LIMIT);
    }

    const next: LiveClientState = {
      enabled: true,
      state: result.state,
      sessionId: result.snapshot?.sessionId ?? lastSessionId,
      snapshot: result.snapshot ? redactSnapshotForTransport(result.snapshot) : null,
      recentEvents
    };
    liveClientState = next;

    // Transmite em toda leitura válida (o relógio muda a cada segundo) e
    // sempre que o estado do ciclo de vida mudar.
    if (result.snapshot || result.state !== lastState) {
      lastState = result.state;
      broadcast(next);
    }
  }

  function schedulePoll() {
    void poll()
      .catch(() => {
        // Falha inesperada não derruba o watcher nem vaza payload pro log:
        // a própria máquina de estados degrada e encerra a sessão sozinha.
      })
      .finally(() => globalThis.setTimeout(schedulePoll, LIVE_CLIENT_POLL_INTERVAL_MS));
  }
  schedulePoll();
}
