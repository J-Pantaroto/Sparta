import {
  redactSnapshotForTransport,
  type LiveGameSessionState,
  type LiveGameSnapshot,
  type LiveObservationResult
} from "@sparta/riot";

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
export const RECENT_EVENTS_LIMIT = 8;

export const DISABLED_LIVE_CLIENT_STATE: LiveClientState = {
  enabled: false,
  state: "UNAVAILABLE",
  sessionId: "",
  snapshot: null,
  recentEvents: []
};

export interface LiveClientReduction {
  next: LiveClientState;
  /**
   * Se vale transmitir ao renderer. Toda leitura válida transmite (o relógio
   * anda a cada segundo) e toda mudança de ciclo de vida também; leitura
   * falha dentro do mesmo estado não gera tráfego de IPC repetido.
   */
  shouldBroadcast: boolean;
}

/**
 * Reducer PURO do estado exposto ao renderer.
 *
 * Vive separado do watcher de propósito: aqui estão as três regras que
 * precisam de teste e que, dentro do closure do watcher, dependeriam de
 * Electron pra serem exercitadas — redação do Riot ID antes do IPC,
 * isolamento do histórico de eventos entre partidas, e quando transmitir.
 */
export function reduceLiveClientState(
  previous: LiveClientState,
  result: LiveObservationResult
): LiveClientReduction {
  const sessionEnded = result.state === "ENDED" || result.state === "UNAVAILABLE";
  // Troca de sessão zera o histórico do diagnóstico; senão a partida nova
  // nasceria exibindo eventos da anterior.
  const changedSession = Boolean(
    result.snapshot && result.snapshot.sessionId !== previous.sessionId
  );

  let recentEvents = sessionEnded || changedSession ? [] : previous.recentEvents;
  if (result.snapshot?.newEvents.length) {
    recentEvents = [...result.snapshot.newEvents, ...recentEvents].slice(0, RECENT_EVENTS_LIMIT);
  }

  const sessionId = sessionEnded ? "" : (result.snapshot?.sessionId ?? previous.sessionId);

  return {
    next: {
      enabled: true,
      state: result.state,
      sessionId,
      // Única passagem do snapshot pro renderer: sempre redigido.
      snapshot: result.snapshot ? redactSnapshotForTransport(result.snapshot) : null,
      recentEvents
    },
    shouldBroadcast: Boolean(result.snapshot) || result.state !== previous.state
  };
}
