import type { LcuGameflowPhase } from "@sparta/riot";
import type { Role } from "@sparta/core";

export {};

declare global {
  interface Window {
    sparta: {
      version: string;
      realtimeAssistance: boolean;
      onGameflowPhase: (callback: (phase: LcuGameflowPhase | null) => void) => () => void;
      /** Baixa a imagem pro disco e devolve um data URL carregavel pelo renderer. */
      downloadSkin: (url: string, fileName: string) => Promise<string>;
      onPickOrder: (callback: (pickOrder: number | null) => void) => () => void;
      onPlayerRole: (callback: (role: Role | null) => void) => () => void;
    };
  }
}
