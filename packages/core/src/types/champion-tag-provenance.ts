import type { DataProvenance } from "./provenance.js";

/**
 * Proveniência de um `ChampionTag`: de onde as dimensões vieram e quanto
 * daquilo foi de fato revisado por alguém.
 *
 * ## Por que um tipo próprio em vez de só `DataProvenance`
 *
 * `DataProvenance` responde "de que fonte veio e está disponível?". Aqui
 * existe uma segunda pergunta que ela não cobre: **quanto do perfil é
 * leitura de classe e quanto é curadoria**. Um campeão pode ter `pickoff`
 * revisado à mão e as outras oito dimensões derivadas do `champion.json` —
 * um único `sourceType` para a entrada inteira apagaria essa diferença.
 * Por isso a origem continua em `DataProvenance` (reusada, não duplicada) e
 * o eixo novo é o **estado de revisão**, com as dimensões revisadas
 * nomeadas uma a uma.
 *
 * ## O que este tipo deliberadamente NÃO é
 *
 * Estado de revisão **não é confiança estatística**. `REVIEWED` significa
 * "alguém olhou este campeão", não "este número está calibrado contra
 * partidas reais" — nenhuma das duas coisas existe hoje. Por isso não há
 * nenhum campo numérico de confiança aqui: atribuir um seria inventar
 * metodologia. `DataProvenance.confidence` continua disponível para quem
 * de fato mede algo (matchup pessoal, por exemplo).
 */

/**
 * As 9 dimensões numéricas do `ChampionTag` mais os dois campos
 * descritivos. `roles` não é uma dimensão curável: sem fonte global
 * aprovada, nem override manual pode promovê-lo a elegibilidade.
 */
export const CHAMPION_TAG_DIMENSIONS = [
  "blindSafety",
  "difficulty",
  "engage",
  "peel",
  "frontline",
  "pickoff",
  "waveclear",
  "scaling",
  "earlyPressure",
  "damageProfile",
  "tags"
] as const;

export type ChampionTagDimension = (typeof CHAMPION_TAG_DIMENSIONS)[number];

/** Só as dimensões numéricas (0-1), separadas por precisarem de validação. */
export const CHAMPION_TAG_NUMERIC_DIMENSIONS = [
  "blindSafety",
  "difficulty",
  "engage",
  "peel",
  "frontline",
  "pickoff",
  "waveclear",
  "scaling",
  "earlyPressure"
] as const;

export type ChampionTagNumericDimension = (typeof CHAMPION_TAG_NUMERIC_DIMENSIONS)[number];

/**
 * Quanto do perfil foi revisado por uma pessoa.
 *
 * - `UNREVIEWED`         — tudo veio da derivação automática.
 * - `PARTIALLY_REVIEWED` — pelo menos uma dimensão foi revisada, e pelo
 *                          menos uma continua derivada.
 * - `REVIEWED`           — todas as dimensões foram revisadas.
 *
 * Ausência do estado (campo inteiro indefinido) é um quarto caso e
 * significa **origem não informada** — típico de registro histórico gravado
 * antes desta etapa. Não é sinônimo de `UNREVIEWED`: "ninguém revisou" é
 * uma afirmação; "não sabemos" não é.
 */
export type ChampionTagReviewState = "UNREVIEWED" | "PARTIALLY_REVIEWED" | "REVIEWED";

/** Registro de uma dimensão sobrescrita à mão. */
export interface ChampionTagOverride {
  /** Por que o valor derivado não servia. Ausente quando não registrado. */
  reason?: string;
  /** ISO 8601. Ausente quando a data da revisão não é conhecida. */
  reviewedAt?: string;
}

export interface ChampionTagProvenance {
  /** Origem e versões, no contrato compartilhado da Etapa 2. */
  source: DataProvenance;
  reviewState: ChampionTagReviewState;
  /**
   * Dimensões que foram revisadas à mão. Vazio em entrada `UNREVIEWED`.
   * Nomeadas uma a uma de propósito: é o que permite dizer que `pickoff`
   * foi revisado sem afirmar nada sobre `peel`.
   */
  reviewedDimensions: ChampionTagDimension[];
  /** Detalhe por dimensão sobrescrita, quando registrado. */
  overrides?: Partial<Record<ChampionTagDimension, ChampionTagOverride>>;
}

/**
 * Deriva o estado de revisão a partir das dimensões revisadas. Nunca é
 * declarado à mão no arquivo: assim ele não pode divergir da lista.
 */
export function deriveReviewState(reviewedDimensions: readonly ChampionTagDimension[]): ChampionTagReviewState {
  if (reviewedDimensions.length === 0) return "UNREVIEWED";
  return reviewedDimensions.length >= CHAMPION_TAG_DIMENSIONS.length ? "REVIEWED" : "PARTIALLY_REVIEWED";
}

/**
 * `true` quando a fonte ou o algoritmo declarados na proveniência ficaram
 * para trás. Usado pelo modo de verificação do gerador e por qualquer
 * consumidor que precise marcar o perfil como `STALE`.
 *
 * Versão ausente **não** conta como desatualizada: não dá pra afirmar que
 * um registro sem versão está velho, só que não se sabe. Quem precisa
 * distinguir isso deve checar a ausência antes de chamar esta função.
 */
export function isChampionTagOutdated(
  provenance: ChampionTagProvenance | undefined,
  current: { dataDragonVersion: string; algorithmVersion: string }
): boolean {
  if (!provenance) return false;
  const { patch, algorithmVersion } = provenance.source;
  if (patch !== undefined && patch !== current.dataDragonVersion) return true;
  if (algorithmVersion !== undefined && algorithmVersion !== current.algorithmVersion) return true;
  return false;
}
