// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LiveGameSnapshot, LiveObservationResult } from "@sparta/riot";
import {
  DISABLED_LIVE_CLIENT_STATE,
  RECENT_EVENTS_LIMIT,
  reduceLiveClientState
} from "./live-client-state";

function snapshot(overrides: Partial<LiveGameSnapshot> = {}): LiveGameSnapshot {
  return {
    observedAt: "2026-09-02T12:00:00.000Z",
    sessionId: "live-abc-1",
    game: { gameTimeSeconds: 120, mode: "CLASSIC", mapName: "Summoner's Rift" },
    activePlayer: {
      riotId: "Zekerus#117",
      level: 6,
      currentGold: 1200,
      scores: { kills: 1, deaths: 0, assists: 2, creepScore: 40 }
    },
    newEvents: [],
    availability: { game: true, activePlayer: true, scores: true, events: true },
    ...overrides
  };
}

const live = (value: LiveGameSnapshot | null, state: LiveObservationResult["state"] = "LIVE") => ({
  state,
  snapshot: value
});

describe("estado exposto ao renderer", () => {
  it("redige o Riot ID antes de qualquer travessia de IPC", () => {
    const { next } = reduceLiveClientState(DISABLED_LIVE_CLIENT_STATE, live(snapshot()));

    expect(next.snapshot?.activePlayer.riotId).toBeUndefined();
    // Serializa o payload inteiro: o identificador não pode sobreviver em
    // nenhum campo, nem aninhado.
    expect(JSON.stringify(next)).not.toContain("Zekerus");
    // E o que É factual do próprio jogador continua presente.
    expect(next.snapshot?.activePlayer.level).toBe(6);
    expect(next.snapshot?.activePlayer.scores?.creepScore).toBe(40);
  });

  it("preserva zero real e ausência real, sem trocar um pelo outro", () => {
    const { next } = reduceLiveClientState(
      DISABLED_LIVE_CLIENT_STATE,
      live(
        snapshot({
          game: { gameTimeSeconds: 0 },
          activePlayer: { currentGold: 0 },
          availability: { game: true, activePlayer: true, scores: false, events: true }
        })
      )
    );

    expect(next.snapshot?.game.gameTimeSeconds).toBe(0);
    expect(next.snapshot?.activePlayer.currentGold).toBe(0);
    expect(next.snapshot?.activePlayer.scores).toBeUndefined();
    expect(next.snapshot?.availability.scores).toBe(false);
  });

  it("acumula eventos novos, do mais recente pro mais antigo", () => {
    const first = reduceLiveClientState(
      DISABLED_LIVE_CLIENT_STATE,
      live(snapshot({ newEvents: [{ id: 1, name: "GameStart", gameTimeSeconds: 0 }] }))
    ).next;

    const second = reduceLiveClientState(
      first,
      live(snapshot({ newEvents: [{ id: 2, name: "FirstBlood", gameTimeSeconds: 95 }] }))
    ).next;

    expect(second.recentEvents.map((event) => event.id)).toEqual([2, 1]);
  });

  it("limita o histórico do diagnóstico", () => {
    let state = DISABLED_LIVE_CLIENT_STATE;
    for (let id = 1; id <= RECENT_EVENTS_LIMIT + 4; id += 1) {
      state = reduceLiveClientState(
        state,
        live(snapshot({ newEvents: [{ id, name: `Evento${id}` }] }))
      ).next;
    }

    expect(state.recentEvents).toHaveLength(RECENT_EVENTS_LIMIT);
    expect(state.recentEvents[0]?.id).toBe(RECENT_EVENTS_LIMIT + 4);
  });

  it("partida nova nunca herda eventos da anterior", () => {
    const previous = reduceLiveClientState(
      DISABLED_LIVE_CLIENT_STATE,
      live(snapshot({ newEvents: [{ id: 7, name: "DragonKill" }] }))
    ).next;

    const { next } = reduceLiveClientState(
      previous,
      live(snapshot({ sessionId: "live-xyz-2", newEvents: [{ id: 1, name: "GameStart" }] }))
    );

    expect(next.sessionId).toBe("live-xyz-2");
    expect(next.recentEvents.map((event) => event.id)).toEqual([1]);
  });

  it("encerramento limpa sessão e eventos", () => {
    const previous = reduceLiveClientState(
      DISABLED_LIVE_CLIENT_STATE,
      live(snapshot({ newEvents: [{ id: 3, name: "TurretKilled" }] }))
    ).next;

    for (const state of ["ENDED", "UNAVAILABLE"] as const) {
      const { next } = reduceLiveClientState(previous, { state, snapshot: null });
      expect(next.sessionId).toBe("");
      expect(next.recentEvents).toEqual([]);
      expect(next.snapshot).toBeNull();
    }
  });

  it("DEGRADED preserva a sessão e o histórico observado", () => {
    // Uma leitura falha isolada não pode apagar o que já foi observado - é a
    // diferença entre "o Game Client engasgou" e "a partida acabou".
    const previous = reduceLiveClientState(
      DISABLED_LIVE_CLIENT_STATE,
      live(snapshot({ newEvents: [{ id: 5, name: "InhibKilled" }] }))
    ).next;

    const { next } = reduceLiveClientState(previous, { state: "DEGRADED", snapshot: null });

    expect(next.sessionId).toBe("live-abc-1");
    expect(next.recentEvents.map((event) => event.id)).toEqual([5]);
  });

  it("transmite em leitura válida e em mudança de estado, não em repetição", () => {
    const first = reduceLiveClientState(DISABLED_LIVE_CLIENT_STATE, live(snapshot()));
    expect(first.shouldBroadcast).toBe(true);

    const degraded = reduceLiveClientState(first.next, { state: "DEGRADED", snapshot: null });
    expect(degraded.shouldBroadcast).toBe(true);

    const stillDegraded = reduceLiveClientState(degraded.next, {
      state: "DEGRADED",
      snapshot: null
    });
    expect(stillDegraded.shouldBroadcast).toBe(false);
  });
});
