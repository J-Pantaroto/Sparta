import { createHash } from "node:crypto";
import { canonicalConfigurationContent, type EffectiveRecommendationConfiguration } from "@sparta/core";
import type { FastifyBaseLogger } from "fastify";
import { findActiveReleaseForAccount } from "./release-repository.js";

/**
 * Provider da configuração ativa (Etapa 27b).
 *
 * ## O que ele decide, e o que ele NÃO decide
 *
 * `resolve` responde só "existe release ativa pra esta conta, e ela é
 * íntegra?". Quando a resposta é não, a origem declarada é
 * `BUILT_IN_BASELINE` e `configuration` vem **ausente** de propósito: a
 * baseline depende do cenário do draft (blind pick, lane revelada, meio do
 * draft — `buildBaselineConfiguration`, Etapa 27a), e resolver isso aqui
 * exigiria receber o `DraftState` inteiro num provider cujo único trabalho é
 * ler a release ativa. Quem chama (`evaluation-context.ts`) já tem o draft e
 * monta a baseline explícita quando `configuration` vem ausente — nunca
 * inventa peso vazio.
 *
 * ## Nenhuma consulta ao banco acontece dentro do motor
 *
 * `resolve` é chamado **uma vez** por avaliação, antes de `runEngine` —
 * nunca dentro de uma função de score. O resultado é congelado no
 * `EvaluationContext` e reaproveitado pelo motor, pelo snapshot e pelo bundle.
 */

const CACHE_TTL_MS = 30_000;

interface ResolvedBase {
  cacheState: "HIT" | "MISS";
  /** `true` quando esta resolução veio do cache de emergência (DB fora do ar) ou de um fallback por hash inválido — não do caminho normal. */
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export type ResolvedRecommendationConfiguration =
  | (ResolvedBase & {
      source: "RELEASE";
      configuration: EffectiveRecommendationConfiguration;
      release: { id: string; releaseVersion: string; candidateId: string };
    })
  | (ResolvedBase & {
      source: "BUILT_IN_BASELINE";
      /** Ausente de propósito — ver comentário do módulo. */
      configuration?: undefined;
    });

interface CacheEntry {
  expiresAt: number;
  resolved: ResolvedRecommendationConfiguration;
}

/**
 * Cache e "última configuração válida conhecida" por conta. Módulo-escopo de
 * propósito: o processo da API é o único consumidor, e um cache por request
 * não evitaria nenhuma consulta repetida entre avaliações diferentes.
 */
const cache = new Map<string, CacheEntry>();
const lastKnownGood = new Map<string, ResolvedRecommendationConfiguration>();

function hashCanonical(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex");
}

type Log = Pick<FastifyBaseLogger, "info" | "warn" | "error">;

/**
 * Resolve a configuração ativa da conta. Sem `riotAccountId` (usuário sem
 * conta Riot vinculada), devolve baseline direto — sem consulta, sem cache,
 * porque não existe conta pra ter release ativa.
 */
export async function resolveActiveConfiguration(input: {
  riotAccountId?: string;
  log?: Log;
}): Promise<ResolvedRecommendationConfiguration> {
  if (!input.riotAccountId) {
    return { source: "BUILT_IN_BASELINE", cacheState: "MISS", fallbackUsed: false };
  }
  const riotAccountId = input.riotAccountId;

  const cached = cache.get(riotAccountId);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.resolved, cacheState: "HIT" };
  }

  try {
    const release = await findActiveReleaseForAccount(riotAccountId);
    let resolved: ResolvedRecommendationConfiguration;

    if (!release) {
      resolved = { source: "BUILT_IN_BASELINE", cacheState: "MISS", fallbackUsed: false };
    } else {
      const configuration = release.artifact.configuration;
      const expectedHash = hashCanonical(canonicalConfigurationContent(configuration));
      const valid = expectedHash === configuration.configHash && configuration.configHash === release.configHash;

      if (!valid) {
        // Nunca usa uma configuração cujo hash não bate: cai pra baseline e
        // registra o motivo. A release em si não é alterada aqui — só a
        // resolução desta avaliação usa a baseline no lugar dela.
        input.log?.error({
          event: "active_configuration_hash_mismatch",
          releaseId: release.id
        });
        resolved = {
          source: "BUILT_IN_BASELINE",
          cacheState: "MISS",
          fallbackUsed: true,
          fallbackReason: "CONFIG_HASH_MISMATCH"
        };
      } else {
        resolved = {
          source: "RELEASE",
          configuration,
          release: { id: release.id, releaseVersion: release.releaseVersion, candidateId: release.candidateId },
          cacheState: "MISS",
          fallbackUsed: false
        };
      }
    }

    cache.set(riotAccountId, { expiresAt: Date.now() + CACHE_TTL_MS, resolved });
    lastKnownGood.set(riotAccountId, resolved);
    return resolved;
  } catch {
    // Falha de leitura do banco: usa a última configuração válida conhecida
    // desta conta, se existir; sem ela, baseline. Nunca lança — resolver a
    // configuração não pode derrubar a análise ao vivo.
    input.log?.error({ event: "active_configuration_resolve_failed", riotAccountId });
    const fallback = lastKnownGood.get(riotAccountId);
    if (fallback?.source === "RELEASE") {
      return {
        source: "RELEASE",
        configuration: fallback.configuration,
        release: fallback.release,
        cacheState: "MISS",
        fallbackUsed: true,
        fallbackReason: "DB_READ_FAILED_USING_LAST_KNOWN"
      };
    }
    if (fallback?.source === "BUILT_IN_BASELINE") {
      return {
        source: "BUILT_IN_BASELINE",
        cacheState: "MISS",
        fallbackUsed: true,
        fallbackReason: "DB_READ_FAILED_USING_LAST_KNOWN"
      };
    }
    return {
      source: "BUILT_IN_BASELINE",
      cacheState: "MISS",
      fallbackUsed: true,
      fallbackReason: "DB_READ_FAILED_NO_LAST_KNOWN"
    };
  }
}

/**
 * Remove a entrada de cache da conta. Chamada explicitamente depois de
 * ativação e rollback — cache antigo nunca sobrevive a essas duas transições.
 * `lastKnownGood` **não** é limpo aqui de propósito: ele existe só como rede
 * de segurança contra banco fora do ar, não como espelho do estado atual.
 */
export function invalidateActiveConfigurationCache(riotAccountId: string): void {
  cache.delete(riotAccountId);
}

/** Só para teste: reseta os dois mapas module-scope entre casos. */
export function resetActiveConfigurationProviderForTests(): void {
  cache.clear();
  lastKnownGood.clear();
}
