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

/**
 * CS do participante no frame. `undefined` quando o frame nao existe ou nao
 * traz esse participante - devolver 0 ali seria indistinguivel de "nao
 * farmou nada ate esse minuto".
 */
function csAtFrame(frame: RiotTimelineFrameDto | undefined, participantId: number): number | undefined {
  const participantFrame = frame?.participantFrames[String(participantId)];
  if (!participantFrame) return undefined;
  return participantFrame.minionsKilled + participantFrame.jungleMinionsKilled;
}

/**
 * Ouro do time no frame. So e chamada depois de confirmar que o frame
 * existe e que a partida chegou no minuto - por isso soma direto os
 * participantes presentes.
 */
function goldAtFrame(frame: RiotTimelineFrameDto, participantIds: number[]): number {
  return participantIds.reduce((sum, id) => sum + (frame.participantFrames[String(id)]?.totalGold ?? 0), 0);
}

/**
 * Um frame so representa "o minuto X" se a partida de fato chegou perto de
 * X. `findFrameAtOrBefore` sempre devolve algum frame anterior, entao sem
 * esta checagem uma partida encerrada aos 8 minutos reportaria o CS do
 * minuto 8 como se fosse "CS aos 10".
 */
function reachedMinute(frame: RiotTimelineFrameDto | undefined, timestampMs: number, frameInterval: number): boolean {
  return frame !== undefined && frame.timestamp >= timestampMs - frameInterval;
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
 * deathsBefore10/15 sao contagem de eventos: `0` significa "nao morreu" e
 * e sempre calculavel quando a timeline existe. csAt10/15 e goldDiffAt15
 * ficam `undefined` quando a partida nao chegou no minuto correspondente
 * (ou o frame nao traz o participante) - um numero ali seria o valor de um
 * minuto anterior apresentado como se fosse do minuto pedido.
 * goldDiffAt15 exige tambem saber quem esta em cada time (`teams`, derivado
 * de `extractParticipantTeams` no match-mapper).
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

  const reachedTenMinutes = reachedMinute(frameAt10, TEN_MINUTES_MS, raw.info.frameInterval);
  const reachedFifteenMinutes = reachedMinute(frameAt15, FIFTEEN_MINUTES_MS, raw.info.frameInterval);
  const goldDiffAt15 =
    frameAt15 !== undefined && reachedFifteenMinutes && allyIds.length > 0 && enemyIds.length > 0
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
    csAt10: reachedTenMinutes ? csAtFrame(frameAt10, participantId) : undefined,
    csAt15: reachedFifteenMinutes ? csAtFrame(frameAt15, participantId) : undefined,
    goldDiffAt15,
    objectiveEvents
  };
}
