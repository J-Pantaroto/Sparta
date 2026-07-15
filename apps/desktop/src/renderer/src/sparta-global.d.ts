import type { LcuGameflowPhase } from "@sparta/riot";

export {};

declare global {
  interface Window {
    sparta: {
      version: string;
      realtimeAssistance: boolean;
      onGameflowPhase: (callback: (phase: LcuGameflowPhase | null) => void) => () => void;
    };
  }
}
