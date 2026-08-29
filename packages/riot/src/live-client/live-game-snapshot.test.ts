import { describe, expect, it } from "vitest";
import {
  normalizeActivePlayer,
  normalizeChampionStats,
  normalizeEvents,
  normalizeGameInfo,
  normalizeScores,
  readNumber,
  redactSnapshotForTransport,
  type LiveGameSnapshot
} from "./live-game-snapshot.js";

/**
 * Fixtures SANITIZADAS. Nenhum Riot ID real, nenhum identificador de conta
 * de verdade - o formato e o da Riot, os valores sao inventados pro teste.
 */
const GAME_STATS_FIXTURE = {
  gameMode: "PRACTICETOOL",
  gameTime: 754.12,
  mapName: "Map11",
  mapNumber: 11,
  mapTerrain: "Default"
};

const ACTIVE_PLAYER_FIXTURE = {
  riotId: "TestSummoner#TEST",
  level: 9,
  currentGold: 1260.5,
  championStats: { abilityPower: 0, armor: 48.6, currentHealth: 1120, maxHealth: 1420 }
};

describe("normalizeGameInfo", () => {
  it("preserva os campos factuais do gamestats", () => {
    const game = normalizeGameInfo(GAME_STATS_FIXTURE);
    expect(game.gameTimeSeconds).toBe(754.12);
    expect(game.mode).toBe("PRACTICETOOL");
    expect(game.mapName).toBe("Map11");
    expect(game.mapNumber).toBe(11);
  });

  it("payload ausente vira campos ausentes, nunca zero", () => {
    const game = normalizeGameInfo(undefined);
    expect(game.gameTimeSeconds).toBeUndefined();
    expect(game.mode).toBeUndefined();
    // A distincao que importa: undefined, nao 0.
    expect(game.gameTimeSeconds).not.toBe(0);
  });

  it("ignora campos extras sem quebrar (mudanca aditiva da Riot)", () => {
    const game = normalizeGameInfo({ ...GAME_STATS_FIXTURE, campoNovoDaRiot: { aninhado: true } });
    expect(game.gameTimeSeconds).toBe(754.12);
    expect(game.mode).toBe("PRACTICETOOL");
  });

  it("rejeita tipo inesperado em vez de coagir", () => {
    const game = normalizeGameInfo({ gameTime: "754", mapNumber: null, gameMode: 42 });
    expect(game.gameTimeSeconds).toBeUndefined();
    expect(game.mapNumber).toBeUndefined();
    expect(game.mode).toBeUndefined();
  });
});

describe("ausente != zero", () => {
  it("gameTime 0 real e preservado como 0", () => {
    // Primeiro segundo de partida devolve 0 - isso e um fato observado,
    // e precisa sobreviver ao normalizador.
    expect(normalizeGameInfo({ gameTime: 0 }).gameTimeSeconds).toBe(0);
  });

  it("placar zerado real e preservado; placar ausente fica indefinido", () => {
    const zeroed = normalizeScores({ kills: 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 });
    expect(zeroed).toEqual({ kills: 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 });
    expect(normalizeScores(undefined)).toBeUndefined();
  });

  it("ouro/nivel ausentes ficam indefinidos", () => {
    const player = normalizeActivePlayer({ riotId: "X#Y" });
    expect(player.currentGold).toBeUndefined();
    expect(player.level).toBeUndefined();
  });

  it("NaN e Infinity nao passam como numero", () => {
    expect(readNumber({ v: Number.NaN }, "v")).toBeUndefined();
    expect(readNumber({ v: Number.POSITIVE_INFINITY }, "v")).toBeUndefined();
    expect(readNumber({ v: 0 }, "v")).toBe(0);
  });

  it("championStats sem nenhum campo reconhecido vira ausencia, nao objeto vazio", () => {
    expect(normalizeChampionStats({ soCampoDesconhecido: 1 })).toBeUndefined();
    expect(normalizeChampionStats({ armor: 0 })).toEqual(
      expect.objectContaining({ armor: 0 })
    );
  });
});

describe("normalizeEvents", () => {
  it("preserva id, nome e tempo dos eventos reais", () => {
    const events = normalizeEvents({
      Events: [
        { EventID: 0, EventName: "GameStart", EventTime: 0.05 },
        { EventID: 1, EventName: "MinionsSpawning", EventTime: 65.01 }
      ]
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ id: 0, name: "GameStart", gameTimeSeconds: 0.05 });
  });

  it("descarta evento sem EventID - sem identidade nao ha deduplicacao possivel", () => {
    const events = normalizeEvents({
      Events: [{ EventName: "SemId" }, { EventID: 3, EventName: "ComId" }]
    });
    expect(events).toEqual([{ id: 3, name: "ComId", gameTimeSeconds: undefined }]);
  });

  it("payload sem lista de eventos devolve lista vazia", () => {
    expect(normalizeEvents({})).toEqual([]);
    expect(normalizeEvents({ Events: "nao e array" })).toEqual([]);
    expect(normalizeEvents(undefined)).toEqual([]);
  });
});

describe("redactSnapshotForTransport", () => {
  it("remove o Riot ID antes do snapshot cruzar o IPC", () => {
    const snapshot: LiveGameSnapshot = {
      observedAt: "2026-08-29T12:00:00.000Z",
      sessionId: "live-abc-1",
      game: normalizeGameInfo(GAME_STATS_FIXTURE),
      activePlayer: normalizeActivePlayer(ACTIVE_PLAYER_FIXTURE),
      newEvents: [],
      availability: { game: true, activePlayer: true, scores: false, events: true }
    };
    expect(snapshot.activePlayer.riotId).toBe("TestSummoner#TEST");

    const redacted = redactSnapshotForTransport(snapshot);
    expect(redacted.activePlayer.riotId).toBeUndefined();
    expect("riotId" in redacted.activePlayer).toBe(false);
    // O resto do dado factual sobrevive - a redacao e cirurgica.
    expect(redacted.activePlayer.level).toBe(9);
    expect(redacted.game.gameTimeSeconds).toBe(754.12);
    // E o snapshot original nao e mutado.
    expect(snapshot.activePlayer.riotId).toBe("TestSummoner#TEST");
  });

  it("nenhum Riot ID sobrevive a serializacao do snapshot redigido", () => {
    const snapshot: LiveGameSnapshot = {
      observedAt: "2026-08-29T12:00:00.000Z",
      sessionId: "live-abc-1",
      game: {},
      activePlayer: normalizeActivePlayer(ACTIVE_PLAYER_FIXTURE),
      newEvents: [],
      availability: { game: true, activePlayer: true, scores: false, events: false }
    };
    const serialized = JSON.stringify(redactSnapshotForTransport(snapshot));
    expect(serialized).not.toContain("TestSummoner");
    expect(serialized).not.toContain("#TEST");
  });
});
