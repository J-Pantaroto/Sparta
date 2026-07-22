import { contextBridge, ipcRenderer } from "electron";
import type { LcuGameflowPhase } from "@sparta/riot";

contextBridge.exposeInMainWorld("sparta", {
  version: "0.1.0",
  realtimeAssistance: false,
  /**
   * Assina mudancas de fase do gameflow do cliente League (somente leitura).
   * Retorna uma funcao para cancelar a assinatura.
   */
  onGameflowPhase(callback: (phase: LcuGameflowPhase | null) => void) {
    const listener = (_event: unknown, phase: LcuGameflowPhase | null) => callback(phase);
    ipcRenderer.on("sparta:gameflow-phase", listener);
    return () => ipcRenderer.removeListener("sparta:gameflow-phase", listener);
  },
  /**
   * Baixa uma imagem pro disco local (userData/skins) e devolve o caminho
   * do arquivo salvo - usado pra aplicar tema de skin offline.
   */
  downloadSkin(url: string, fileName: string): Promise<string> {
    return ipcRenderer.invoke("sparta:download-skin", url, fileName);
  }
});
