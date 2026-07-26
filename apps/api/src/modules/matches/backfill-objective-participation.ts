import { computeObjectiveParticipation } from "@sparta/core";
import type { RiotMatchDto } from "@sparta/riot";
import { prisma } from "../../db/prisma.js";
import { recomputeChampionStats } from "../players/player-stats-repository.js";

export interface ObjectiveBackfillSummary {
  matchesAnalyzed: number;
  matchesWithoutRawJson: number;
  participantsUpdated: number;
  participantsWithoutData: number;
  participantsInconsistent: number;
  /** Contas cujo PlayerChampionStats foi recalculado com o dado novo. */
  accountsRecomputed: number;
  errors: { matchId: string; reason: string }[];
}

interface RawObjectives {
  dragonKills?: number;
  baronKills?: number;
}

function teamObjectivesFrom(raw: RiotMatchDto, teamId: number | null): RawObjectives | undefined {
  if (teamId === null) return undefined;
  const team = raw.info.teams?.find((entry) => entry.teamId === teamId);
  if (!team?.objectives) return undefined;
  return { dragonKills: team.objectives.dragon?.kills, baronKills: team.objectives.baron?.kills };
}

/**
 * Recalcula a participação em objetivos das partidas **já persistidas**, a
 * partir do `Match.rawJson` gravado desde a Fase 1.
 *
 * Não faz nenhuma chamada à Riot API: o payload necessário já está no banco.
 * Idempotente - reprocessar a mesma partida produz exatamente o mesmo
 * resultado, então pode rodar quantas vezes for preciso. O `rawJson` nunca é
 * apagado; ele continua sendo a fonte reprocessável se a metodologia mudar.
 *
 * Uma linha só é escrita quando o valor calculado difere do persistido -
 * assim uma segunda execução não gera escrita nenhuma. Participante cujo
 * payload não sustenta a razão fica com as três colunas `null`; **não** é
 * rebaixado pra zero.
 *
 * Não registra puuid nem payload: o resumo é só de contagens.
 */
export async function backfillObjectiveParticipation(): Promise<ObjectiveBackfillSummary> {
  const summary: ObjectiveBackfillSummary = {
    matchesAnalyzed: 0,
    matchesWithoutRawJson: 0,
    participantsUpdated: 0,
    participantsWithoutData: 0,
    participantsInconsistent: 0,
    accountsRecomputed: 0,
    errors: []
  };

  const matches = await prisma.match.findMany({
    select: { id: true, matchId: true, patch: true, startedAt: true, rawJson: true }
  });

  for (const match of matches) {
    summary.matchesAnalyzed += 1;

    if (!match.rawJson) {
      summary.matchesWithoutRawJson += 1;
      continue;
    }

    try {
      const raw = match.rawJson as unknown as RiotMatchDto;
      const participants = await prisma.matchParticipant.findMany({
        where: { matchId: match.id },
        select: {
          id: true,
          puuid: true,
          teamId: true,
          objectiveParticipation: true,
          objectiveTakedowns: true,
          teamObjectiveKills: true
        }
      });

      for (const participant of participants) {
        const rawParticipant = raw.info?.participants?.find((entry) => entry.puuid === participant.puuid);

        const observation = computeObjectiveParticipation({
          takedowns: rawParticipant?.challenges,
          teamKills: teamObjectivesFrom(raw, participant.teamId),
          patch: match.patch ?? undefined,
          observedAt: match.startedAt?.toISOString()
        });

        if (observation.status === "PARTIAL" && observation.partialReason) {
          summary.participantsInconsistent += 1;
        }
        if (observation.value === null) {
          summary.participantsWithoutData += 1;
        }

        // A comparação é feita pelos **inteiros**, não pela razão. Eles
        // determinam o valor por completo e são exatos; comparar o float
        // por igualdade quebra a idempotência - medido: `1/6` não faz
        // round-trip exato pelo `double precision` do Postgres, então
        // aquela linha era reescrita a cada execução.
        const unchanged =
          participant.objectiveTakedowns === observation.personalTakedowns &&
          participant.teamObjectiveKills === observation.teamObjectives &&
          (participant.objectiveParticipation === null) === (observation.value === null);
        if (unchanged) continue;

        await prisma.matchParticipant.update({
          where: { id: participant.id },
          data: {
            objectiveParticipation: observation.value,
            objectiveTakedowns: observation.personalTakedowns,
            teamObjectiveKills: observation.teamObjectives
          }
        });
        summary.participantsUpdated += 1;
      }
    } catch (error) {
      summary.errors.push({
        matchId: match.matchId,
        reason: error instanceof Error ? error.message : "erro desconhecido"
      });
    }
  }

  // Os agregados por campeão só recalculam no sync. Sem este passo, a
  // métrica recém-extraída ficaria no MatchParticipant sem chegar ao perfil
  // nem ao score até o jogador sincronizar de novo.
  summary.accountsRecomputed = await recomputeAggregatesForLinkedAccounts();

  return summary;
}

async function recomputeAggregatesForLinkedAccounts(): Promise<number> {
  const accounts = await prisma.riotAccount.findMany({ select: { id: true, puuid: true } });
  let recomputed = 0;

  for (const account of accounts) {
    const pairs = await prisma.matchParticipant.findMany({
      where: { puuid: account.puuid },
      select: { championId: true, role: true },
      distinct: ["championId", "role"]
    });
    if (pairs.length === 0) continue;

    await recomputeChampionStats(account.id, account.puuid, pairs);
    recomputed += 1;
  }

  return recomputed;
}
