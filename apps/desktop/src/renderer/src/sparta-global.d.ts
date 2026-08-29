import type {
  LcuDraftSnapshot,
  LcuGameflowPhase,
  LcuObservedGame,
  LcuReadStatus,
  LiveGameSessionState,
  LiveGameSnapshot
} from "@sparta/riot";
import type { Role } from "@sparta/core";

export {};

/**
 * Observacao ao vivo (Game Client API local), somente leitura e somente
 * diagnostico. `enabled: false` e o normal - o protipo e desligado por
 * padrao (`main/live-guidance-gate.ts`).
 */
export interface LiveClientStatePayload {
  enabled: boolean;
  state: LiveGameSessionState;
  sessionId: string;
  /** Ja redigido: nao carrega Riot ID. */
  snapshot: LiveGameSnapshot | null;
  recentEvents: { id: number; name: string; gameTimeSeconds?: number }[];
}

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
      onLcuStatus: (callback: (status: LcuReadStatus) => void) => () => void;
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
        draftRevision: number;
        observedGame: LcuObservedGame | null;
      }>;
      /** Draft real (aliados/inimigos/bans) lido da sessao de champion select. */
      onDraftSnapshot: (
        callback: (draft: LcuDraftSnapshot | null, revision: number) => void
      ) => () => void;
      onObservedGame: (callback: (game: LcuObservedGame | null) => void) => () => void;
      /**
       * Observacao local da partida em andamento. O renderer recebe o
       * contrato normalizado - nao escolhe URL, host, porta nem endpoint.
       */
      getLiveClientState: () => Promise<LiveClientStatePayload>;
      onLiveClient: (callback: (state: LiveClientStatePayload) => void) => () => void;
    };
  }
}
