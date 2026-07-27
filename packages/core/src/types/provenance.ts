/**
 * Contrato central de PROVENIÊNCIA e DISPONIBILIDADE.
 *
 * Existe por um motivo concreto: até aqui o Sparta exibia `50` para quatro
 * situações diferentes — um cálculo que deu neutro de verdade, ausência de
 * dado, fallback artificial e componente ainda não implementado. Na tela as
 * quatro viravam a mesma barra amarela. Este módulo dá vocabulário pra
 * separar os casos antes de qualquer um deles ser corrigido.
 *
 * Regra que este contrato existe pra sustentar: **valor ausente permanece
 * ausente**. Nada aqui converte ausência em `0`, `50` ou qualquer outro
 * número — quem não tem dado declara que não tem.
 */

/**
 * De onde o dado veio. Não confundir com disponibilidade: um dado DERIVED
 * pode estar perfeitamente disponível, e um OFFICIAL pode estar indisponível.
 *
 * - `OFFICIAL`   — publicado pela Riot (Riot API, Data Dragon). Fato.
 * - `OBSERVED`   — lido de um estado real, sem cálculo (sessão do LCU, o
 *                  que de fato aconteceu numa partida persistida).
 * - `CALCULATED` — agregação determinística sobre dado real (média, taxa,
 *                  contagem). Reproduzível a partir da entrada.
 * - `DERIVED`    — resultado de um algoritmo com julgamento de design
 *                  embutido (pesos, limiares, tabelas de classe).
 * - `INFERRED`   — estimativa sobre dado incompleto. Mais fraco que DERIVED:
 *                  o resultado não é reproduzível só a partir da entrada.
 * - `CACHE`      — cópia local de uma das origens acima; o campo
 *                  `collectedAt`/`expiresAt` é que diz se ainda vale.
 */
/**
 * `USER_PROVIDED` entrou na Etapa 6: uma posição escolhida à mão no modo
 * manual não é observação do cliente nem dado oficial da Riot, e tratá-la
 * como qualquer um dos dois apagaria a diferença entre "o League disse" e
 * "o usuário disse".
 */
export type ProvenanceSourceType =
  | "OFFICIAL"
  | "OBSERVED"
  | "CALCULATED"
  | "DERIVED"
  | "INFERRED"
  | "USER_PROVIDED"
  | "CACHE";

/**
 * Se o dado pode ser usado agora, e como.
 *
 * - `AVAILABLE`   — presente e atual.
 * - `PARTIAL`     — presente, mas cobrindo menos do que deveria (amostra
 *                   incompleta, parte das entradas faltando). Usável com
 *                   ressalva explícita.
 * - `STALE`       — presente porém não atual (patch antigo, cache vencido).
 *                   Nunca deve ser apresentado como informação atual.
 * - `UNAVAILABLE` — não existe agora. Valor **tem que** ser ausente.
 */
export type AvailabilityStatus = "AVAILABLE" | "PARTIAL" | "STALE" | "UNAVAILABLE";

/**
 * Confiança numérica de 0 a 1.
 *
 * Convive de propósito com o `Confidence` categórico ("low"/"medium"/"high")
 * que já existe no domínio: o categórico é o vocabulário exibido ao jogador
 * e usado pelas heurísticas atuais; este numérico é o que permite comparar e
 * combinar confianças de fontes diferentes sem perder resolução. Use
 * `toConfidenceLabel`/`toConfidenceScore` pra atravessar os dois — nunca
 * duplique a conversão no chamador.
 */
export type ConfidenceScore = number;

/**
 * Contexto e origem de um dado. **Todo campo é opcional de propósito**: o
 * que não se aplica fica ausente, nunca preenchido com placeholder. Um
 * `sampleSize: 0` significa "amostra vazia, medida"; ausência de
 * `sampleSize` significa "amostra não se aplica ou não é conhecida" — as
 * duas coisas são diferentes e o contrato preserva a diferença.
 */
export interface DataProvenance {
  sourceType: ProvenanceSourceType;
  /** Identificação da fonte: "riot-api", "data-dragon", "lcu", "sparta". */
  sourceId?: string;
  /** Endpoint ou recurso concreto: "/lol/match/v5/matches/{id}". */
  resource?: string;
  patch?: string;
  region?: string;
  /** Idioma da fonte, quando ela é localizada ("pt_BR" na Data Dragon). */
  locale?: string;
  /** Elo/tier da amostra, quando a fonte segmenta por isso. */
  tier?: string;
  /** Fila (ranked solo, flex, normal), quando a fonte segmenta por isso. */
  queue?: string;
  /** Posição a que o dado se refere, quando é segmentado por rota. */
  position?: string;
  sampleSize?: number;
  /** ISO 8601. Quando o dado foi obtido/calculado. */
  collectedAt?: string;
  /** ISO 8601. A partir daqui o dado deve ser tratado como `STALE`. */
  expiresAt?: string;
  /** Versão do algoritmo, pra dado `DERIVED`/`INFERRED` ser recalculável. */
  algorithmVersion?: string;
  confidence?: ConfidenceScore;
  status?: AvailabilityStatus;
  /** Por que está indisponível. Só faz sentido com status UNAVAILABLE. */
  unavailableReason?: string;
  /** Por que está desatualizado. Só faz sentido com status STALE. */
  staleReason?: string;
}

/** Faixas usadas pra atravessar confiança numérica <-> categórica. */
const CONFIDENCE_MEDIUM_FLOOR = 0.4;
const CONFIDENCE_HIGH_FLOOR = 0.7;

/** Representativo de cada faixa, pro caminho categórico -> numérico. */
const CONFIDENCE_SCORE_BY_LABEL = { low: 0.2, medium: 0.55, high: 0.85 } as const;

export type ConfidenceLabel = keyof typeof CONFIDENCE_SCORE_BY_LABEL;

/** Converte confiança numérica no rótulo já usado pelo domínio e pela UI. */
export function toConfidenceLabel(score: ConfidenceScore): ConfidenceLabel {
  if (score >= CONFIDENCE_HIGH_FLOOR) return "high";
  if (score >= CONFIDENCE_MEDIUM_FLOOR) return "medium";
  return "low";
}

/**
 * Converte o rótulo categórico num representativo numérico da faixa. É uma
 * aproximação declarada: `toConfidenceScore(toConfidenceLabel(x))` não
 * devolve `x`, e não deve ser usado pra "recuperar" precisão perdida.
 */
export function toConfidenceScore(label: ConfidenceLabel): ConfidenceScore {
  return CONFIDENCE_SCORE_BY_LABEL[label];
}

/** `true` quando o dado pode ser usado como informação atual. */
export function isUsable(status: AvailabilityStatus): boolean {
  return status === "AVAILABLE" || status === "PARTIAL";
}
