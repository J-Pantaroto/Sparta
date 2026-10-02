import { describe, expect, it } from "vitest";
import { toCoachingLiveFacts } from "./coaching-live-facts";

describe("contexto factual do coach", () => {
  it("preserva zeros, calcula apenas razoes proprias e remove identidade", () => {
    const facts = toCoachingLiveFacts({
      observedAt: "2026-10-02T12:00:00.000Z",
      sessionId: "s",
      game: { gameTimeSeconds: 0 },
      activePlayer: {
        riotId: "nao-deve-sair#BR1",
        currentGold: 0,
        championStats: { currentHealth: 250, maxHealth: 1_000, resourceValue: 0, resourceMax: 500 },
        scores: { kills: 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 }
      },
      newEvents: [{ id: 7, name: "DragonKill", gameTimeSeconds: 600 }],
      availability: { game: true, activePlayer: true, scores: true, events: true }
    });
    expect(facts.currentGold).toBe(0);
    expect(facts.healthRatio).toBe(0.25);
    expect(facts.resourceRatio).toBe(0);
    expect(facts.newEventRefs).toEqual(["live.event.7"]);
    expect(JSON.stringify(facts)).not.toContain("nao-deve-sair");
    expect(JSON.stringify(facts)).not.toContain("DragonKill");
  });
});
