import type { FastifyPluginAsync } from "fastify";
import { resolveAccount } from "./routes.js";
import {
  findReplayBundleSummary,
  findSessionReplayCapability,
  verifySnapshotReplay
} from "./replay-bundle-repository.js";

/**
 * Superficie de leitura e verificacao do ReplayInputBundle (Etapa 26b).
 *
 * Nenhuma rota aqui expoe o `contentJson` do bundle inteiro: so capacidade,
 * schema, versoes, hash, tamanho, datas, ultima verificacao, dependencias
 * ausentes e o motivo sanitizado — exatamente o que a interface e a
 * observabilidade precisam, nada do input funcional (draft, estatisticas,
 * tags, capacidades) que o bundle preserva.
 */
export const replayBundleRoutes: FastifyPluginAsync = async (app) => {
  /** Capacidade de replay do snapshot mais recente de uma sessao. */
  app.get("/draft-sessions/:sessionId/replay-capability", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return { error: "Nao autenticado." };

    const { sessionId } = request.params as { sessionId: string };
    const capability = await findSessionReplayCapability(account.id, sessionId);
    if (!capability) {
      reply.code(404);
      return { error: "Sessao nao encontrada." };
    }
    return capability;
  });

  /** Resumo do bundle de um snapshot especifico, sem o conteudo completo. */
  app.get(
    "/recommendation-snapshots/:snapshotId/replay-bundle-summary",
    async (request, reply) => {
      const account = await resolveAccount(request, reply);
      if (!account) return { error: "Nao autenticado." };

      const { snapshotId } = request.params as { snapshotId: string };
      const summary = await findReplayBundleSummary(account.id, snapshotId);
      if (!summary) {
        reply.code(404);
        return { error: "Snapshot nao encontrado." };
      }
      return summary;
    }
  );

  /**
   * Roda a verificacao offline de fato — unica rota que reconstroi o motor a
   * partir do bundle. So le snapshot, bundle e a implementacao registrada;
   * nenhuma tabela mutavel entra aqui (ver replay-bundle-repository.ts).
   */
  app.post(
    "/recommendation-snapshots/:snapshotId/verify-replay",
    async (request, reply) => {
      const account = await resolveAccount(request, reply);
      if (!account) return { error: "Nao autenticado." };

      const { snapshotId } = request.params as { snapshotId: string };
      const outcome = await verifySnapshotReplay(account.id, snapshotId);

      if (!outcome.ok) {
        if (outcome.reason === "NOT_FOUND") {
          reply.code(404);
          return { error: "Snapshot nao encontrado." };
        }
        reply.code(422);
        return {
          code: "NO_BUNDLE",
          message: "Este snapshot nao tem um bundle de replay preservado."
        };
      }

      // Observabilidade sanitizada: evento, schema, resultado e duracao —
      // nunca o conteudo do bundle nem das divergencias detalhadas.
      request.log.info({
        event: "replay_bundle_verified",
        snapshotId,
        schemaVersion: outcome.bundleSchemaVersion,
        status: outcome.result.status,
        divergenceCount: outcome.result.divergences.length,
        durationMs: Math.round(outcome.durationMs)
      });

      return {
        snapshotId,
        status: outcome.result.status,
        divergences: outcome.result.divergences,
        missingDependencies: outcome.result.missingDependencies,
        replayImplementation: outcome.result.replayImplementation,
        capability: outcome.report.capability,
        reason: outcome.report.reason,
        reweightAvailable: outcome.report.reweightAvailable
      };
    }
  );
};
