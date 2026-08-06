import type {
  LcuDraftSnapshot,
  LcuGameflowPhase,
  LcuObservedGame,
  LcuReadStatus
} from "@sparta/riot";
import type { Role } from "@sparta/core";

export {};

declare global {
  interface Window {
    sparta: {
      version: string;
      realtimeAssistance: boolean;
      session: {
        get: () => Promise<string | null>;
        set: (token: string) => Promise<boolean>;
        clear: () => Promise<void>;
      };
      openRiotAuthorization: (url: string) => Promise<void>;
      onGameflowPhase: (callback: (phase: LcuGameflowPhase | null) => void) => () => void;
      /** Baixa a imagem pro disco e devolve um data URL carregavel pelo renderer. */
      downloadSkin: (url: string, fileName: string) => Promise<string>;
      onPickOrder: (callback: (pickOrder: number | null) => void) => () => void;
      onPlayerRole: (callback: (role: Role | null) => void) => () => void;
      /** Estado atual do LCU, pra quem monta depois do ultimo evento. */
      getLcuState: () => Promise<{
        status: LcuReadStatus;
        phase: LcuGameflowPhase | null;
        pickOrder: number | null;
        playerRole: Role | null;
        draft: LcuDraftSnapshot | null;
        observedGame: LcuObservedGame | null;
      }>;
      /** Draft real (aliados/inimigos/bans) lido da sessao de champion select. */
      onDraftSnapshot: (callback: (draft: LcuDraftSnapshot | null) => void) => () => void;
      onObservedGame: (callback: (game: LcuObservedGame | null) => void) => () => void;
    };
  }
}
