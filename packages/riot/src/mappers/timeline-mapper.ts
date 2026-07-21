import type { MatchTimelineSummary } from "@sparta/core";

export interface RiotTimelineParticipantFrameDto {
  participantId: number;
  minionsKilled: number;
  jungleMinionsKilled: number;
  totalGold: number;
}

export interface RiotTimelineEventDto {
  type: string;
  timestamp: number;
  killerId?: number;
  victimId?: number;
  teamId?: number;
  monsterType?: string;
  buildingType?: string;
}

export interface RiotTimelineFrameDto {
  timestamp: number;
  participantFrames: Record<string, RiotTimelineParticipantFrameDto>;
  events: RiotTimelineEventDto[];
}

export interface RiotMatchTimelineDto {
  metadata: { matchId: string; participants: string[] };
  info: {
    frameInterval: number;
    frames: RiotTimelineFrameDto[];
  };
}

export interface ParticipantTeam {
  participantId: number;
  teamId: number;
}

const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function findFrameAtOrBefore(frames: RiotTimelineFrameDto[], timestampMs: number): RiotTimelineFrameDto | undefined {
  let candidate: RiotTimelineFrameDto | undefined;
  for (const frame of frames) {
    if (frame.timestamp > timestampMs) break;
    candidate = frame;
  }
  return candidate;
}

function csAtFrame(frame: RiotTimelineFrameDto | undefined, participantId: number): number {
  const participantFrame = frame?.participantFrames[String(participantId)];
  if (!participantFrame) return 0;
  return participantFrame.minionsKilled + participantFrame.jungleMinionsKilled;
}

function goldAtFrame(frame: RiotTimelineFrameDto | undefined, participantIds: number[]): number {
  if (!frame) return 0;
  return participantIds.reduce((sum, id) => sum + (frame.participantFrames[String(id)]?.totalGold ?? 0), 0);
}

function countDeathsBefore(events: RiotTimelineEventDto[], participantId: number, cutoffMs: number): number {
  return events.filter(
    (event) => event.type === "CHAMPION_KILL" && event.victimId === participantId && event.timestamp <= cutoffMs
  ).length;
}

/**
 * Mapeia a resposta crua do Match-V5 timeline
 * (GET /lol/match/v5/matches/{id}/timeline) para o MatchTimelineSummary de
 * um participante especifico. Puro, sem I/O.
 *
 * deathsBefore10/15 e csAt10/15 sao contados diretamente dos eventos/frames
 * reais da timeline (sempre calculaveis, nao dependem do objeto "challenges"
 * que falta em patches antigos - ver match-mapper.ts). goldDiffAt15 exige
 * saber quem esta em cada time (`teams`, derivado de
 * `extractParticipantTeams` no match-mapper) e fica undefined se a
 * partida acabou antes dos 15 minutos.
 */
export function mapTimelineToSummary(
  raw: RiotMatchTimelineDto,
  participantId: number,
  teams: ParticipantTeam[]
): MatchTimelineSummary {
  const allEvents = raw.info.frames.flatMap((frame) => frame.events);
  const frameAt10 = findFrameAtOrBefore(raw.info.frames, TEN_MINUTES_MS);
  const frameAt15 = findFrameAtOrBefore(raw.info.frames, FIFTEEN_MINUTES_MS);

  const ownTeamId = teams.find((team) => team.participantId === participantId)?.teamId;
  const allyIds = teams.filter((team) => team.teamId === ownTeamId).map((team) => team.participantId);
  const enemyIds = teams.filter((team) => team.teamId !== ownTeamId).map((team) => team.participantId);

  // So calcula se existir um frame realmente proximo dos 15 minutos - senao
  // "o frame mais recente disponivel" pode ser de uma partida que terminou
  // bem antes, e usar esse dado como se fosse "aos 15 minutos" inventaria
  // uma informacao que a partida nao tem.
  const reachedFifteenMinutes = frameAt15 !== undefined && frameAt15.timestamp >= FIFTEEN_MINUTES_MS - raw.info.frameInterval;
  const goldDiffAt15 =
    reachedFifteenMinutes && allyIds.length > 0 && enemyIds.length > 0
      ? goldAtFrame(frameAt15, allyIds) - goldAtFrame(frameAt15, enemyIds)
      : undefined;

  const objectiveEvents = allEvents
    .filter((event) => event.type === "ELITE_MONSTER_KILL" || event.type === "BUILDING_KILL")
    .map((event) => {
      const totalSeconds = Math.floor(event.timestamp / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const label = event.monsterType ?? event.buildingType ?? event.type;
      return `${label}@${minutes}:${seconds.toString().padStart(2, "0")}`;
    });

  return {
    matchId: raw.metadata.matchId,
    deathsBefore10: countDeathsBefore(allEvents, participantId, TEN_MINUTES_MS),
    deathsBefore15: countDeathsBefore(allEvents, participantId, FIFTEEN_MINUTES_MS),
    csAt10: csAtFrame(frameAt10, participantId),
    csAt15: csAtFrame(frameAt15, participantId),
    goldDiffAt15,
    objectiveEvents
  };
}
