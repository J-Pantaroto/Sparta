import {
  canTransitionReview,
  DRAFT_REVIEW_FORM_VERSION,
  isTerminalReviewStatus,
  normalizeIssueTags,
  sanitizeReviewNotes,
  summarizeDraftReviews,
  validatePreMatchAssessment,
  type BlindReviewContext,
  type DraftReview,
  type DraftReviewStatus,
  type DraftReviewSummary,
  type PostMatchAssessment,
  type PreMatchAssessment
} from "@sparta/core";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { selectSnapshotAtLockIn } from "../observability/recommendation-observability-repository.js";

/**
 * Persistencia da revisao humana (Etapa 24).
 *
 * ## O modo cego e garantido AQUI, nao no CSS
 *
 * Enquanto `resultRevealedAt` for nulo, este modulo **nao consulta** partida,
 * relatorio pos-game nem estatistica nenhuma. O contexto devolvido pela fase
 * cega e do tipo `BlindReviewContext`, que nao tem campo de resultado: para
 * vazar dado posterior alguem teria que mudar o tipo, e a mudanca aparece no
 * diff.
 *
 * ## Nada aqui altera o motor
 *
 * Sessao, snapshot, ranking, metricas e relatorio pos-game sao lidos e nunca
 * escritos. As tags de problema sao registro de investigacao; nenhuma delas
 * realimenta peso, formula ou threshold.
 */

type PrismaReview = Prisma.DraftReviewGetPayload<object>;

function toReview(row: PrismaReview): DraftReview {
  return {
    id: row.id,
    playerId: row.riotAccountId,
    draftSessionId: row.draftSessionId,
    snapshotId: row.snapshotId,
    matchId: row.matchId,
    status: row.status as DraftReviewStatus,
    preMatchAssessment: (row.preMatchJson as unknown as PreMatchAssessment | null) ?? null,
    postMatchAssessment: (row.postMatchJson as unknown as PostMatchAssessment | null) ?? null,
    resultRevealedAt: row.resultRevealedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    reviewVersion: row.reviewVersion,
    supersedesReviewId: row.supersedesReviewId,
    ...(row.correctionReason ? { correctionReason: row.correctionReason } : {})
  };
}

export type ReviewFailure =
  | "SESSION_NOT_FOUND"
  | "REVIEW_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "ALREADY_REVEALED"
  | "NOT_REVEALED"
  | "RANKING_NOT_ASSESSABLE"
  | "INVALID_ASSESSMENT";

export type ReviewResult<T> = { ok: true; value: T } | { ok: false; reason: ReviewFailure };

/**
 * Abre uma revisao para uma sessao. `supersedesReviewId` transforma a nova em
 * correcao da anterior — a antiga **nao e apagada nem reescrita**, só recebe
 * `supersededAt` e sai dos agregados.
 */
export async function createDraftReview(input: {
  riotAccountId: string;
  draftSessionId: string;
  supersedesReviewId?: string;
  correctionReason?: string;
}): Promise<ReviewResult<{ review: DraftReview; context: BlindReviewContext }>> {
  const session = await prisma.draftSession.findFirst({
    where: { id: input.draftSessionId, riotAccountId: input.riotAccountId },
    include: { snapshots: { include: { recommendations: true } } }
  });
  if (!session) return { ok: false, reason: "SESSION_NOT_FOUND" };

  if (input.supersedesReviewId) {
    const previous = await prisma.draftReview.findFirst({
      where: { id: input.supersedesReviewId, riotAccountId: input.riotAccountId }
    });
    if (!previous) return { ok: false, reason: "REVIEW_NOT_FOUND" };
  }

  const snapshot = selectSnapshotAtLockIn(session.snapshots, session.lockedInAt);

  const created = await prisma.$transaction(async (tx) => {
    if (input.supersedesReviewId) {
      // A anterior deixa de ser a atual. O conteudo dela permanece intacto.
      await tx.draftReview.updateMany({
        where: { id: input.supersedesReviewId, supersededAt: null },
        data: { supersededAt: new Date() }
      });
    }
    return tx.draftReview.create({
      data: {
        riotAccountId: input.riotAccountId,
        draftSessionId: session.id,
        snapshotId: snapshot?.id ?? null,
        status: "IN_PROGRESS",
        reviewVersion: DRAFT_REVIEW_FORM_VERSION,
        supersedesReviewId: input.supersedesReviewId ?? null,
        correctionReason: sanitizeReviewNotes(input.correctionReason) ?? null
      }
    });
  });

  return {
    ok: true,
    value: {
      review: toReview(created),
      context: {
        draftSessionId: session.id,
        snapshotId: snapshot?.id ?? null,
        role: session.role,
        roleSource: session.roleSource,
        source: session.source,
        lockedInAt: session.lockedInAt?.toISOString() ?? null,
        selectedChampionId: session.selectedChampionId,
        knownDraft: session.knownDraftJson,
        snapshot: snapshot
          ? {
              id: snapshot.id,
              createdAt: snapshot.createdAt.toISOString(),
              dataCoverage: snapshot.dataCoverage,
              recommendations: snapshot.recommendations
                .map((recommendation) => recommendation.detailJson)
                .slice()
            }
          : null,
        algorithmVersions: snapshot
          ? ((snapshot.algorithmVersionsJson as Record<string, string>) ?? {})
          : {},
        // Só a existência do vínculo. Nenhum dado da partida atravessa aqui.
        hasLinkedMatch: session.linkedMatchId !== null
      }
    }
  };
}

export async function listDraftReviews(
  riotAccountId: string,
  draftSessionId: string
): Promise<DraftReview[] | null> {
  const session = await prisma.draftSession.findFirst({
    where: { id: draftSessionId, riotAccountId }
  });
  if (!session) return null;

  const rows = await prisma.draftReview.findMany({
    where: { draftSessionId, riotAccountId },
    orderBy: { createdAt: "desc" }
  });
  return rows.map(toReview);
}

/** Grava a avaliacao cega. Recusa quando a revisao ja saiu de `IN_PROGRESS`. */
export async function submitPreMatchAssessment(input: {
  riotAccountId: string;
  reviewId: string;
  assessment: Omit<PreMatchAssessment, "submittedAt">;
}): Promise<ReviewResult<DraftReview>> {
  const current = await prisma.draftReview.findFirst({
    where: { id: input.reviewId, riotAccountId: input.riotAccountId }
  });
  if (!current) return { ok: false, reason: "REVIEW_NOT_FOUND" };

  const status = current.status as DraftReviewStatus;
  if (!canTransitionReview(status, "PRE_MATCH_REVIEWED")) {
    return { ok: false, reason: "INVALID_TRANSITION" };
  }

  const issueTags = normalizeIssueTags(input.assessment.issueTags);
  const validation = validatePreMatchAssessment({
    assessment: { ...input.assessment, issueTags },
    snapshotId: current.snapshotId
  });
  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.errors.includes("RANKING_NOT_ASSESSABLE")
        ? "RANKING_NOT_ASSESSABLE"
        : "INVALID_ASSESSMENT"
    };
  }

  const assessment: PreMatchAssessment = {
    ...input.assessment,
    issueTags,
    ...(sanitizeReviewNotes(input.assessment.notes)
      ? { notes: sanitizeReviewNotes(input.assessment.notes) }
      : {}),
    submittedAt: new Date().toISOString()
  };

  const row = await prisma.draftReview.update({
    where: { id: current.id },
    data: {
      status: "PRE_MATCH_REVIEWED",
      preMatchJson: assessment as unknown as Prisma.InputJsonValue,
      issueTags
    }
  });
  return { ok: true, value: toReview(row) };
}

export interface RevealedMatch {
  matchId: string;
  /** Dados da partida. Só existem depois da revelação explícita. */
  postgameReport: unknown | null;
  linkedAt: string | null;
}

/**
 * Revela a partida. **Ação explícita e irreversível para a fase cega**: a
 * avaliação prévia já está gravada e nunca mais aceita escrita.
 *
 * Sem partida vinculada não há o que revelar; a revisão continua válida como
 * revisão só-pré-resultado.
 */
export async function revealMatchResult(input: {
  riotAccountId: string;
  reviewId: string;
}): Promise<ReviewResult<{ review: DraftReview; match: RevealedMatch | null }>> {
  const current = await prisma.draftReview.findFirst({
    where: { id: input.reviewId, riotAccountId: input.riotAccountId },
    include: { draftSession: true }
  });
  if (!current) return { ok: false, reason: "REVIEW_NOT_FOUND" };

  // Revelar antes de submeter a avaliação cega destruiria o propósito do
  // modo cego - o revisor veria o resultado e depois "avaliaria" o draft.
  if (current.status === "IN_PROGRESS") return { ok: false, reason: "INVALID_TRANSITION" };
  if (current.resultRevealedAt !== null) return { ok: false, reason: "ALREADY_REVEALED" };

  const matchId = current.draftSession.linkedMatchId;
  const now = new Date();

  const row = await prisma.draftReview.update({
    where: { id: current.id },
    data: { resultRevealedAt: now, matchId: matchId ?? null }
  });

  if (!matchId) return { ok: true, value: { review: toReview(row), match: null } };

  const account = await prisma.riotAccount.findUnique({ where: { id: input.riotAccountId } });
  const report = account
    ? await prisma.postgameReport.findFirst({
        where: { match: { matchId }, puuid: account.puuid }
      })
    : null;

  return {
    ok: true,
    value: {
      review: toReview(row),
      match: {
        matchId,
        postgameReport: report?.reportJson ?? null,
        linkedAt: current.draftSession.updatedAt.toISOString()
      }
    }
  };
}

/**
 * Grava a avaliacao pos-resultado. Exige revelacao previa e **nunca** toca a
 * avaliacao cega: o `update` não inclui `preMatchJson`.
 */
export async function submitPostMatchAssessment(input: {
  riotAccountId: string;
  reviewId: string;
  assessment: Omit<PostMatchAssessment, "submittedAt">;
}): Promise<ReviewResult<DraftReview>> {
  const current = await prisma.draftReview.findFirst({
    where: { id: input.reviewId, riotAccountId: input.riotAccountId }
  });
  if (!current) return { ok: false, reason: "REVIEW_NOT_FOUND" };
  if (current.resultRevealedAt === null) return { ok: false, reason: "NOT_REVEALED" };

  const target: DraftReviewStatus = input.assessment.needsInvestigation
    ? "NEEDS_INVESTIGATION"
    : "COMPLETED";
  if (!canTransitionReview(current.status as DraftReviewStatus, target)) {
    return { ok: false, reason: "INVALID_TRANSITION" };
  }

  const issueTags = normalizeIssueTags(input.assessment.issueTags);
  const assessment: PostMatchAssessment = {
    ...input.assessment,
    issueTags,
    ...(sanitizeReviewNotes(input.assessment.notes)
      ? { notes: sanitizeReviewNotes(input.assessment.notes) }
      : {}),
    submittedAt: new Date().toISOString()
  };

  const previousTags = normalizeIssueTags(
    (current.preMatchJson as unknown as PreMatchAssessment | null)?.issueTags
  );

  const row = await prisma.draftReview.update({
    where: { id: current.id },
    data: {
      status: target,
      postMatchJson: assessment as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
      issueTags: [...new Set([...previousTags, ...issueTags])]
    }
  });
  return { ok: true, value: toReview(row) };
}

/**
 * Agregado descritivo das revisoes **atuais** da conta. Revisao substituida
 * fica de fora: contar a corrigida e a corretora contaria o mesmo caso duas
 * vezes.
 */
export async function summarizeReviews(riotAccountId: string): Promise<DraftReviewSummary> {
  const rows = await prisma.draftReview.findMany({
    where: { riotAccountId, supersededAt: null },
    include: {
      draftSession: { include: { snapshots: { select: { id: true, algorithmVersionsJson: true } } } }
    }
  });

  return summarizeDraftReviews(
    rows.map((row) => ({
      ...toReview(row),
      algorithmVersions:
        (row.draftSession.snapshots.find((snapshot) => snapshot.id === row.snapshotId)
          ?.algorithmVersionsJson as Record<string, string> | undefined) ?? {}
    }))
  );
}

export { isTerminalReviewStatus };
