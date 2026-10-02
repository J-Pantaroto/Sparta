import { describe, expect, it } from "vitest";
import type { PlayerProfileOverview } from "../profile/player-profile-overview.js";
import {
  applyCoachingPolicy,
  buildPatchKnowledge,
  buildPersonalCoachingContext,
  composeCoachingPhrase,
  deriveLiveStateDelta,
  parseCoachingDecision,
  parseCoachingSilenceDecision,
  unavailablePersonalCoachingContext,
  type CoachingDecision,
  type CoachingModelContext
} from "../index.js";

const decision: CoachingDecision = {
  schemaVersion: "coaching-decision/1.0.0",
  shouldSpeak: true,
  sessionId: "session-1",
  category: "VISION",
  priority: "NORMAL",
  confidence: 0.9,
  observation: "VISION_WINDOW",
  options: ["ESTABLISH_VISION_WHEN_SAFE"],
  evidenceRefs: ["live.wardScore"],
  knowledgeRefs: ["generic.vision.safe-window.v1"],
  cooldownKey: "vision.safe-window",
  ttlMs: 5_000
};

function context(now = "2026-10-02T12:00:00.000Z"): CoachingModelContext {
  const personal = unavailablePersonalCoachingContext(now);
  return {
    schemaVersion: "coaching-model-context/1.0.0",
    sessionId: "session-1",
    generatedAt: now,
    sourceKinds: {
      live: "LIVE_FACT",
      personal: "PERSONAL_HISTORY_FACT",
      patch: "PATCH_KNOWLEDGE",
      generic: "GENERIC_KNOWLEDGE"
    },
    live: {
      sessionId: "session-1",
      observedAt: now,
      wardScore: 0,
      newEventRefs: []
    },
    delta: {
      sessionId: "session-1",
      observedAt: now,
      changedEvidenceRefs: ["live.wardScore"],
      meaningful: true,
      reason: "MEANINGFUL_CHANGE"
    },
    personal,
    knowledge: buildPatchKnowledge(null),
    allowedCategories: ["VISION"],
    evidenceRefs: ["live.wardScore"]
  };
}

describe("local AI coaching contracts", () => {
  it("preserva zero real como evidencia disponivel", () => {
    expect(context().live.wardScore).toBe(0);
    expect(context().evidenceRefs).toContain("live.wardScore");
  });

  it("rejeita campos livres extras no schema do modelo", () => {
    expect(parseCoachingDecision({ ...decision, spokenText: "faça isso agora" })).toBeNull();
  });

  it("aceita uma decisao referenciada e dentro do teto", () => {
    expect(
      applyCoachingPolicy(decision, context(), "session-1", Date.parse("2026-10-02T12:00:01.000Z"))
    ).toEqual({ accepted: true, decision });
  });

  it.each([
    ["sessao antiga", { ...decision, sessionId: "old" }, "STALE_SESSION"],
    ["categoria desligada", { ...decision, category: "FARM_RESOURCES" }, "CATEGORY_DISABLED"],
    ["prioridade acima do teto", { ...decision, priority: "HIGH" }, "PRIORITY_ABOVE_CAP"],
    ["baixa confianca", { ...decision, confidence: 0.2 }, "LOW_CONFIDENCE"],
    [
      "evidencia inventada",
      { ...decision, evidenceRefs: ["enemy.position"] },
      "UNKNOWN_EVIDENCE_REF"
    ],
    ["conhecimento inventado", { ...decision, knowledgeRefs: ["made.up"] }, "UNKNOWN_KNOWLEDGE_REF"]
  ])("rejeita %s", (_label, candidate, reason) => {
    expect(
      applyCoachingPolicy(candidate, context(), "session-1", Date.parse("2026-10-02T12:00:01.000Z"))
    ).toEqual({ accepted: false, reason });
  });

  it("rejeita contexto expirado e incompatibilidade semantica", () => {
    expect(
      applyCoachingPolicy(decision, context(), "session-1", Date.parse("2026-10-02T12:00:06.000Z"))
    ).toEqual({ accepted: false, reason: "EXPIRED_CONTEXT" });
    expect(
      applyCoachingPolicy(
        { ...decision, observation: "LOW_RESOURCE_MARGIN" },
        context(),
        "session-1",
        Date.parse("2026-10-02T12:00:01.000Z")
      )
    ).toEqual({ accepted: false, reason: "CATEGORY_OBSERVATION_MISMATCH" });
  });

  it("mantem somente conhecimento agnostico quando o patch nao coincide", () => {
    const knowledge = buildPatchKnowledge("26.20", [
      ...buildPatchKnowledge(null).entries,
      {
        id: "patch.26.19.x",
        kind: "PATCH_KNOWLEDGE",
        source: "RIOT_PATCH_NOTES",
        sourceRef: "riot:26.19",
        reviewedAt: "2026-09-20",
        patchVersion: "26.19",
        patchSensitive: true,
        categories: ["FARM_RESOURCES"],
        statement: "Exemplo versionado"
      }
    ]);
    expect(knowledge.entries.every((entry) => !entry.patchSensitive)).toBe(true);
  });

  it("dispara delta somente por mudanca relevante ou heartbeat conservador", () => {
    const first = {
      sessionId: "s",
      observedAt: "2026-10-02T12:00:00.000Z",
      creepScore: 0,
      deaths: 0,
      newEventRefs: []
    };
    expect(deriveLiveStateDelta(null, first, null).reason).toBe("SESSION_STARTED");
    expect(
      deriveLiveStateDelta(
        first,
        { ...first, observedAt: "2026-10-02T12:00:01.000Z", creepScore: 1 },
        Date.parse(first.observedAt)
      ).meaningful
    ).toBe(false);
    expect(
      deriveLiveStateDelta(
        first,
        { ...first, observedAt: "2026-10-02T12:00:02.000Z", deaths: 1 },
        Date.parse(first.observedAt)
      ).reason
    ).toBe("MEANINGFUL_CHANGE");
    expect(
      deriveLiveStateDelta(
        first,
        { ...first, observedAt: "2026-10-02T12:00:45.000Z" },
        Date.parse(first.observedAt)
      ).reason
    ).toBe("CONSERVATIVE_HEARTBEAT");
  });

  it("compoe linguagem opcional sem transformar score em ordem", () => {
    const phrase = composeCoachingPhrase(decision, unavailablePersonalCoachingContext(), "BRIEF");
    expect(phrase).toContain("Uma opção");
    expect(phrase).not.toMatch(/você deve|garante|vai vencer/i);
  });

  it("aceita silencio estruturado e rejeita texto/campos extras", () => {
    expect(
      parseCoachingSilenceDecision({
        schemaVersion: "coaching-decision/1.0.0",
        shouldSpeak: false,
        sessionId: "session-1",
        reason: "INSUFFICIENT_CONTEXT"
      })
    ).not.toBeNull();
    expect(
      parseCoachingSilenceDecision({
        schemaVersion: "coaching-decision/1.0.0",
        shouldSpeak: false,
        sessionId: "session-1",
        reason: "INSUFFICIENT_CONTEXT",
        spokenText: "silencio"
      })
    ).toBeNull();
  });
});

describe("personal coaching context", () => {
  it("reduz o perfil a estado, amostra e cobertura sem identidade", () => {
    const profile = {
      recentPerformance: {
        sampleSize: 6,
        metrics: [
          { key: "VISION", status: "AVAILABLE", coverage: 1 },
          { key: "SURVIVAL", status: "AVAILABLE", coverage: 1 },
          { key: "FARM", status: "AVAILABLE", coverage: 1 },
          { key: "OBJECTIVES", status: "UNAVAILABLE", coverage: 0 }
        ]
      },
      improvementAreas: [{ code: "visao_abaixo", coverage: 1 }]
    } as unknown as PlayerProfileOverview;
    const personal = buildPersonalCoachingContext(profile, "2026-10-02T12:00:00.000Z");
    expect(personal.vision.state).toBe("RECURRING_CONCERN");
    expect(personal.survivability.state).toBe("NOT_OBSERVED");
    expect(personal.objectives.state).toBe("UNAVAILABLE");
    expect(JSON.stringify(personal)).not.toContain("riotId");
  });

  it("nao chama amostra pequena de ausencia observada", () => {
    const profile = {
      recentPerformance: {
        sampleSize: 2,
        metrics: [
          { key: "VISION", status: "AVAILABLE", coverage: 1 },
          { key: "SURVIVAL", status: "AVAILABLE", coverage: 1 },
          { key: "FARM", status: "AVAILABLE", coverage: 1 },
          { key: "OBJECTIVES", status: "AVAILABLE", coverage: 1 }
        ]
      },
      improvementAreas: []
    } as unknown as PlayerProfileOverview;
    expect(buildPersonalCoachingContext(profile).vision.state).toBe("INSUFFICIENT_DATA");
  });
});
