import { contextBridge, ipcRenderer } from "electron";
import type {
  LcuDraftSnapshot,
  LcuGameflowPhase,
  LcuObservedGame,
  LcuReadStatus
} from "@sparta/riot";
import type { Role } from "@sparta/core";

contextBridge.exposeInMainWorld("sparta", {
  version: "0.9.0",
  realtimeAssistance: false,
  session: {
    get(): Promise<string | null> {
      return ipcRenderer.invoke("sparta:session:get");
    },
    set(token: string): Promise<boolean> {
      return ipcRenderer.invoke("sparta:session:set", token);
    },
    clear(): Promise<void> {
      return ipcRenderer.invoke("sparta:session:clear");
    }
  },
  openRiotAuthorization(url: string): Promise<void> {
    return ipcRenderer.invoke("sparta:riot-auth:open", url);
  },
  /**
   * Assina mudancas de fase do gameflow do cliente League (somente leitura).
   * Retorna uma funcao para cancelar a assinatura.
   */
  onGameflowPhase(callback: (phase: LcuGameflowPhase | null) => void) {
    const listener = (_event: unknown, phase: LcuGameflowPhase | null) => callback(phase);
    ipcRenderer.on("sparta:gameflow-phase", listener);
    return () => ipcRenderer.removeListener("sparta:gameflow-phase", listener);
  },
  onLcuStatus(callback: (status: LcuReadStatus) => void) {
    const listener = (_event: unknown, status: LcuReadStatus) => callback(status);
    ipcRenderer.on("sparta:lcu-status", listener);
    return () => ipcRenderer.removeListener("sparta:lcu-status", listener);
  },
  /**
   * Baixa uma imagem pro disco local (userData/skins) e devolve um data URL
   * (nao um caminho de disco) - usado pra aplicar tema de skin offline.
   * `file://` nao carrega no renderer por seguranca do Electron.
   */
  downloadSkin(url: string, fileName: string): Promise<string> {
    return ipcRenderer.invoke("sparta:download-skin", url, fileName);
  },
  /**
   * Assina a ordem de pick real do jogador durante champion select
   * (somente leitura, derivada da sessao do LCU) - null quando fora do
   * champion select ou quando a ordem ainda nao pode ser determinada.
   */
  onPickOrder(callback: (pickOrder: number | null) => void) {
    const listener = (_event: unknown, pickOrder: number | null) => callback(pickOrder);
    ipcRenderer.on("sparta:pick-order", listener);
    return () => ipcRenderer.removeListener("sparta:pick-order", listener);
  },
  /**
   * Assina o papel real do jogador (Top/Jungle/Mid/ADC/Support) durante
   * champion select, derivado do assignedPosition do LCU - reflete troca de
   * lane ao vivo. null fora do champion select ou quando a posicao ainda nao
   * pode ser determinada (blind pick, ARAM, sessao carregando).
   */
  onPlayerRole(callback: (role: Role | null) => void) {
    const listener = (_event: unknown, role: Role | null) => callback(role);
    ipcRenderer.on("sparta:player-role", listener);
    return () => ipcRenderer.removeListener("sparta:player-role", listener);
  },
  /**
   * Assina o draft real lido da sessao de champion select (aliados,
   * inimigos, banimentos e o inimigo da propria rota) - somente leitura,
   * nenhuma acao e enviada ao cliente. null fora do champion select.
   */
  /**
   * Estado atual do LCU sob demanda. Os `on*` acima so disparam quando o
   * valor muda; quem monta depois (recarga do renderer, ou o app aberto ja
   * dentro do champion select) usa isto pra nao comecar vazio.
   */
  getLcuState(): Promise<{
    status: LcuReadStatus;
    phase: LcuGameflowPhase | null;
    pickOrder: number | null;
    playerRole: Role | null;
    draft: LcuDraftSnapshot | null;
    observedGame: LcuObservedGame | null;
  }> {
    return ipcRenderer.invoke("sparta:lcu-state");
  },
  onDraftSnapshot(callback: (draft: LcuDraftSnapshot | null) => void) {
    const listener = (_event: unknown, draft: LcuDraftSnapshot | null) => callback(draft);
    ipcRenderer.on("sparta:draft-snapshot", listener);
    return () => ipcRenderer.removeListener("sparta:draft-snapshot", listener);
  },
  onObservedGame(callback: (game: LcuObservedGame | null) => void) {
    const listener = (_event: unknown, game: LcuObservedGame | null) => callback(game);
    ipcRenderer.on("sparta:observed-game", listener);
    return () => ipcRenderer.removeListener("sparta:observed-game", listener);
  }
});
