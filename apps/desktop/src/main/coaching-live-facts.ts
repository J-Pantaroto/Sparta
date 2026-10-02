import type { CoachingLiveFacts } from "@sparta/core";
import type { LiveGameSnapshot } from "@sparta/riot";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Segunda minimizacao: do snapshot redigido para os fatos aceitos pela IA. */
export function toCoachingLiveFacts(snapshot: LiveGameSnapshot): CoachingLiveFacts {
  const stats = snapshot.activePlayer.championStats;
  const scores = snapshot.activePlayer.scores;
  const healthRatio =
    stats?.currentHealth !== undefined && stats.maxHealth !== undefined && stats.maxHealth > 0
      ? clamp(stats.currentHealth / stats.maxHealth, 0, 1)
      : undefined;
  const resourceRatio =
    stats?.resourceValue !== undefined && stats.resourceMax !== undefined && stats.resourceMax > 0
      ? clamp(stats.resourceValue / stats.resourceMax, 0, 1)
      : undefined;
  return {
    sessionId: snapshot.sessionId,
    observedAt: snapshot.observedAt,
    gameTimeSeconds: snapshot.game.gameTimeSeconds,
    level: snapshot.activePlayer.level,
    currentGold: snapshot.activePlayer.currentGold,
    kills: scores?.kills,
    deaths: scores?.deaths,
    assists: scores?.assists,
    creepScore: scores?.creepScore,
    wardScore: scores?.wardScore,
    healthRatio,
    resourceRatio,
    newEventRefs: snapshot.newEvents.map((event) => `live.event.${event.id}`)
  };
}
