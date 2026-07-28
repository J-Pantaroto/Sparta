import type { Prisma } from "@prisma/client";
import {
  aggregatePlayerChampionStats,
  availableCoverage,
  computeRecentForm,
  derivePlayerStrengthsWeaknesses,
  partialCoverage,
  unavailableCoverage,
  unknownCoverage,
  type PlayerChampionStats,
  type PlayerStrength,
  type PlayerWeakness,
  type RecentChampionMatch,
  type RecentForm,
  type Role,
  type StatCoverage
} from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { findParticipationHistory } from "../matches/match-repository.js";

/**
 * PlayerProfile nunca era criado em nenhum lugar do codigo antes desta
 * tarefa - a FK de PlayerChampionStats exige uma linha aqui, entao criamos
 * (se nao existir) sempre que formos recalcular stats.
 */
export async function ensurePlayerProfile(riotAccountId: string): Promise<string> {
  const profile = await prisma.playerProfile.upsert({
    where: { riotAccountId },
    update: {},
    create: { riotAccountId, preferredRoles: [] }
  });
  return profile.id;
}

export interface PlayerChampionObservedRolePair {
  championId: number;
  role: string;
}

/**
 * Recalcula PlayerChampionStats so para os (championId, role) tocados na
 * ultima rodada de sync - nao reprocessa o perfil inteiro toda vez, so os
 * campeoes/roles que essa rodada realmente sincronizou.
 */
export async function recomputeChampionStats(
  riotAccountId: string,
  puuid: string,
  touchedPairs: PlayerChampionObservedRolePair[],
  matchAnalysisLimit?: number
): Promise<void> {
  if (touchedPairs.length === 0) return;

  const playerProfileId = await ensurePlayerProfile(riotAccountId);
  const history = await findParticipationHistory(puuid, matchAnalysisLimit);

  const uniquePairs = Array.from(
    new Map(touchedPairs.map((pair) => [`${pair.championId}:${pair.role}`, pair])).values()
  );

  for (const { championId, role } of uniquePairs) {
    const matches = history
      .filter((entry) => entry.championId === championId && entry.role === role)
      .map((entry) => ({ ...entry, role: entry.role as Role }));
    if (matches.length === 0) continue;

    const stats = aggregatePlayerChampionStats(championId, matches[0].championName, role as Role, matches);
    // `null` so acontece com coleção vazia, ja descartada acima - a guarda
    // existe pro tipo, nao pro caso.
    if (!stats) continue;
    const recentMatchesJson = stats.recentMatches as unknown as Prisma.InputJsonValue;
    const persistedStats = {
      games: stats.games,
      wins: stats.wins,
      kills: stats.kills,
      deaths: stats.deaths,
      assists: stats.assists,
      csPerMinute: stats.csPerMinute,
      goldPerMinute: stats.goldPerMinute,
      damagePerMinute: stats.damagePerMinute,
      visionScorePerMinute: stats.visionScorePerMinute,
      killParticipation: stats.killParticipation,
      objectiveParticipation: stats.objectiveParticipation,
      killParticipationSamples: stats.coverage.killParticipation.availableSampleSize,
      objectiveParticipationSamples: stats.coverage.objectiveParticipation.availableSampleSize,
      recentMatchesJson
    };

    await prisma.playerChampionStats.upsert({
      where: { playerProfileId_championId_role: { playerProfileId, championId, role } },
      update: persistedStats,
      create: { playerProfileId, championId, role, ...persistedStats }
    });
  }
}

const neutralRecentForm: RecentForm = {
  last10Score: 50,
  last20Score: 50,
  last50Score: 50,
  trend: "stable",
  confidence: "low"
};

function isComputedRecentForm(value: unknown): value is RecentForm {
  return typeof value === "object" && value !== null && "trend" in value;
}

/**
 * Calcula e persiste strengths/weaknesses/recentForm reais do jogador
 * (Fase 2 - Player Intelligence), a partir do historico e das
 * PlayerChampionStats ja persistidos. Chamada logo apos
 * recomputeChampionStats no fluxo de sync - ensurePlayerProfile e
 * idempotente, entao esta funcao e segura de chamar independente da ordem.
 */
export async function computeAndPersistPlayerInsights(
  riotAccountId: string,
  puuid: string,
  matchAnalysisLimit?: number
): Promise<void> {
  await ensurePlayerProfile(riotAccountId);

  const history = await findParticipationHistory(puuid, matchAnalysisLimit);
  const recentForm = computeRecentForm(history.map((entry) => ({ ...entry, role: entry.role as Role })));

  const championStats = await findChampionStatsByPuuid(puuid);
  const { strengths, weaknesses } = derivePlayerStrengthsWeaknesses(championStats);

  await prisma.playerProfile.update({
    where: { riotAccountId },
    data: {
      strengthsJson: strengths as unknown as Prisma.InputJsonValue,
      weaknessesJson: weaknesses as unknown as Prisma.InputJsonValue,
      recentFormJson: recentForm as unknown as Prisma.InputJsonValue
    }
  });
}

/**
 * Le strengths/weaknesses/recentForm persistidos (Fase 2). Sem profile
 * ainda, ou recentFormJson no valor-default "{}" (nunca calculado) -> volta
 * um resultado neutro em vez de inventar uma avaliacao.
 */
export async function findPlayerInsightsByPuuid(
  puuid: string
): Promise<{ strengths: PlayerStrength[]; weaknesses: PlayerWeakness[]; recentForm: RecentForm }> {
  const account = await prisma.riotAccount.findUnique({ where: { puuid }, include: { profile: true } });
  if (!account?.profile) {
    return { strengths: [], weaknesses: [], recentForm: neutralRecentForm };
  }

  return {
    strengths: (account.profile.strengthsJson as unknown as PlayerStrength[] | null) ?? [],
    weaknesses: (account.profile.weaknessesJson as unknown as PlayerWeakness[] | null) ?? [],
    recentForm: isComputedRecentForm(account.profile.recentFormJson)
      ? (account.profile.recentFormJson as unknown as RecentForm)
      : neutralRecentForm
  };
}

const DEFAULT_MATCH_ANALYSIS_LIMIT = 50;
export const MIN_MATCH_ANALYSIS_LIMIT = 1;
export const MAX_MATCH_ANALYSIS_LIMIT = 200;

/**
 * Configuracao pessoal "quantas partidas o Sparta deve analisar" (Fase 6b).
 * Sem profile ainda -> default honesto (50), mesmo padrao neutro de
 * findPlayerInsightsByPuuid. Publica por puuid (sem auth) porque Growth
 * Journey tambem e publica por puuid - nao precisa de userId aqui.
 */
export async function findMatchAnalysisLimitByPuuid(puuid: string): Promise<number> {
  const account = await prisma.riotAccount.findUnique({ where: { puuid }, include: { profile: true } });
  return account?.profile?.matchAnalysisLimit ?? DEFAULT_MATCH_ANALYSIS_LIMIT;
}

/**
 * Atualiza a configuracao e garante que o profile exista (usuario pode
 * ainda nao ter sincronizado nada). Clamping [1,200] e responsabilidade do
 * chamador (validacao via zod na rota) - aqui so persiste o valor.
 */
export async function setMatchAnalysisLimit(riotAccountId: string, matchAnalysisLimit: number): Promise<void> {
  await ensurePlayerProfile(riotAccountId);
  await prisma.playerProfile.update({ where: { riotAccountId }, data: { matchAnalysisLimit } });
}

export interface RiotAccountLookup {
  puuid: string;
  gameName: string;
  tagLine: string;
  platformRegion: string;
  regionalRouting: string;
}

/**
 * Le o RiotAccount por gameName+tagLine (case-insensitive) - usado pelo
 * perfil publico do jogador. Retorna null se a conta nunca foi vinculada
 * por ninguem no Sparta.
 */
export async function findRiotAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccountLookup | null> {
  const account = await prisma.riotAccount.findFirst({
    where: {
      gameName: { equals: gameName, mode: "insensitive" },
      tagLine: { equals: tagLine, mode: "insensitive" }
    }
  });
  if (!account) return null;

  return {
    puuid: account.puuid,
    gameName: account.gameName,
    tagLine: account.tagLine,
    platformRegion: account.platformRegion,
    regionalRouting: account.regionalRouting
  };
}

/**
 * PlayerChampionStats reais do jogador via puuid (RiotAccount ->
 * PlayerProfile -> PlayerChampionStats). Retorna [] se a conta existe mas
 * nunca foi sincronizada (sem partidas persistidas ainda).
 */
export async function findChampionStatsByPuuid(puuid: string): Promise<PlayerChampionStats[]> {
  const account = await prisma.riotAccount.findUnique({ where: { puuid }, include: { profile: true } });
  if (!account?.profile) return [];

  const rows = await prisma.playerChampionStats.findMany({
    where: { playerProfileId: account.profile.id },
    include: { champion: true }
  });

  return rows.map((row) => {
    const objectiveIsLegacyArtificialZero = row.objectiveParticipationSamples === null && row.objectiveParticipation === 0;

    return {
    championId: row.championId,
    championName: row.champion.name,
    role: row.role as Role,
    games: row.games,
    wins: row.wins,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    csPerMinute: row.csPerMinute,
    goldPerMinute: row.goldPerMinute,
    damagePerMinute: row.damagePerMinute,
    visionScorePerMinute: row.visionScorePerMinute,
    killParticipation: row.killParticipation,
    // Zero legado provadamente artificial nao e servido como valor.
    objectiveParticipation: objectiveIsLegacyArtificialZero ? null : row.objectiveParticipation,
    coverage: {
      killParticipation: toStatCoverage(
        row.games,
        row.killParticipation,
        row.killParticipationSamples,
        "Nenhuma das partidas traz participação em abates."
      ),
      objectiveParticipation: toStatCoverage(
        row.games,
        row.objectiveParticipation,
        row.objectiveParticipationSamples,
        "O Sparta ainda não extrai participação em objetivos de nenhuma fonte.",
        true
      )
    },
    recentMatches: (row.recentMatchesJson as unknown as RecentChampionMatch[] | null) ?? []
    };
  });
}

/**
 * Reconstroi a cobertura a partir da linha persistida.
 *
 * `samples === null` e o caso das linhas gravadas antes da migration
 * `20260726120000`: sabemos o valor mas nao quantas partidas o
 * sustentaram. Fica AVAILABLE com `availableSampleSize: null` (cobertura
 * desconhecida) em vez de virar 0, que afirmaria "nenhuma partida tinha o
 * dado" sem base. A proxima sincronizacao regrava a contagem real.
 */
function toStatCoverage(
  games: number,
  value: number | null,
  samples: number | null,
  unavailableReason: string,
  /**
   * Marca o campo cujo `0` numa linha legada e **provadamente** artificial.
   * Vale so pra `objectiveParticipation`: o mapper do Match-V5 nunca
   * preencheu esse campo, entao nenhuma partida jamais teve o dado e a
   * agregacao antiga era obrigada a gravar 0 (medido: 0 de 220
   * participantes). Nao se aplica a `killParticipation`, onde 0 pode ser
   * participacao zero medida - ali a ambiguidade historica permanece e esta
   * documentada em `docs/data-provenance.md`.
   */
  legacyZeroIsArtificial = false
): StatCoverage {
  if (value === null) return unavailableCoverage(games, unavailableReason);
  if (samples === null) {
    if (legacyZeroIsArtificial && value === 0) return unavailableCoverage(games, unavailableReason);
    return unknownCoverage(games);
  }
  if (samples < games) return partialCoverage(games, samples);
  return availableCoverage(games);
}

/**
 * Roles preferidas derivadas do volume real de partidas por role (nao e
 * uma preferencia declarada pelo usuario, e so o que os dados mostram) -
 * ordenadas da mais jogada pra menos jogada.
 */
export function deriveObservedRoles(championStats: PlayerChampionStats[]): Role[] {
  const gamesByRole = new Map<Role, number>();
  for (const stats of championStats) {
    gamesByRole.set(stats.role, (gamesByRole.get(stats.role) ?? 0) + stats.games);
  }
  return Array.from(gamesByRole.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([role]) => role);
}

/** Alias legado: o resultado é volume pessoal observado, não preferência declarada. */
export const derivePreferredRoles = deriveObservedRoles;
