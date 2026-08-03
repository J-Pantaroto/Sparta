import { performance } from "node:perf_hooks";
import type { FastifyBaseLogger, FastifyPluginAsync } from "fastify";
import {
  aggregateMatchupData,
  buildCanonicalSnapshotInput,
  generatePreGameAnalysis,
  summarizeKnownDraftState,
  toPersistedRecommendations,
  type MatchupData
} from "@sparta/core";
import {
  draftRecommendationRequestSchemaWithSession,
  draftSessionLockInSchema,
  draftSessionObservedGameSchema,
  draftSessionTransitionSchema,
  preGameAnalysisRequestSchema
} from "../../routes/schemas.js";
import {
  describeSelectedChampion,
  findActiveDraftSession,
  findDraftSession,
  findLatestSnapshot,
  listDraftMatchLinkRevisions,
  listDraftSessions,
  listSnapshots,
  observeExternalGameId,
  persistRecommendationSnapshot,
  transitionDraftSession,
  upsertActiveDraftSession
} from "./draft-session-repository.js";
import { reconcileDraftSessionsForAccount } from "./draft-match-reconciler.js";
import {
  buildEvaluationContext,
  buildReplayBundle,
  catalogVersionsOf,
  runEngine,
  type EvaluationContext
} from "./evaluation-context.js";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "../auth/routes.js";
import { findAllChampionTags, findChampionNamesByIds } from "../catalog/champion-repository.js";
import { findAllChampionCapabilityProfiles } from "../catalog/champion-capability-repository.js";
import { findPersonalLaneMatchupHistory } from "../matches/matchup-repository.js";

export const draftsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Recomendacoes reais de draft: o pool une observacoes normalizadas do
   * proprio jogador e inclusoes manuais da conta autenticada. ChampionStats,
   * tags estrategicas e matchups pessoais apenas avaliam esses candidatos;
   * nenhuma dessas fontes cria elegibilidade global ou completa o pool.
   */
  app.post("/drafts/recommendations", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const payload = draftRecommendationRequestSchemaWithSession.parse(request.body);

    // Sem posicao a rota nao roda o motor. Assumir MID aqui produziria
    // recomendacoes do papel errado sem nenhum sinal disso na resposta.
    if (!payload.draft.playerRole) {
      reply.code(422);
      return {
        code: "PLAYER_ROLE_UNAVAILABLE",
        message: "A posição do jogador ainda não foi identificada."
      };
    }

    const riotAccount = await prisma.riotAccount.findFirst({ where: { userId } });

    /**
     * Contexto de avaliacao imutavel (Etapa 26b): as fontes mutaveis sao lidas
     * **uma unica vez** aqui, e a mesma instancia alimenta motor, snapshot e
     * bundle. Antes, a persistencia recebia um subconjunto re-derivado e uma
     * escrita concorrente podia produzir snapshot e bundle de momentos
     * diferentes.
     */
    const context = await buildEvaluationContext({
      draft: payload.draft,
      role: payload.draft.playerRole,
      ...(riotAccount ? { riotAccount: { id: riotAccount.id, puuid: riotAccount.puuid } } : {}),
      log: request.log
    });

    const result = runEngine(context);
    /**
     * Persistencia (Etapa 16). E **efeito colateral** da orquestracao: roda
     * depois de a analise estar pronta, nunca antes, e qualquer falha aqui
     * devolve `FAILED` sem tocar no resultado que ja vai pro Champion Select.
     * Sem `session` no payload nada e gravado - o cliente que nao identifica a
     * sessao continua recebendo recomendacao normalmente.
     */
    const persistence = await persistDraftAnalysis({
      context,
      session: payload.session,
      result,
      log: request.log
    });

    return {
      ...result,
      persistence,
      // Alias de transição para clientes anteriores à Etapa 12. Nunca inclui
      // alternativas nem inventa candidatos.
      recommendations: result.primaryRecommendations
    };
  });

  /**
   * Analise pre-game real, derivada do draft atual. A rota so orquestra:
   * valida o payload, resolve nomes pelo catalogo real, carrega as tags e o
   * matchup pessoal, e chama o motor puro do dominio
   * (`generatePreGameAnalysis`). Nenhuma frase e montada aqui.
   */
  app.post("/drafts/pre-game-analysis", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const payload = preGameAnalysisRequestSchema.parse(request.body);
    const { draft } = payload;

    // Os dois pre-requisitos sao checados antes de qualquer consulta: sem
    // eles a analise nao existe, e ir ao banco so gastaria tempo.
    if (!draft.playerRole) {
      reply.code(422);
      return {
        code: "PLAYER_ROLE_UNAVAILABLE",
        message: "A posição do jogador ainda não foi identificada."
      };
    }
    if (draft.selectedChampionId === undefined) {
      reply.code(422);
      return {
        code: "SELECTED_CHAMPION_UNAVAILABLE",
        message: "Nenhum campeão foi confirmado para esta partida."
      };
    }

    const playerRole = draft.playerRole;
    const selectedChampionId = draft.selectedChampionId;

    const [names, championTags, capabilityProfiles] = await Promise.all([
      findChampionNamesByIds(
        [selectedChampionId, draft.enemyLaneChampionId].filter(
          (id): id is number => id !== undefined
        )
      ),
      findAllChampionTags(),
      findAllChampionCapabilityProfiles()
    ]);

    const selectedChampionName = names.get(selectedChampionId);
    if (!selectedChampionName) {
      // O id nao existe no catalogo real: analisar assim mesmo exigiria
      // inventar um nome, e o motor casa tags por nome.
      reply.code(422);
      return {
        code: "SELECTED_CHAMPION_UNAVAILABLE",
        message: "O campeão confirmado não foi encontrado no catálogo."
      };
    }

    const enemyLaneChampionName =
      draft.enemyLaneChampionId !== undefined ? names.get(draft.enemyLaneChampionId) : undefined;

    // Matchup **pessoal** (Etapa 3): so as partidas do proprio jogador, com
    // este campeao, contra este adversario, nesta posicao. Sem adversario
    // revelado nao ha o que consultar.
    let personalMatchup: MatchupData | undefined;
    if (draft.enemyLaneChampionId !== undefined) {
      const riotAccount = await prisma.riotAccount.findFirst({ where: { userId } });
      if (riotAccount) {
        const history = await findPersonalLaneMatchupHistory(riotAccount.puuid, playerRole);
        personalMatchup = aggregateMatchupData(history).find(
          (entry) =>
            entry.championId === selectedChampionId &&
            entry.enemyChampionId === draft.enemyLaneChampionId &&
            entry.role === playerRole
        );
      }
    }

    const result = generatePreGameAnalysis({
      draft: { ...draft, playerRole, selectedChampionId },
      selectedChampionTag: championTags.find((tag) => tag.championId === selectedChampionId),
      selectedChampionName,
      championTags,
      championCapabilityProfiles: capabilityProfiles,
      personalMatchup,
      enemyLaneChampionName,
      now: new Date().toISOString()
    });

    if (!result.ok) {
      reply.code(422);
      return {
        code: result.reason,
        message:
          result.reason === "PLAYER_ROLE_UNAVAILABLE"
            ? "A posição do jogador ainda não foi identificada."
            : "Nenhum campeão foi confirmado para esta partida."
      };
    }

    return result.analysis;
  });
  /**
   * Sessao de draft ainda em andamento da conta autenticada. Sempre filtrada
   * por conta - nao existe leitura de sessao de outro jogador.
   */
  app.get("/drafts/sessions/active", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const session = await findActiveDraftSession(account.id);
    if (!session) return { session: null };

    const snapshot = await findLatestSnapshot(session.id);
    return { session, latestSnapshotId: snapshot?.id ?? null };
  });

  /** Historico recente de drafts da propria conta. */
  app.get("/drafts/sessions", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : 20;
    return { sessions: await listDraftSessions(account.id, Number.isFinite(limit) ? limit : 20) };
  });

  /** Detalhe de uma sessao, com a comparacao da escolha e o estado do vinculo. */
  app.get("/drafts/sessions/:sessionId", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const { sessionId } = request.params as { sessionId: string };
    const session = await findDraftSession(account.id, sessionId);
    if (!session) {
      reply.code(404);
      return { error: "Sessao nao encontrada." };
    }

    const [snapshot, selectedChampion, revisions] = await Promise.all([
      findLatestSnapshot(session.id),
      describeSelectedChampion(account.id, session.id),
      listDraftMatchLinkRevisions(account.id, session.id)
    ]);

    return {
      session,
      latestSnapshot: snapshot,
      selectedChampion,
      matchLink: {
        status: session.matchLinkStatus ?? (session.linkedMatchId ? "LINKED" : "PENDING"),
        strategy: session.matchLinkStrategy ?? null,
        matchId: session.linkedMatchId,
        externalGameId: session.externalGameId ?? null,
        algorithmVersion: session.matchLinkAlgorithmVersion ?? null,
        evidence: session.matchLinkEvidence ?? [],
        candidateCount: session.matchLinkCandidateCount ?? 0,
        reason:
          session.matchLinkReason ??
          (session.linkedMatchId ? null : "A partida ainda não foi reconciliada."),
        decidedAt: session.matchLinkDecidedAt ?? null,
        revisions: revisions ?? []
      }
    };
  });

  /** Todos os snapshots da sessao, do mais recente para o mais antigo. */
  app.get("/drafts/sessions/:sessionId/snapshots", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const { sessionId } = request.params as { sessionId: string };
    const snapshots = await listSnapshots(account.id, sessionId);
    if (snapshots === null) {
      reply.code(404);
      return { error: "Sessao nao encontrada." };
    }
    return { snapshots };
  });

  /**
   * Registra o campeao confirmado. Guarda o fato e a posicao dele no ranking
   * daquele snapshot **sem julgar** a escolha: fora do ranking e registrado
   * como fora do ranking, nao como erro.
   */
  app.post("/drafts/sessions/:sessionId/lock-in", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const { sessionId } = request.params as { sessionId: string };
    const payload = draftSessionLockInSchema.parse(request.body);

    const result = await transitionDraftSession({
      riotAccountId: account.id,
      sessionId,
      status: "LOCKED_IN",
      selectedChampionId: payload.championId
    });

    if (!result.ok) {
      reply.code(result.reason === "NOT_FOUND" ? 404 : 409);
      return {
        code: result.reason,
        message:
          result.reason === "NOT_FOUND"
            ? "Sessao nao encontrada."
            : "A sessao ja foi encerrada e nao aceita mais alteracoes."
      };
    }

    return {
      session: result.session,
      selectedChampion: await describeSelectedChampion(account.id, sessionId)
    };
  });

  /**
   * Transição observada de ciclo de vida. `COMPLETED` e `linkedMatchId`
   * pertencem exclusivamente ao reconciliador.
   */
  app.post("/drafts/sessions/:sessionId/status", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const { sessionId } = request.params as { sessionId: string };
    const payload = draftSessionTransitionSchema.parse(request.body);
    if (payload.status === "COMPLETED") {
      reply.code(422);
      return {
        code: "MATCH_LINK_SERVER_MANAGED",
        message: "A conclusão e o vínculo são definidos exclusivamente pelo reconciliador."
      };
    }

    const result = await transitionDraftSession({
      riotAccountId: account.id,
      sessionId,
      status: payload.status
    });

    if (!result.ok) {
      reply.code(result.reason === "NOT_FOUND" ? 404 : 409);
      return {
        code: result.reason,
        message:
          result.reason === "NOT_FOUND"
            ? "Sessao nao encontrada."
            : "Transicao de estado nao permitida a partir do estado atual."
      };
    }

    return { session: result.session };
  });

  /**
   * Recebe apenas o gameId numérico observado no endpoint somente-leitura do
   * LCU. Não aceita `matchId`; o vínculo continua sendo decisão do servidor.
   */
  app.post("/drafts/sessions/:sessionId/observed-game", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };
    const { sessionId } = request.params as { sessionId: string };
    const payload = draftSessionObservedGameSchema.parse(request.body);
    const result = await observeExternalGameId({
      riotAccountId: account.id,
      sessionRef: sessionId,
      gameId: payload.gameId
    });
    if (!result.ok) {
      reply.code(result.reason === "NOT_FOUND" ? 404 : 409);
      return { code: result.reason, message: "O gameId observado não pôde ser registrado." };
    }
    return { session: result.session };
  });

  /**
   * Reprocessamento protegido e idempotente. Opera apenas nas sessões já
   * persistidas da conta autenticada e não recebe IDs de partida.
   */
  app.post("/drafts/sessions/reconcile", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };
    return { report: await reconcileDraftSessionsForAccount(account.id) };
  });
};

/** Conta Riot do usuario autenticado, ou `null` com a resposta ja marcada. */
export async function resolveAccount(
  request: Parameters<typeof getAuthenticatedUserId>[0],
  reply: { code: (status: number) => unknown }
): Promise<{ id: string; puuid: string; platformRegion: string } | null> {
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
  return { id: account.id, puuid: account.puuid, platformRegion: account.platformRegion };
}

export type DraftPersistenceStatus =
  /** Snapshot novo gravado. */
  | "SAVED"
  /** Nada mudou desde o ultimo snapshot - nenhuma escrita. */
  | "UNCHANGED"
  /** O cliente nao identificou a sessao; nada foi gravado, e isso e normal. */
  | "NOT_TRACKED"
  /** O banco falhou. A analise ao vivo segue valida. */
  | "FAILED";

export interface DraftPersistenceResult {
  status: DraftPersistenceStatus;
  sessionId?: string;
  snapshotId?: string;
  /** `false` quando o snapshot/bundle nao pode ser gravado. */
  historyPreserved?: boolean;
  /** Motivo sanitizado: nunca stack trace nem detalhe do banco. */
  reason?: string;
}

/**
 * Grava sessao + snapshot como efeito colateral da analise.
 *
 * Envolvido inteiro em try/catch: **nenhuma falha de persistencia pode
 * derrubar o Champion Select**. O erro sobe como `FAILED` sanitizado, sem
 * stack trace nem detalhe do banco.
 */
async function persistDraftAnalysis(input: {
  context: EvaluationContext;
  session?: {
    sessionKey: string;
    source: "LCU" | "USER";
    queueId?: number;
    gameVersion?: string;
    gameId?: string;
  };
  result: {
    primaryRecommendations: readonly never[] | readonly unknown[];
    alternatives: readonly unknown[];
  };
  /** Sanitizado por construção: só evento, schema, tamanho e duração. */
  log: Pick<FastifyBaseLogger, "info" | "error">;
}): Promise<DraftPersistenceResult> {
  const { context } = input;
  if (!input.session || !context.riotAccountId) return { status: "NOT_TRACKED" };

  try {
    const session = await upsertActiveDraftSession({
      riotAccountId: context.riotAccountId,
      externalSessionId: input.session.sessionKey,
      source: input.session.source,
      role: context.role,
      // Ausencia de origem da posicao no modo manual e "USER", nunca "LCU".
      roleSource: context.draft.playerRoleSource ?? "USER",
      knownDraft: summarizeKnownDraftState(context.draft),
      ...(context.draft.selectedChampionId !== undefined
        ? { selectedChampionId: context.draft.selectedChampionId }
        : {}),
      ...(input.session.queueId !== undefined ? { queueId: input.session.queueId } : {}),
      ...(input.session.gameVersion ? { gameVersion: input.session.gameVersion } : {}),
      ...(input.session.gameId ? { externalGameId: input.session.gameId } : {}),
      ...(context.draft.patch ? { patch: context.draft.patch } : {})
    });

    const canonicalInput = buildCanonicalSnapshotInput({
      draft: context.draft,
      pool: context.pool.map((entry) => ({
        championId: entry.championId,
        championName: entry.championName,
        role: entry.role,
        source: entry.source,
        enabled: entry.enabled
      })),
      catalogVersions: catalogVersionsOf(context),
      algorithmVersions: context.algorithmVersions
    });
    if (!canonicalInput) return { status: "NOT_TRACKED", sessionId: session.id };

    const recommendations = toPersistedRecommendations({
      primaryRecommendations: input.result.primaryRecommendations as never,
      alternatives: input.result.alternatives as never
    });
    const coverage =
      recommendations.length === 0
        ? 0
        : recommendations.reduce((total, entry) => total + entry.dataCoverage, 0) /
          recommendations.length;

    // Observabilidade sanitizada da captura (Etapa 26b): nunca o conteudo do
    // bundle, so evento, schema, tamanho e as duas duracoes pedidas.
    let bundleSchemaVersion: string | undefined;
    let contentBytes: number | undefined;
    let canonicalizationMs: number | undefined;

    const persistenceStartedAt = performance.now();
    const persisted = await persistRecommendationSnapshot({
      draftSessionId: session.id,
      canonicalInput,
      algorithmVersions: canonicalInput.algorithmVersions,
      dataCoverage: coverage,
      recommendations,
      // Eco da configuração efetiva (Etapa 27b): mesma instância que já
      // alimentou o motor acima, nunca relida nem recalculada aqui.
      configuration: {
        source: context.configurationMeta.source,
        ...(context.configurationMeta.source === "RELEASE"
          ? { releaseId: context.configurationMeta.release.id }
          : {}),
        version: context.configuration.version,
        configHash: context.configuration.configHash,
        effective: context.configuration
      },
      // Mesmo contexto que produziu as recomendacoes: `evaluatedAt` e identico
      // no calculo e no bundle, e nada e relido do banco aqui.
      buildReplayBundle: (snapshotId) => {
        const bundleStartedAt = performance.now();
        const bundle = buildReplayBundle({ context, snapshotId });
        canonicalizationMs = performance.now() - bundleStartedAt;
        bundleSchemaVersion = bundle.schemaVersion;
        contentBytes = Buffer.byteLength(JSON.stringify(bundle), "utf8");
        return bundle;
      }
    });
    const persistenceMs = performance.now() - persistenceStartedAt;

    if (persisted.status === "CREATED") {
      input.log.info({
        event: "replay_bundle_captured",
        snapshotId: persisted.snapshotId,
        schemaVersion: bundleSchemaVersion,
        contentBytes,
        canonicalizationMs:
          canonicalizationMs !== undefined ? Math.round(canonicalizationMs) : null,
        persistenceMs: Math.round(persistenceMs)
      });
    }

    if (persisted.status === "FAILED") {
      input.log.error({
        event: "replay_bundle_capture_failed",
        sessionId: session.id,
        persistenceMs: Math.round(persistenceMs)
      });
      return {
        status: "FAILED",
        sessionId: session.id,
        historyPreserved: false,
        reason: "A preservação histórica falhou; a análise ao vivo não foi afetada."
      };
    }
    return {
      status: persisted.status === "CREATED" ? "SAVED" : "UNCHANGED",
      sessionId: session.id,
      snapshotId: persisted.snapshotId,
      historyPreserved: true
    };
  } catch {
    input.log.error({ event: "replay_bundle_capture_failed" });
    return {
      status: "FAILED",
      historyPreserved: false,
      reason: "A preservação histórica falhou; a análise ao vivo não foi afetada."
    };
  }
}
