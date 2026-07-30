import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  POST_MATCH_DIMENSION_DEFINITIONS,
  PRE_MATCH_DIMENSION_DEFINITIONS,
  REVIEW_ISSUE_TAG_DEFINITIONS,
  REVIEW_RATING_DEFINITIONS
} from "@sparta/core";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "../auth/routes.js";
import {
  createDraftReview,
  listDraftReviews,
  revealMatchResult,
  submitPostMatchAssessment,
  submitPreMatchAssessment,
  summarizeReviews,
  type ReviewFailure
} from "./draft-review-repository.js";

/**
 * Revisao humana auditavel (Etapa 24).
 *
 * O **modo cego e responsabilidade destas rotas**: enquanto a revisao nao foi
 * revelada, nenhuma resposta daqui carrega resultado, KDA ou estatistica da
 * partida. Nao e questao de a interface esconder - o dado nao sai do servidor.
 */

const ratingSchema = z.enum(["STRONG", "ADEQUATE", "WEAK", "INSUFFICIENT_DATA", "NOT_APPLICABLE"]);

const issueTagSchema = z.enum([
  "MISSING_DATA",
  "WRONG_ROLE_CONTEXT",
  "STALE_SOURCE",
  "LOW_COVERAGE_NOT_CLEAR",
  "PERSONAL_EVIDENCE_MISREPRESENTED",
  "STRATEGIC_SIGNAL_MISREPRESENTED",
  "EXECUTION_RISK_MISREPRESENTED",
  "DUPLICATED_SIGNAL",
  "CONTRADICTORY_EXPLANATION",
  "RANKING_SURPRISE",
  "POOL_LIMITATION",
  "MATCHUP_CONTEXT_MISSING",
  "OTHER"
]);

const notesSchema = z.string().max(4000).optional();

const createReviewSchema = z.object({
  /** Corrigir uma revisao anterior em vez de sobrescrever. */
  supersedesReviewId: z.string().min(1).optional(),
  correctionReason: notesSchema
});

const preMatchSchema = z.object({
  rankingCoherence: ratingSchema,
  strategicExplanation: ratingSchema,
  personalContextRepresentation: ratingSchema,
  executionRiskRepresentation: ratingSchema,
  uncertaintyHonesty: ratingSchema,
  practicalUsefulness: ratingSchema,
  issueTags: z.array(issueTagSchema).max(13).default([]),
  notes: notesSchema
});

const postMatchSchema = z.object({
  observedCorrespondence: ratingSchema,
  explanationUsefulness: ratingSchema,
  informationGap: ratingSchema,
  postMatchClarity: ratingSchema,
  issueTags: z.array(issueTagSchema).max(13).default([]),
  notes: notesSchema,
  needsInvestigation: z.boolean().default(false)
});

const FAILURE_STATUS: Record<ReviewFailure, number> = {
  SESSION_NOT_FOUND: 404,
  REVIEW_NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  ALREADY_REVEALED: 409,
  NOT_REVEALED: 409,
  RANKING_NOT_ASSESSABLE: 422,
  INVALID_ASSESSMENT: 422
};

const FAILURE_MESSAGE: Record<ReviewFailure, string> = {
  SESSION_NOT_FOUND: "Sessao de draft nao encontrada.",
  REVIEW_NOT_FOUND: "Revisao nao encontrada.",
  INVALID_TRANSITION: "A revisao nao aceita esta transicao a partir do estado atual.",
  ALREADY_REVEALED: "O resultado desta revisao ja foi revelado.",
  NOT_REVEALED: "O resultado precisa ser revelado antes da avaliacao pos-partida.",
  RANKING_NOT_ASSESSABLE:
    "Esta sessao nao tem snapshot vigente no lock-in, entao a coerencia do ranking nao pode ser avaliada.",
  INVALID_ASSESSMENT: "A avaliacao enviada nao respeita o contrato do formulario."
};

async function resolveAccount(
  request: FastifyRequest,
  reply: { code: (status: number) => unknown }
): Promise<{ id: string } | null> {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    reply.code(401);
    return null;
  }
  const account = await prisma.riotAccount.findFirst({ where: { userId } });
  if (!account) {
    reply.code(404);
    return null;
  }
  return { id: account.id };
}

export const draftReviewRoutes: FastifyPluginAsync = async (app) => {
  /** Dicionario do formulario: escala, dimensoes e tags, com definicoes. */
  app.get("/draft-reviews/form", async () => ({
    reviewRatings: REVIEW_RATING_DEFINITIONS,
    preMatchDimensions: PRE_MATCH_DIMENSION_DEFINITIONS,
    postMatchDimensions: POST_MATCH_DIMENSION_DEFINITIONS,
    issueTags: REVIEW_ISSUE_TAG_DEFINITIONS
  }));

  /**
   * Abre uma revisao e devolve **somente** o contexto cego: snapshot, draft
   * conhecido, versoes. Nenhum dado da partida atravessa esta resposta.
   */
  app.post("/draft-sessions/:sessionId/reviews", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const { sessionId } = request.params as { sessionId: string };
    const payload = createReviewSchema.parse(request.body ?? {});

    const result = await createDraftReview({
      riotAccountId: account.id,
      draftSessionId: sessionId,
      ...(payload.supersedesReviewId ? { supersedesReviewId: payload.supersedesReviewId } : {}),
      ...(payload.correctionReason ? { correctionReason: payload.correctionReason } : {})
    });

    if (!result.ok) {
      reply.code(FAILURE_STATUS[result.reason]);
      return { code: result.reason, message: FAILURE_MESSAGE[result.reason] };
    }
    return result.value;
  });

  app.get("/draft-sessions/:sessionId/reviews", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const { sessionId } = request.params as { sessionId: string };
    const reviews = await listDraftReviews(account.id, sessionId);
    if (reviews === null) {
      reply.code(404);
      return { code: "SESSION_NOT_FOUND", message: FAILURE_MESSAGE.SESSION_NOT_FOUND };
    }
    return { reviews };
  });

  /** Fecha a fase cega. Depois disto a avaliacao previa nao aceita escrita. */
  app.post("/draft-reviews/:reviewId/pre-match", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const { reviewId } = request.params as { reviewId: string };
    const payload = preMatchSchema.parse(request.body);

    const result = await submitPreMatchAssessment({
      riotAccountId: account.id,
      reviewId,
      assessment: payload
    });

    if (!result.ok) {
      reply.code(FAILURE_STATUS[result.reason]);
      return { code: result.reason, message: FAILURE_MESSAGE[result.reason] };
    }
    return { review: result.value };
  });

  /**
   * Acao explicita de revelacao. So a partir daqui a partida entra na
   * resposta - e a avaliacao previa ja esta gravada e imutavel.
   */
  app.post("/draft-reviews/:reviewId/reveal-result", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const { reviewId } = request.params as { reviewId: string };
    const result = await revealMatchResult({ riotAccountId: account.id, reviewId });

    if (!result.ok) {
      reply.code(FAILURE_STATUS[result.reason]);
      return { code: result.reason, message: FAILURE_MESSAGE[result.reason] };
    }
    return {
      review: result.value.review,
      match: result.value.match,
      ...(result.value.match
        ? {}
        : {
            // Sessao sem partida vinculada continua sendo uma revisao valida,
            // so-pre-resultado. Nao ha desfecho a inventar.
            matchUnavailableReason:
              "Esta sessao nao tem partida vinculada, entao nao ha resultado a revelar."
          })
    };
  });

  app.post("/draft-reviews/:reviewId/post-match", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const { reviewId } = request.params as { reviewId: string };
    const payload = postMatchSchema.parse(request.body);

    const result = await submitPostMatchAssessment({
      riotAccountId: account.id,
      reviewId,
      assessment: payload
    });

    if (!result.ok) {
      reply.code(FAILURE_STATUS[result.reason]);
      return { code: result.reason, message: FAILURE_MESSAGE[result.reason] };
    }
    return { review: result.value };
  });

  /**
   * Agregado descritivo. Contagens com denominador; nenhuma nota geral,
   * percentual de acerto, versao vencedora ou peso recomendado.
   */
  app.get("/players/draft-review-summary", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };
    return { summary: await summarizeReviews(account.id) };
  });
};
