import type { PostGameAnalysis } from "@sparta/core";
import { prisma } from "../../db/prisma.js";

/**
 * Todos os PostgameReport ja persistidos de um jogador, do mais recente pro
 * mais antigo por data real da partida (Match.startedAt) - usado pela
 * Growth Journey (Fase 5) pra comparar blocos de relatorios ao longo do
 * tempo. `startedAt` e nullable no schema; matches sem ele sao excluidos em
 * vez de deixar o Postgres jogar nulls pra frente na ordenacao desc, o que
 * corromperia a divisao dos blocos - guarda de anomalia de dado (o sync
 * real da Fase 1 sempre preenche startedAt a partir do gameStartTimestamp
 * real da Riot), nao caso esperado.
 */
export async function findPostgameReportsByPuuid(puuid: string): Promise<PostGameAnalysis[]> {
  const reports = await prisma.postgameReport.findMany({
    where: { puuid, match: { startedAt: { not: null } } },
    include: { match: true },
    orderBy: { match: { startedAt: "desc" } }
  });

  return reports.map((report) => report.reportJson as unknown as PostGameAnalysis);
}
