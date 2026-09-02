import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { LIVE_CLIENT_POLL_INTERVAL_MS, LiveClientObserver } from "@sparta/riot";
import {
  DISABLED_LIVE_CLIENT_STATE,
  reduceLiveClientState,
  type LiveClientState
} from "./live-client-state";
import { assertTrustedIpcSender } from "./security-policy";


let liveClientState: LiveClientState = DISABLED_LIVE_CLIENT_STATE;

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
 *
 * A decisão de o que expor e quando transmitir é do reducer puro em
 * `live-client-state.ts`; aqui ficam só IPC, broadcast e agendamento.
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

  // Antes da primeira leitura o estado já é "ligado, ainda indisponível" -
  // senão o diagnóstico exibiria "protótipo desligado" durante o primeiro
  // segundo, com o gate aberto.
  liveClientState = { ...DISABLED_LIVE_CLIENT_STATE, enabled: true };

  const observer = new LiveClientObserver();

  function broadcast(payload: LiveClientState) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("sparta:live-client", payload);
    }
  }

  async function poll() {
    const result = await observer.poll();
    // `null` = já havia uma rodada em voo (single-flight). Não acumula.
    if (!result) return;

    const { next, shouldBroadcast } = reduceLiveClientState(liveClientState, result);
    liveClientState = next;
    if (shouldBroadcast) broadcast(next);
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
