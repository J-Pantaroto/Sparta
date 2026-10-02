import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_COACHING_SETTINGS,
  type LocalCoachingModel,
  type LocalCoachingModelResult
} from "@sparta/core";
import type { LiveGameSnapshot } from "@sparta/riot";
import type { VoiceOutput } from "./voice-output";

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}));
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      electron.handlers.set(channel, handler)
  }
}));

import {
  registerLocalCoachingRuntime,
  sanitizeCoachingSettings,
  sanitizePersonalCoachingContext
} from "./local-coaching-runtime";

function snapshot(sessionId = "live-session"): LiveGameSnapshot {
  return {
    sessionId,
    observedAt: "2026-10-02T12:00:00.000Z",
    game: { gameTimeSeconds: 120 },
    activePlayer: {
      level: 2,
      currentGold: 0,
      championStats: { currentHealth: 500, maxHealth: 1_000, resourceValue: 200, resourceMax: 500 },
      scores: { kills: 0, deaths: 0, assists: 0, creepScore: 8, wardScore: 0 }
    },
    newEvents: [],
    availability: { game: true, activePlayer: true, scores: true, events: true }
  };
}

describe("local coaching runtime", () => {
  let directory = "";

  beforeEach(async () => {
    electron.handlers.clear();
    directory = await mkdtemp(join(tmpdir(), "sparta-local-coach-"));
    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({ ...DEFAULT_COACHING_SETTINGS, enabled: true }),
      "utf8"
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("reconstroi settings e contexto pessoal por allowlist antes do modelo", () => {
    const settings = sanitizeCoachingSettings({
      ...DEFAULT_COACHING_SETTINGS,
      categories: { ...DEFAULT_COACHING_SETTINGS.categories, ENEMY_TRACKING: true },
      privateValue: "nao deve atravessar"
    });
    expect(settings).toEqual(DEFAULT_COACHING_SETTINGS);
    expect(settings?.categories).not.toHaveProperty("ENEMY_TRACKING");

    const signal = {
      state: "RECURRING_CONCERN",
      sampleSize: 8,
      coverage: 0.75,
      matchIds: ["segredo"]
    };
    const personal = sanitizePersonalCoachingContext({
      version: "personal-coaching-context/1.0.0",
      generatedAt: "2026-10-02T12:00:00.000Z",
      vision: signal,
      survivability: signal,
      farming: signal,
      objectives: signal,
      riotId: "nao deve atravessar"
    });
    expect(personal).not.toHaveProperty("riotId");
    expect(personal?.vision).toEqual({
      state: "RECURRING_CONCERN",
      sampleSize: 8,
      coverage: 0.75
    });
    expect(personal?.vision).not.toHaveProperty("matchIds");
  });

  it("fala somente depois de modelo, schema e policy e cancela ao encerrar a sessao", async () => {
    const evaluate = vi.fn(async (context): Promise<LocalCoachingModelResult> => ({
      status: "DECISION",
      latencyMs: 24,
      value: {
        schemaVersion: "coaching-decision/1.0.0",
        shouldSpeak: true,
        sessionId: context.sessionId,
        category: "VISION",
        priority: "NORMAL",
        confidence: 0.9,
        observation: "VISION_WINDOW",
        options: ["ESTABLISH_VISION_WHEN_SAFE"],
        evidenceRefs: ["live.wardScore"],
        knowledgeRefs: ["generic.vision.safe-window.v1"],
        cooldownKey: "vision.safe-window",
        ttlMs: 5_000
      }
    }));
    const model: LocalCoachingModel = {
      provider: "fake-local",
      model: "fake-v1",
      health: vi.fn(async (): Promise<"AVAILABLE"> => "AVAILABLE"),
      evaluate
    };
    const voice: VoiceOutput = {
      listVoices: vi.fn(async () => []),
      speak: vi.fn(async () => undefined),
      cancel: vi.fn()
    };
    const controller = registerLocalCoachingRuntime({
      prototypeEnabled: true,
      expectedRendererUrl: () => "file:///sparta/index.html",
      settingsPath: join(directory, "settings.json"),
      model,
      voice,
      now: () => Date.parse("2026-10-02T12:00:01.000Z")
    });
    await vi.waitFor(() => expect(controller.getState().modelStatus).toBe("AVAILABLE"));
    controller.handleLiveObservation("LIVE", snapshot());
    await vi.waitFor(() => expect(voice.speak).toHaveBeenCalledTimes(1));
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(voice.speak).toHaveBeenCalledWith(
      expect.stringContaining("Uma opção"),
      expect.objectContaining({ volume: 70, rate: 0 })
    );
    controller.handleLiveObservation("ENDED", null);
    expect(voice.cancel).toHaveBeenCalled();
    expect(controller.getState().activeSessionId).toBeNull();
    expect(controller.getState().metrics.spoken).toBe(1);
    controller.stop();
  });

  it("silencio e resposta invalida nunca chegam ao TTS", async () => {
    const results: LocalCoachingModelResult[] = [
      { status: "SILENCE", latencyMs: 5 },
      { status: "INVALID", latencyMs: 6 },
      { status: "INVALID", latencyMs: 7 }
    ];
    const model: LocalCoachingModel = {
      provider: "fake-local",
      model: "fake-v1",
      health: vi.fn(async (): Promise<"AVAILABLE"> => "AVAILABLE"),
      evaluate: vi.fn(
        async (): Promise<LocalCoachingModelResult> =>
          results.shift() ?? { status: "SILENCE", latencyMs: 1 }
      )
    };
    const voice: VoiceOutput = {
      listVoices: vi.fn(async () => []),
      speak: vi.fn(async () => undefined),
      cancel: vi.fn()
    };
    let clock = Date.parse("2026-10-02T12:00:01.000Z");
    const controller = registerLocalCoachingRuntime({
      prototypeEnabled: true,
      expectedRendererUrl: () => "file:///sparta/index.html",
      settingsPath: join(directory, "settings.json"),
      model,
      voice,
      now: () => clock
    });
    await vi.waitFor(() => expect(controller.getState().modelStatus).toBe("AVAILABLE"));
    controller.handleLiveObservation("LIVE", snapshot("s1"));
    await vi.waitFor(() => expect(controller.getState().metrics.silence).toBe(1));
    clock += 20_000;
    const next = snapshot("s1");
    next.observedAt = new Date(clock).toISOString();
    next.activePlayer.scores = { ...next.activePlayer.scores, deaths: 1 };
    controller.handleLiveObservation("LIVE", next);
    await vi.waitFor(() => expect(controller.getState().metrics.rejected).toBe(1));
    expect(model.evaluate).toHaveBeenCalledTimes(3); // uma normal + uma tentativa limitada de reparo
    expect(voice.speak).not.toHaveBeenCalled();
    controller.stop();
  });

  it("gate fechado mantem inferencia e voz inativas", async () => {
    const model: LocalCoachingModel = {
      provider: "fake-local",
      model: "fake-v1",
      health: vi.fn(async (): Promise<"AVAILABLE"> => "AVAILABLE"),
      evaluate: vi.fn()
    };
    const voice: VoiceOutput = {
      listVoices: vi.fn(async () => []),
      speak: vi.fn(),
      cancel: vi.fn()
    };
    const controller = registerLocalCoachingRuntime({
      prototypeEnabled: false,
      expectedRendererUrl: () => "file:///sparta/index.html",
      settingsPath: join(directory, "settings.json"),
      model,
      voice
    });
    await vi.waitFor(() => expect(controller.getState().modelStatus).toBe("DISABLED"));
    controller.handleLiveObservation("LIVE", snapshot());
    expect(model.evaluate).not.toHaveBeenCalled();
    expect(voice.speak).not.toHaveBeenCalled();
    controller.stop();
  });

  it("cancela a anterior e processa somente a situacao mais nova sem sobrepor inferencias", async () => {
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    const model: LocalCoachingModel = {
      provider: "fake-local",
      model: "fake-v1",
      health: vi.fn(async (): Promise<"AVAILABLE"> => "AVAILABLE"),
      evaluate: vi.fn(async (context, signal): Promise<LocalCoachingModelResult> => {
        calls += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (calls === 1) {
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true })
          );
          active -= 1;
          return { status: "CANCELED", latencyMs: 10 };
        }
        active -= 1;
        return {
          status: "DECISION",
          latencyMs: 8,
          value: {
            schemaVersion: "coaching-decision/1.0.0",
            shouldSpeak: true,
            sessionId: context.sessionId,
            category: "SURVIVABILITY",
            priority: "HIGH",
            confidence: 0.9,
            observation: "LOW_SURVIVABILITY_MARGIN",
            options: ["PLAY_WITH_SAFETY_MARGIN"],
            evidenceRefs: ["live.deaths"],
            knowledgeRefs: ["generic.survivability.margin.v1"],
            cooldownKey: "survivability.death",
            ttlMs: 5_000
          }
        };
      })
    };
    const voice: VoiceOutput = {
      listVoices: vi.fn(async () => []),
      speak: vi.fn(async () => undefined),
      cancel: vi.fn()
    };
    let clock = Date.parse("2026-10-02T12:00:01.000Z");
    const controller = registerLocalCoachingRuntime({
      prototypeEnabled: true,
      expectedRendererUrl: () => "file:///sparta/index.html",
      settingsPath: join(directory, "settings.json"),
      model,
      voice,
      now: () => clock
    });
    await vi.waitFor(() => expect(controller.getState().modelStatus).toBe("AVAILABLE"));
    controller.handleLiveObservation("LIVE", snapshot("latest"));
    await vi.waitFor(() => expect(model.evaluate).toHaveBeenCalledTimes(1));
    clock += 20_000;
    const latest = snapshot("latest");
    latest.observedAt = new Date(clock).toISOString();
    latest.activePlayer.scores = { ...latest.activePlayer.scores, deaths: 1 };
    controller.handleLiveObservation("LIVE", latest);
    await vi.waitFor(() => expect(voice.speak).toHaveBeenCalledTimes(1));
    expect(model.evaluate).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
    expect(voice.speak).toHaveBeenCalledWith(
      expect.stringContaining("margem de vida"),
      expect.any(Object)
    );
    controller.stop();
  });
});
