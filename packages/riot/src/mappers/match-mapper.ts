import { computeObjectiveParticipation } from "@sparta/core";
import type { MatchPerformanceMetrics, MatchSummary, Role, TeamNeutralObjectiveKills } from "@sparta/core";

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
    // Participações do jogador em objetivos neutros. `riftHeraldTakedowns`
    // existe no payload mas NÃO é lido: sua contabilidade diverge de
    // `teams[].objectives.riftHerald.kills` (ver
    // `objective-participation.ts` em @sparta/core).
    dragonTakedowns?: number;
    baronTakedowns?: number;
  };
}

/**
 * Objetivos conquistados por um time. Só os campos que o Sparta consome -
 * o payload traz mais (torre, inibidor, `horde`, `atakhan`), ainda não
 * validados contra dado real.
 */
export interface RiotMatchTeamDto {
  teamId: number;
  objectives?: {
    dragon?: { kills?: number };
    baron?: { kills?: number };
  };
}

export interface RiotMatchDto {
  metadata: { matchId: string; participants: string[] };
  info: {
    gameDuration: number;
    gameVersion: string;
    gameStartTimestamp: number;
    participants: RiotMatchParticipantDto[];
    teams?: RiotMatchTeamDto[];
  };
}

const TEAM_POSITION_TO_ROLE: Partial<Record<string, Role>> = {
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

/**
 * Objetivos do time do participante, pelo `teamId` real. `undefined`
 * quando o payload não traz `teams` (patch antigo) ou quando o time do
 * jogador não está na lista - as duas coisas deixam a participação em
 * objetivos indisponível, nunca zero.
 */
function findTeamObjectives(
  teams: RiotMatchTeamDto[] | undefined,
  teamId: number
): TeamNeutralObjectiveKills | undefined {
  const team = teams?.find((entry) => entry.teamId === teamId);
  if (!team?.objectives) return undefined;
  return {
    dragonKills: team.objectives.dragon?.kills,
    baronKills: team.objectives.baron?.kills
  };
}

function mapParticipant(
  participant: RiotMatchParticipantDto,
  matchId: string,
  durationSeconds: number,
  startedAt: number,
  patch: string,
  teams: RiotMatchTeamDto[] | undefined
): MatchSummary {
  // Sem `?? "MID"`: partida cujo `teamPosition` a Riot não informa (ou
  // informa num vocabulário novo) sairia contabilizada nas estatísticas de
  // MID do jogador. Fica ausente, e a persistência descarta a linha.
  const role = TEAM_POSITION_TO_ROLE[participant.teamPosition];
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

  const objective = computeObjectiveParticipation({
    takedowns: participant.challenges,
    teamKills: findTeamObjectives(teams, participant.teamId),
    patch,
    observedAt: new Date(startedAt).toISOString()
  });

  // Só um valor usável vira métrica. Indisponível permanece ausente - o
  // absoluto continua exposto porque o pós-game mostra "N de M objetivos".
  if (objective.value !== null) {
    metrics.objectiveParticipation = objective.value;
  }
  if (objective.personalTakedowns !== null) {
    metrics.objectiveTakedowns = objective.personalTakedowns;
  }
  if (objective.teamObjectives !== null) {
    metrics.teamObjectiveKills = objective.teamObjectives;
  }

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
    mapParticipant(
      participant,
      raw.metadata.matchId,
      raw.info.gameDuration,
      raw.info.gameStartTimestamp,
      patch,
      raw.info.teams
    )
  );
}

/**
 * Info minima de time por participante, usada pelo timeline-mapper para
 * calcular goldDiffAt15 (precisa saber quem esta em cada time).
 */
export function extractParticipantTeams(raw: RiotMatchDto): { participantId: number; puuid: string; teamId: number }[] {
  return raw.metadata.participants
    .map((puuid, index) => {
      const participant = raw.info.participants.find((entry) => entry.puuid === puuid);
      // Sem `teamId` a entrada fica de fora: o `?? 0` anterior criava um
      // time fantasma (a Riot usa 100/200), e esse time entrava na conta de
      // aliados/inimigos do goldDiffAt15 como se fosse real.
      return participant?.teamId === undefined ? undefined : { participantId: index + 1, puuid, teamId: participant.teamId };
    })
    .filter((entry): entry is { participantId: number; puuid: string; teamId: number } => entry !== undefined);
}
