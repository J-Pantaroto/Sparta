import type { CoachingLiveFacts, LiveStateDelta } from "./contracts.js";

const HEARTBEAT_MS = 45_000;

function changed(
  previous: number | undefined,
  current: number | undefined,
  threshold = 0
): boolean {
  return (
    previous !== undefined && current !== undefined && Math.abs(current - previous) > threshold
  );
}

export function deriveLiveStateDelta(
  previous: CoachingLiveFacts | null,
  current: CoachingLiveFacts,
  lastEvaluationAtMs: number | null
): LiveStateDelta {
  if (!previous || previous.sessionId !== current.sessionId) {
    return {
      sessionId: current.sessionId,
      observedAt: current.observedAt,
      changedEvidenceRefs: ["live.sessionId"],
      meaningful: true,
      reason: "SESSION_STARTED"
    };
  }

  const refs: string[] = [];
  if (changed(previous.deaths, current.deaths)) refs.push("live.deaths");
  if (changed(previous.level, current.level)) refs.push("live.level");
  if (changed(previous.creepScore, current.creepScore, 5)) refs.push("live.creepScore");
  if (changed(previous.wardScore, current.wardScore)) refs.push("live.wardScore");
  if (changed(previous.healthRatio, current.healthRatio, 0.2)) refs.push("live.healthRatio");
  if (changed(previous.resourceRatio, current.resourceRatio, 0.25)) refs.push("live.resourceRatio");
  if (current.newEventRefs.length > 0) refs.push(...current.newEventRefs);

  if (refs.length > 0) {
    return {
      sessionId: current.sessionId,
      observedAt: current.observedAt,
      changedEvidenceRefs: Array.from(new Set(refs)),
      meaningful: true,
      reason: "MEANINGFUL_CHANGE"
    };
  }

  const observedAt = Date.parse(current.observedAt);
  if (
    lastEvaluationAtMs !== null &&
    Number.isFinite(observedAt) &&
    observedAt - lastEvaluationAtMs >= HEARTBEAT_MS
  ) {
    return {
      sessionId: current.sessionId,
      observedAt: current.observedAt,
      changedEvidenceRefs: ["live.gameTimeSeconds"],
      meaningful: true,
      reason: "CONSERVATIVE_HEARTBEAT"
    };
  }

  return {
    sessionId: current.sessionId,
    observedAt: current.observedAt,
    changedEvidenceRefs: [],
    meaningful: false,
    reason: "NO_MEANINGFUL_CHANGE"
  };
}

export const COACHING_HEARTBEAT_MS = HEARTBEAT_MS;
