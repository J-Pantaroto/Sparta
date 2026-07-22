import type { Prisma } from "@prisma/client";
import type { MatchSummary, MatchTimelineSummary } from "@sparta/core";
import { prisma } from "../../db/prisma.js";

export async function findExistingMatchIds(matchIds: string[]): Promise<Set<string>> {
  if (matchIds.length === 0) return new Set();
  const rows = await prisma.match.findMany({ where: { matchId: { in: matchIds } }, select: { matchId: true } });
  return new Set(rows.map((row) => row.matchId));
}

export interface ParticipantToPersist {
  summary: MatchSummary;
  teamId: number;
}

export interface PersistParticipantsResult {
  skippedParticipantPuuids: string[];
}

/**
 * Grava os participantes (ate 10) de uma partida ja existente no banco
 * (Match/MatchTimeline inalterados). Reaproveitada tanto pelo sync normal
 * (persistMatch, so quando a partida e nova) quanto pelo script de backfill
 * (que so completa os participantes faltantes de partidas ja persistidas na
 * Fase 1/2). `riotAccountId` de cada linha e resolvido consultando quais
 * puuids da partida correspondem a contas Sparta ja vinculadas - nao so o
 * puuid de quem disparou o sync, cobrindo o caso raro de dois usuarios
 * Sparta na mesma partida. `championId` que ainda nao existe no catalogo
 * (campeao novo, catalog:sync desatualizado) e pulado em vez de abortar a
 * gravacao inteira - mesmo principio de falha isolada do loop de sync.
 */
async function persistMatchParticipants(
  tx: Prisma.TransactionClient,
  matchDbId: string,
  participants: ParticipantToPersist[]
): Promise<PersistParticipantsResult> {
  const distinctChampionIds = Array.from(new Set(participants.map((entry) => entry.summary.championId)));
  const participantPuuids = participants.map((entry) => entry.summary.puuid);

  const [existingChampions, knownAccounts] = await Promise.all([
    tx.champion.findMany({ where: { id: { in: distinctChampionIds } }, select: { id: true } }),
    tx.riotAccount.findMany({ where: { puuid: { in: participantPuuids } }, select: { id: true, puuid: true } })
  ]);
  const knownChampionIds = new Set(existingChampions.map((champion) => champion.id));
  const riotAccountIdByPuuid = new Map(knownAccounts.map((account) => [account.puuid, account.id]));

  const eligible = participants.filter((entry) => knownChampionIds.has(entry.summary.championId));
  const skipped = participants.filter((entry) => !knownChampionIds.has(entry.summary.championId));

  if (eligible.length > 0) {
    await tx.matchParticipant.createMany({
      data: eligible.map(({ summary, teamId }) => ({
        matchId: matchDbId,
        riotAccountId: riotAccountIdByPuuid.get(summary.puuid) ?? null,
        puuid: summary.puuid,
        championId: summary.championId,
        role: summary.role,
        teamId,
        won: summary.won,
        kills: summary.metrics.kills,
        deaths: summary.metrics.deaths,
        assists: summary.metrics.assists,
        csPerMinute: summary.metrics.csPerMinute,
        goldPerMinute: summary.metrics.goldPerMinute,
        damagePerMinute: summary.metrics.damagePerMinute,
        visionScorePerMinute: summary.metrics.visionScorePerMinute,
        killParticipation: summary.metrics.killParticipation,
        objectiveParticipation: summary.metrics.objectiveParticipation
      })),
      skipDuplicates: true
    });

    // `skipDuplicates` pula qualquer linha ja existente (matchId+puuid) -
    // inclusive a do jogador rastreado, persistida antes da Fase 3, quando
    // teamId nem existia ainda. Sem isso, o teamId dessa linha ficaria nulo
    // pra sempre mesmo apos o backfill. So atualiza quem ainda esta nulo,
    // pra nao reescrever dado sem necessidade.
    await Promise.all(
      eligible.map(({ summary, teamId }) =>
        tx.matchParticipant.updateMany({
          where: { matchId: matchDbId, puuid: summary.puuid, teamId: null },
          data: { teamId }
        })
      )
    );
  }

  return { skippedParticipantPuuids: skipped.map((entry) => entry.summary.puuid) };
}

export interface PersistMatchInput {
  platform: string;
  trackedPuuid: string;
  participants: ParticipantToPersist[];
  timeline: MatchTimelineSummary;
  rawMatch: Prisma.InputJsonValue;
}

export interface PersistMatchResult {
  skippedParticipantPuuids: string[];
}

/**
 * Persiste uma partida nova: upsert de Match (idempotente por matchId - se
 * a partida ja existir, nao sobrescreve nada), MatchTimeline (idempotente
 * tambem - upsert em vez de create, pra tolerar ser chamada de novo por um
 * backfill sem quebrar em partida ja processada) e os ate 10
 * MatchParticipant da partida (Fase 3 - antes so o jogador rastreado era
 * gravado, os outros 9 eram descartados).
 */
export async function persistMatch(input: PersistMatchInput): Promise<PersistMatchResult> {
  const { participants, timeline, trackedPuuid, platform, rawMatch } = input;

  const tracked = participants.find((entry) => entry.summary.puuid === trackedPuuid);
  if (!tracked) {
    throw new Error(`Participante rastreado (${trackedPuuid}) nao encontrado na lista de participantes da partida.`);
  }
  const { summary: trackedSummary } = tracked;

  return prisma.$transaction(async (tx) => {
    const match = await tx.match.upsert({
      where: { matchId: trackedSummary.matchId },
      update: {},
      create: {
        matchId: trackedSummary.matchId,
        platform,
        patch: trackedSummary.patch,
        durationSeconds: trackedSummary.durationSeconds,
        startedAt: new Date(trackedSummary.startedAt),
        rawJson: rawMatch
      }
    });

    const { skippedParticipantPuuids } = await persistMatchParticipants(tx, match.id, participants);

    await tx.matchTimeline.upsert({
      where: { matchId: match.id },
      update: {},
      create: {
        matchId: match.id,
        deathsBefore10: timeline.deathsBefore10,
        deathsBefore15: timeline.deathsBefore15,
        csAt10: timeline.csAt10,
        csAt15: timeline.csAt15,
        goldDiffAt15: timeline.goldDiffAt15,
        eventsJson: timeline.objectiveEvents
      }
    });

    return { skippedParticipantPuuids };
  });
}

/**
 * Completa os participantes faltantes de uma partida ja persistida (Fase 1/2
 * so gravou o jogador rastreado) - usada pelo script de backfill, que
 * reconstroi `participants` a partir do `Match.rawJson` ja salvo, sem
 * nenhuma chamada nova a Riot API. Match/MatchTimeline nao sao tocados
 * (ja existem); `skipDuplicates` garante que rodar de novo e inocuo.
 */
export async function backfillMatchParticipants(
  matchDbId: string,
  participants: ParticipantToPersist[]
): Promise<PersistParticipantsResult> {
  return prisma.$transaction((tx) => persistMatchParticipants(tx, matchDbId, participants));
}

export interface MatchNeedingBackfill {
  id: string;
  matchId: string;
  rawJson: Prisma.JsonValue;
}

/**
 * Partidas com menos de 10 MatchParticipant persistidos, ou com algum
 * participante ainda sem `teamId` - normalmente as sincronizadas antes da
 * Fase 3, quando so o jogador rastreado era gravado (e sem teamId nenhum).
 * A segunda condicao existe porque `createMany({ skipDuplicates: true })`
 * pula linhas ja existentes (a do jogador rastreado), entao rodar o
 * backfill uma vez preenche os outros 9 mas nao corrige o teamId da linha
 * que ja existia - precisa reprocessar essa partida de novo mesmo com 10
 * participantes. Usada pelo script de backfill; `rawJson` ja guarda a
 * resposta completa da Riot desde a Fase 1, entao o backfill nao precisa de
 * nenhuma chamada nova a API.
 */
export async function findMatchesMissingParticipants(): Promise<MatchNeedingBackfill[]> {
  const matches = await prisma.match.findMany({
    select: {
      id: true,
      matchId: true,
      rawJson: true,
      _count: { select: { participants: true } },
      participants: { select: { teamId: true } }
    }
  });
  return matches
    .filter(
      (match) =>
        match.rawJson !== null &&
        (match._count.participants < 10 || match.participants.some((participant) => participant.teamId === null))
    )
    .map(({ id, matchId, rawJson }) => ({ id, matchId, rawJson }));
}

export interface ParticipationRecord {
  matchId: string;
  championId: number;
  championName: string;
  role: string;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  csPerMinute: number;
  goldPerMinute: number;
  damagePerMinute: number;
  visionScorePerMinute: number;
  killParticipation: number | null;
  objectiveParticipation: number | null;
}

/**
 * Busca todo o historico persistido do jogador (todos os campeoes/roles),
 * do mais recente pro mais antigo - usado pra recalcular PlayerChampionStats
 * agrupando por (championId, role). Partidas sem Match.startedAt (nao
 * deveria acontecer, mas o campo e opcional no schema) ficam por ultimo.
 */
export async function findParticipationHistory(puuid: string): Promise<ParticipationRecord[]> {
  const rows = await prisma.matchParticipant.findMany({
    where: { puuid },
    include: { match: true, champion: true },
    orderBy: { match: { startedAt: "desc" } }
  });

  return rows.map((row) => ({
    matchId: row.match.matchId,
    championId: row.championId,
    championName: row.champion.name,
    role: row.role,
    won: row.won,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    csPerMinute: row.csPerMinute,
    goldPerMinute: row.goldPerMinute,
    damagePerMinute: row.damagePerMinute,
    visionScorePerMinute: row.visionScorePerMinute,
    killParticipation: row.killParticipation,
    objectiveParticipation: row.objectiveParticipation
  }));
}
