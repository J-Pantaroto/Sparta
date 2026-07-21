import type { MatchPerformanceMetrics, MatchSummary, Role } from "@sparta/core";

export interface RiotMatchParticipantDto {
  puuid: string;
  championId: number;
  championName: string;
  teamId: number;
  teamPosition: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  challenges?: {
    killParticipation?: number;
  };
}

export interface RiotMatchDto {
  metadata: { matchId: string; participants: string[] };
  info: {
    gameDuration: number;
    gameVersion: string;
    gameStartTimestamp: number;
    participants: RiotMatchParticipantDto[];
  };
}

const TEAM_POSITION_TO_ROLE: Record<string, Role> = {
  TOP: "TOP",
  JUNGLE: "JUNGLE",
  MIDDLE: "MID",
  BOTTOM: "ADC",
  UTILITY: "SUPPORT"
};

/**
 * Extrai "14.14" de uma gameVersion tipo "14.14.593.1234" (formato real do
 * Match-V5). Se o formato vier diferente do esperado, retorna a string
 * original em vez de truncar de forma que possa estar errada.
 */
export function extractPatch(gameVersion: string): string {
  const parts = gameVersion.split(".");
  if (parts.length < 2) return gameVersion;
  return `${parts[0]}.${parts[1]}`;
}

function perMinute(value: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return value / (durationSeconds / 60);
}

function mapParticipant(
  participant: RiotMatchParticipantDto,
  matchId: string,
  durationSeconds: number,
  startedAt: number,
  patch: string
): MatchSummary {
  const role = TEAM_POSITION_TO_ROLE[participant.teamPosition] ?? "MID";
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;

  const metrics: MatchPerformanceMetrics = {
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    csPerMinute: perMinute(cs, durationSeconds),
    goldPerMinute: perMinute(participant.goldEarned, durationSeconds),
    damagePerMinute: perMinute(participant.totalDamageDealtToChampions, durationSeconds),
    visionScorePerMinute: perMinute(participant.visionScore, durationSeconds),
    // challenges e killParticipation dentro dele nao existem em patches
    // antigos do Match-V5 - fica undefined em vez de inventar 0.
    killParticipation: participant.challenges?.killParticipation
  };

  return {
    matchId,
    puuid: participant.puuid,
    championId: participant.championId,
    championName: participant.championName,
    role,
    won: participant.win,
    durationSeconds,
    startedAt,
    patch,
    metrics
  };
}

/**
 * Mapeia a resposta crua do Match-V5 (GET /lol/match/v5/matches/{id}) para
 * um MatchSummary por participante. Puro, sem I/O - quem chama decide o que
 * persistir (normalmente so o participante cujo puuid rastreamos).
 */
export function mapMatchToSummaries(raw: RiotMatchDto): MatchSummary[] {
  const patch = extractPatch(raw.info.gameVersion);
  return raw.info.participants.map((participant) =>
    mapParticipant(participant, raw.metadata.matchId, raw.info.gameDuration, raw.info.gameStartTimestamp, patch)
  );
}

/**
 * Info minima de time por participante, usada pelo timeline-mapper para
 * calcular goldDiffAt15 (precisa saber quem esta em cada time).
 */
export function extractParticipantTeams(raw: RiotMatchDto): { participantId: number; puuid: string; teamId: number }[] {
  return raw.metadata.participants.map((puuid, index) => {
    const participant = raw.info.participants.find((entry) => entry.puuid === puuid);
    return { participantId: index + 1, puuid, teamId: participant?.teamId ?? 0 };
  });
}
