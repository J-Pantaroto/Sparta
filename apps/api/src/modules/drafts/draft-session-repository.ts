import { createHash } from "node:crypto";
import {
  canonicalSnapshotInputString,
  canTransitionDraftSession,
  compareSelectedChampion,
  isTerminalDraftSessionStatus,
  type CanonicalSnapshotInput,
  type EffectiveRecommendationConfiguration,
  type ReplayInputBundle,
  type DraftSessionSource,
  type DraftSessionStatus,
  type DraftMatchLinkStatus,
  type DraftMatchLinkStrategy,
  type DraftMatchLinkEvidence,
  type KnownDraftState,
  type PersistedRecommendation,
  type PlayerRoleSource,
  type Role,
  type SelectedChampionComparison
} from "@sparta/core";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

/**
 * Persistencia de sessoes de draft e snapshots de recomendacao.
 *
 * ## Regras que este modulo existe pra garantir
 *
 * - **Nada aqui recalcula nada.** Recebe o que o motor ja produziu e grava.
 * - **Snapshot e imutavel.** Nenhuma funcao atualiza recomendacao gravada; o
 *   unico UPDATE em snapshot e marcar `supersededAt`, que registra que outro
 *   passou a valer sem alterar o conteudo do anterior.
 * - **Acesso e sempre por conta.** Toda leitura filtra por `riotAccountId`;
 *   nao existe consulta por id de sessao sem dono.
 * - **Falha nao derruba a analise.** Quem chama trata o erro; ver
 *   `persistRecommendationSnapshot`, que devolve resultado em vez de lancar.
 */

/** SHA-256 da serializacao canonica. O hash mora aqui porque `packages/core`
 * tambem roda no renderer e nao pode depender de `node:crypto`. */
export function hashCanonicalInput(input: CanonicalSnapshotInput): string {
  return createHash("sha256").update(canonicalSnapshotInputString(input)).digest("hex");
}

export interface DraftSessionRow {
  id: string;
  riotAccountId: string;
  source: DraftSessionSource;
  status: DraftSessionStatus;
  role: Role;
  roleSource: PlayerRoleSource;
  queueId: number | null;
  gameVersion: string | null;
  patch: string | null;
  selectedChampionId: number | null;
  knownDraft: KnownDraftState;
  startedAt: string;
  updatedAt: string;
  lockedInAt: string | null;
  completedAt: string | null;
  externalSessionId: string | null;
  externalGameId: string | null;
  linkedMatchId: string | null;
  legacyLinkedMatchId: string | null;
  matchLinkStatus: DraftMatchLinkStatus;
  matchLinkStrategy: DraftMatchLinkStrategy | null;
  matchLinkAlgorithmVersion: string | null;
  matchLinkEvidence: DraftMatchLinkEvidence[];
  matchLinkCandidateCount: number;
  matchLinkReason: string | null;
  matchLinkDecidedAt: string | null;
}

type PrismaDraftSession = Prisma.DraftSessionGetPayload<object>;

function toRow(row: PrismaDraftSession): DraftSessionRow {
  return {
    id: row.id,
    riotAccountId: row.riotAccountId,
    source: row.source as DraftSessionSource,
    status: row.status as DraftSessionStatus,
    role: row.role as Role,
    roleSource: row.roleSource as PlayerRoleSource,
    queueId: row.queueId,
    gameVersion: row.gameVersion,
    patch: row.patch,
    selectedChampionId: row.selectedChampionId,
    knownDraft: row.knownDraftJson as unknown as KnownDraftState,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lockedInAt: row.lockedInAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    externalSessionId: row.externalSessionId,
    externalGameId: row.externalGameId,
    linkedMatchId: row.linkedMatchId,
    legacyLinkedMatchId: row.legacyLinkedMatchId,
    matchLinkStatus: row.matchLinkStatus as DraftMatchLinkStatus,
    matchLinkStrategy: row.matchLinkStrategy as DraftMatchLinkStrategy | null,
    matchLinkAlgorithmVersion: row.matchLinkAlgorithmVersion,
    matchLinkEvidence: row.matchLinkEvidenceJson as unknown as DraftMatchLinkEvidence[],
    matchLinkCandidateCount: row.matchLinkCandidateCount,
    matchLinkReason: row.matchLinkReason,
    matchLinkDecidedAt: row.matchLinkDecidedAt?.toISOString() ?? null
  };
}

export interface UpsertDraftSessionInput {
  riotAccountId: string;
  /** Chave tecnica da sessao no cliente. Sem ela nao ha como recuperar. */
  externalSessionId: string;
  source: DraftSessionSource;
  role: Role;
  roleSource: PlayerRoleSource;
  knownDraft: KnownDraftState;
  selectedChampionId?: number;
  queueId?: number;
  gameVersion?: string;
  patch?: string;
  externalGameId?: string;
}

/**
 * Cria a sessao da chave informada ou atualiza o estado conhecido da que ja
 * existe.
 *
 * **Sessao encerrada nao reabre**: se a linha existente ja esta em
 * `COMPLETED`/`ABANDONED`, ela e devolvida como esta, sem update. Um tick
 * atrasado do LCU, ou um reenvio depois do dodge, nao pode ressuscita-la nem
 * sobrescrever o estado com que ela terminou.
 */
export async function upsertActiveDraftSession(
  input: UpsertDraftSessionInput
): Promise<DraftSessionRow> {
  const existing = await prisma.draftSession.findUnique({
    where: {
      riotAccountId_externalSessionId: {
        riotAccountId: input.riotAccountId,
        externalSessionId: input.externalSessionId
      }
    }
  });

  if (existing && isTerminalDraftSessionStatus(existing.status as DraftSessionStatus)) {
    return toRow(existing);
  }

  const data = {
    source: input.source,
    role: input.role,
    roleSource: input.roleSource,
    knownDraftJson: input.knownDraft as unknown as Prisma.InputJsonValue,
    selectedChampionId: input.selectedChampionId ?? null,
    queueId: input.queueId ?? null,
    gameVersion: input.gameVersion ?? null,
    patch: input.patch ?? null,
    ...(input.source === "LCU" && input.externalGameId
      ? {
          externalGameId: input.externalGameId,
          externalGameIdSource: "LCU",
          externalGameIdObservedAt: new Date()
        }
      : {})
  };

  const row = await prisma.draftSession.upsert({
    where: {
      riotAccountId_externalSessionId: {
        riotAccountId: input.riotAccountId,
        externalSessionId: input.externalSessionId
      }
    },
    update: data,
    create: {
      riotAccountId: input.riotAccountId,
      externalSessionId: input.externalSessionId,
      status: "ACTIVE",
      ...data
    }
  });

  return toRow(row);
}

export async function findDraftSession(
  riotAccountId: string,
  sessionId: string
): Promise<DraftSessionRow | null> {
  const row = await prisma.draftSession.findFirst({ where: { id: sessionId, riotAccountId } });
  return row ? toRow(row) : null;
}

/** Sessao ainda em andamento (nao terminal), a mais recente. */
export async function findActiveDraftSession(
  riotAccountId: string
): Promise<DraftSessionRow | null> {
  const row = await prisma.draftSession.findFirst({
    where: { riotAccountId, status: { in: ["ACTIVE", "LOCKED_IN", "IN_GAME"] } },
    orderBy: { startedAt: "desc" }
  });
  return row ? toRow(row) : null;
}

export async function listDraftSessions(
  riotAccountId: string,
  limit = 20
): Promise<DraftSessionRow[]> {
  const rows = await prisma.draftSession.findMany({
    where: { riotAccountId },
    orderBy: { startedAt: "desc" },
    take: Math.max(1, Math.min(limit, 100))
  });
  return rows.map(toRow);
}

export async function listDraftMatchLinkRevisions(riotAccountId: string, sessionId: string) {
  const session = await prisma.draftSession.findFirst({
    where: { id: sessionId, riotAccountId },
    select: { id: true }
  });
  if (!session) return null;
  const rows = await prisma.draftMatchLinkRevision.findMany({
    where: { draftSessionId: sessionId },
    orderBy: { revision: "desc" }
  });
  return rows.map((row) => ({
    revision: row.revision,
    status: row.status as DraftMatchLinkStatus,
    strategy: row.strategy as DraftMatchLinkStrategy | null,
    matchId: row.matchId,
    externalGameId: row.externalGameId,
    evidence: row.evidenceJson as unknown as DraftMatchLinkEvidence[],
    candidateCount: row.candidateCount,
    algorithmVersion: row.algorithmVersion,
    reason: row.reason,
    decidedAt: row.decidedAt.toISOString()
  }));
}

export type TransitionResult =
  | { ok: true; session: DraftSessionRow }
  | { ok: false; reason: "NOT_FOUND" | "INVALID_TRANSITION"; currentStatus?: DraftSessionStatus };

export interface TransitionInput {
  riotAccountId: string;
  sessionId: string;
  status: DraftSessionStatus;
  selectedChampionId?: number;
}

/**
 * Aplica uma transicao de ciclo de vida, recusando o que a maquina de estados
 * nao permite. `COMPLETED` é reservado ao reconciliador; esta função recebe
 * somente eventos de ciclo de vida observados pelo cliente.
 */
export async function transitionDraftSession(input: TransitionInput): Promise<TransitionResult> {
  const current = await prisma.draftSession.findFirst({
    where: {
      riotAccountId: input.riotAccountId,
      OR: [{ id: input.sessionId }, { externalSessionId: input.sessionId }]
    }
  });
  if (!current) return { ok: false, reason: "NOT_FOUND" };

  const from = current.status as DraftSessionStatus;
  if (!canTransitionDraftSession(from, input.status)) {
    return { ok: false, reason: "INVALID_TRANSITION", currentStatus: from };
  }
  if (input.status === "COMPLETED") {
    return { ok: false, reason: "INVALID_TRANSITION", currentStatus: from };
  }

  const now = new Date();
  const row = await prisma.draftSession.update({
    where: { id: current.id },
    data: {
      status: input.status,
      ...(input.selectedChampionId !== undefined
        ? { selectedChampionId: input.selectedChampionId }
        : {}),
      ...(input.status === "LOCKED_IN" && current.lockedInAt === null ? { lockedInAt: now } : {}),
      ...(input.status === "ABANDONED"
        ? {
            matchLinkStatus: "NOT_APPLICABLE",
            matchLinkReason: "A sessão foi encerrada sem partida.",
            matchLinkDecidedAt: now
          }
        : {})
    }
  });

  return { ok: true, session: toRow(row) };
}

export type ObserveExternalGameResult =
  | { ok: true; session: DraftSessionRow }
  | { ok: false; reason: "NOT_FOUND" | "NOT_LCU_SESSION" | "CONFLICT" };

/**
 * Persiste o gameId numérico lido do LCU. O primeiro valor observado vence:
 * um tick divergente nunca sobrescreve silenciosamente a evidência original.
 */
export async function observeExternalGameId(input: {
  riotAccountId: string;
  /** UUID interno ou chave técnica da sessão, ambos sempre limitados à conta. */
  sessionRef: string;
  gameId: string;
}): Promise<ObserveExternalGameResult> {
  const gameId = input.gameId.trim();
  if (!/^\d+$/.test(gameId)) return { ok: false, reason: "CONFLICT" };

  return prisma.$transaction(async (tx) => {
    const current = await tx.draftSession.findFirst({
      where: {
        riotAccountId: input.riotAccountId,
        OR: [{ id: input.sessionRef }, { externalSessionId: input.sessionRef }]
      }
    });
    if (!current) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (current.source !== "LCU") return { ok: false as const, reason: "NOT_LCU_SESSION" as const };
    if (current.externalGameId && current.externalGameId !== gameId) {
      return { ok: false as const, reason: "CONFLICT" as const };
    }
    if (current.externalGameId === gameId) return { ok: true as const, session: toRow(current) };

    const updated = await tx.draftSession.update({
      where: { id: current.id },
      data: {
        externalGameId: gameId,
        externalGameIdSource: "LCU",
        externalGameIdObservedAt: new Date(),
        matchLinkStatus: "PENDING",
        matchLinkReason: "gameId observado no LCU; aguardando reconciliação com Match-V5."
      }
    });
    return { ok: true as const, session: toRow(updated) };
  });
}

/** Projeção leve da release referenciada por um snapshot - nunca o artefato completo (pesado). */
export interface SnapshotReleaseSummary {
  id: string;
  releaseVersion: string;
  artifactHash: string;
  status: string;
  currentlyActive: boolean;
}

export interface SnapshotSummary {
  id: string;
  inputHash: string;
  dataCoverage: number;
  algorithmVersions: Record<string, string>;
  createdAt: string;
  supersededAt: string | null;
  recommendations: PersistedRecommendation[];
  /**
   * Eco da configuração efetiva (Etapa 27b), exposto aqui pela primeira vez
   * (Etapa 31I) - as colunas já existiam desde a 27b, só não saíam na API.
   * Tudo opcional: snapshot anterior à 27b não tem nada disso gravado.
   */
  configurationSource: "BUILT_IN_BASELINE" | "RELEASE" | null;
  configurationVersion: string | null;
  configHash: string | null;
  /** `null` quando `configurationSource` não é `RELEASE`, ou a release referenciada não existe mais. */
  release: SnapshotReleaseSummary | null;
}

type PrismaSnapshot = Prisma.RecommendationSnapshotGetPayload<{
  include: { recommendations: true };
}>;

/**
 * Resolve a release referenciada por um snapshot, projetada nos campos leves
 * de identificação - nunca `artifactJson` (pesado, e fora do que esta tela
 * precisa mostrar). `riotAccountId` vem de quem já validou a posse da sessão;
 * a consulta aqui é só leitura adicional, não um novo ponto de autorização.
 */
async function resolveSnapshotRelease(
  riotAccountId: string,
  releaseId: string | null
): Promise<SnapshotReleaseSummary | null> {
  if (!releaseId) return null;
  const [row, activePointer] = await Promise.all([
    prisma.recommendationEngineRelease.findFirst({
      where: { id: releaseId, riotAccountId },
      select: { id: true, releaseVersion: true, artifactHash: true, status: true }
    }),
    prisma.recommendationEngineActivePointer.findUnique({
      where: { riotAccountId },
      select: { releaseId: true }
    })
  ]);
  if (!row) return null;
  return {
    id: row.id,
    releaseVersion: row.releaseVersion,
    artifactHash: row.artifactHash,
    status: row.status,
    currentlyActive: activePointer?.releaseId === row.id
  };
}

async function toSnapshot(riotAccountId: string, row: PrismaSnapshot): Promise<SnapshotSummary> {
  const release = await resolveSnapshotRelease(riotAccountId, row.configurationReleaseId);
  return {
    id: row.id,
    inputHash: row.inputHash,
    dataCoverage: row.dataCoverage,
    algorithmVersions: row.algorithmVersionsJson as unknown as Record<string, string>,
    createdAt: row.createdAt.toISOString(),
    supersededAt: row.supersededAt?.toISOString() ?? null,
    recommendations: row.recommendations
      .map((recommendation) => recommendation.detailJson as unknown as PersistedRecommendation)
      .sort((left, right) => left.rank - right.rank),
    configurationSource: (row.configurationSource as SnapshotSummary["configurationSource"]) ?? null,
    configurationVersion: row.configurationVersion ?? null,
    configHash: row.configHash ?? null,
    release
  };
}

export async function listSnapshots(
  riotAccountId: string,
  sessionId: string
): Promise<SnapshotSummary[] | null> {
  const session = await findDraftSession(riotAccountId, sessionId);
  if (!session) return null;

  const rows = await prisma.recommendationSnapshot.findMany({
    where: { draftSessionId: sessionId },
    include: { recommendations: true },
    orderBy: { createdAt: "desc" }
  });
  return Promise.all(rows.map((row) => toSnapshot(riotAccountId, row)));
}

/** Snapshot atual da sessao: o unico sem `supersededAt`. */
export async function findLatestSnapshot(
  riotAccountId: string,
  sessionId: string
): Promise<SnapshotSummary | null> {
  const row = await prisma.recommendationSnapshot.findFirst({
    where: { draftSessionId: sessionId },
    include: { recommendations: true },
    orderBy: { createdAt: "desc" }
  });
  return row ? toSnapshot(riotAccountId, row) : null;
}

export type PersistSnapshotResult =
  | { status: "CREATED"; snapshotId: string }
  | { status: "UNCHANGED"; snapshotId: string }
  | { status: "FAILED" };

export interface PersistSnapshotInput {
  /**
   * Constroi o bundle a partir do MESMO contexto que produziu as recomendacoes.
   * Recebe o `snapshotId` recem-criado, dentro da transacao. Ausente = sessao
   * nao rastreada; presente = snapshot e bundle sao atomicos.
   */
  buildReplayBundle?: (snapshotId: string) => ReplayInputBundle;
  draftSessionId: string;
  canonicalInput: CanonicalSnapshotInput;
  algorithmVersions: Record<string, string>;
  dataCoverage: number;
  recommendations: PersistedRecommendation[];
  /** Eco da configuração efetiva usada (Etapa 27b) — nunca recalculada aqui. */
  configuration: {
    source: "BUILT_IN_BASELINE" | "RELEASE";
    releaseId?: string;
    version: string;
    configHash: string;
    effective: EffectiveRecommendationConfiguration;
  };
}

/**
 * Grava um snapshot novo **somente** quando o input canonico muda.
 *
 * Mesmo input e mesmas versoes: devolve `UNCHANGED` sem escrever nada - e o
 * que impede o poll de 2,5 s do LCU de encher a tabela de duplicatas.
 *
 * A gravacao e transacional: snapshot e recomendacoes entram juntos, e o
 * anterior so e marcado como substituido dentro da mesma transacao. Nunca
 * fica um snapshot sem candidatos nem dois snapshots "atuais".
 *
 * **Nao lanca.** Devolve `FAILED` e deixa o chamador seguir com a analise ao
 * vivo intacta.
 */
export async function persistRecommendationSnapshot(
  input: PersistSnapshotInput
): Promise<PersistSnapshotResult> {
  const inputHash = hashCanonicalInput(input.canonicalInput);

  try {
    const existing = await prisma.recommendationSnapshot.findUnique({
      where: { draftSessionId_inputHash: { draftSessionId: input.draftSessionId, inputHash } }
    });
    if (existing) return { status: "UNCHANGED", snapshotId: existing.id };

    const created = await prisma.$transaction(async (tx) => {
      // O anterior vira historico; o conteudo dele nao e tocado.
      await tx.recommendationSnapshot.updateMany({
        where: { draftSessionId: input.draftSessionId, supersededAt: null },
        data: { supersededAt: new Date() }
      });

      const snapshot = await tx.recommendationSnapshot.create({
        data: {
          draftSessionId: input.draftSessionId,
          inputHash,
          canonicalInputJson: input.canonicalInput as unknown as Prisma.InputJsonValue,
          algorithmVersionsJson: input.algorithmVersions as unknown as Prisma.InputJsonValue,
          dataCoverage: input.dataCoverage,
          configurationSource: input.configuration.source,
          configurationReleaseId: input.configuration.releaseId ?? null,
          configurationVersion: input.configuration.version,
          configHash: input.configuration.configHash,
          effectiveConfigurationJson: input.configuration.effective as unknown as Prisma.InputJsonValue,
          recommendations: {
            create: input.recommendations.map((recommendation) => ({
              championId: recommendation.championId,
              championName: recommendation.championName,
              rank: recommendation.rank,
              recGroup: recommendation.group,
              totalScore: recommendation.totalScore,
              dataCoverage: recommendation.dataCoverage,
              poolSource: recommendation.poolSource,
              personalGames: recommendation.personalGames,
              category: recommendation.category,
              confidence: recommendation.confidence ?? null,
              detailJson: recommendation as unknown as Prisma.InputJsonValue
            }))
          }
        }
      });

      // Captura prospectiva (Etapa 26b). Depois desta etapa, snapshot novo
      // **nao existe sem bundle**: qualquer falha aqui derruba a transacao
      // inteira, e nem snapshot nem bundle ficam gravados pela metade.
      if (input.buildReplayBundle) {
        const bundle = input.buildReplayBundle(snapshot.id);
        await tx.replayInputBundleRecord.create({
          data: {
            snapshotId: snapshot.id,
            schemaVersion: bundle.schemaVersion,
            contentHash: bundle.contentHash,
            contentJson: bundle as unknown as Prisma.InputJsonValue,
            evaluatedAt: new Date(bundle.evaluatedAt),
            capturedAt: new Date(bundle.capturedAt),
            contentBytes: Buffer.byteLength(JSON.stringify(bundle), "utf8"),
            algorithmVersions: bundle.algorithmVersions as unknown as Prisma.InputJsonValue
          }
        });
      }

      return snapshot;
    });

    return { status: "CREATED", snapshotId: created.id };
  } catch {
    // Mensagem sanitizada: nem stack trace nem detalhe do banco sobem.
    return { status: "FAILED" };
  }
}

/**
 * Compara o campeao escolhido com o snapshot mais recente da sessao, sem
 * emitir julgamento sobre a escolha.
 */
export async function describeSelectedChampion(
  riotAccountId: string,
  sessionId: string
): Promise<SelectedChampionComparison | null> {
  const session = await findDraftSession(riotAccountId, sessionId);
  if (!session || session.selectedChampionId === null) return null;

  const snapshot = await findLatestSnapshot(riotAccountId, sessionId);
  return compareSelectedChampion({
    selectedChampionId: session.selectedChampionId,
    ...(snapshot
      ? {
          snapshot: {
            id: snapshot.id,
            recommendations: snapshot.recommendations.map((recommendation) => ({
              championId: recommendation.championId,
              rank: recommendation.rank,
              group: recommendation.group
            }))
          }
        }
      : {})
  });
}
