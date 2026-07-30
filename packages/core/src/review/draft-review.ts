/**
 * Revisão humana auditável do motor de recomendação.
 *
 * ## Para que serve
 *
 * A Etapa 23 tornou as decisões históricas observáveis. Antes de mexer em
 * peso, fórmula ou threshold, é preciso saber **o que um humano acha dos
 * casos reais** — e isso não existe em lugar nenhum do produto até aqui.
 *
 * ## O que este módulo deliberadamente NÃO faz
 *
 * - **Não usa vitória ou derrota como rótulo.** Uma recomendação boa pode
 *   perder e uma ruim pode ganhar; tratar o resultado como gabarito é o erro
 *   mais fácil e mais caro de cometer aqui.
 * - **Não produz nota geral, percentual de acerto nem versão vencedora.** A
 *   escala é qualitativa de propósito: virar número faria média entre
 *   dimensões que não são comparáveis.
 * - **Não sugere calibração.** Nenhuma saída daqui vira peso, e as tags são
 *   itens de investigação, não correções confirmadas.
 * - **Não toca no snapshot.** A revisão vive numa tabela separada; o que foi
 *   recomendado permanece exatamente como foi gravado.
 */

/** Versão do formulário. Muda quando as dimensões ou a escala mudarem. */
export const DRAFT_REVIEW_FORM_VERSION = "draft-review/1.0.0";

/**
 * Escala qualitativa. **Não converter em número**: `STRONG` não é 4 e
 * `WEAK` não é 1 — a distância entre eles não é conhecida, e somar
 * dimensões diferentes produziria uma média sem significado.
 */
export type ReviewRating = "STRONG" | "ADEQUATE" | "WEAK" | "INSUFFICIENT_DATA" | "NOT_APPLICABLE";

export const REVIEW_RATINGS: readonly ReviewRating[] = [
  "STRONG",
  "ADEQUATE",
  "WEAK",
  "INSUFFICIENT_DATA",
  "NOT_APPLICABLE"
];

/** Critério explícito de cada nível — o revisor precisa saber o que marca. */
export const REVIEW_RATING_DEFINITIONS: Record<ReviewRating, string> = {
  STRONG: "A conclusão é diretamente sustentada pelos sinais disponíveis no snapshot.",
  ADEQUATE: "A conclusão é útil, mas tem limitações claras.",
  WEAK: "A conclusão não representa bem as evidências disponíveis.",
  INSUFFICIENT_DATA: "O snapshot não permite avaliar esta dimensão.",
  NOT_APPLICABLE: "A dimensão não se aplica a este caso."
};

/** As seis dimensões avaliadas na fase cega. */
export const PRE_MATCH_DIMENSIONS = [
  "rankingCoherence",
  "strategicExplanation",
  "personalContextRepresentation",
  "executionRiskRepresentation",
  "uncertaintyHonesty",
  "practicalUsefulness"
] as const;

export type PreMatchDimension = (typeof PRE_MATCH_DIMENSIONS)[number];

export const PRE_MATCH_DIMENSION_DEFINITIONS: Record<PreMatchDimension, string> = {
  rankingCoherence: "A ordem dos candidatos parece coerente com os dados que existiam naquele momento.",
  strategicExplanation: "O encaixe estratégico apresentado corresponde ao draft revelado até ali.",
  personalContextRepresentation: "A experiência pessoal do jogador foi representada com fidelidade.",
  executionRiskRepresentation: "O risco de execução foi tratado de forma proporcional à evidência.",
  uncertaintyHonesty: "Limitações e cobertura foram apresentadas com honestidade, sem esconder ausência de dado.",
  practicalUsefulness: "As recomendações seriam praticamente úteis no champion select."
};

/** As quatro dimensões avaliadas depois da revelação. */
export const POST_MATCH_DIMENSIONS = [
  "observedCorrespondence",
  "explanationUsefulness",
  "informationGap",
  "postMatchClarity"
] as const;

export type PostMatchDimension = (typeof POST_MATCH_DIMENSIONS)[number];

export const POST_MATCH_DIMENSION_DEFINITIONS: Record<PostMatchDimension, string> = {
  observedCorrespondence:
    "Sinais apresentados no draft apareceram nos dados observados da partida. Correspondência não é causalidade.",
  explanationUsefulness: "As explicações do draft continuaram fazendo sentido depois de conhecer a partida.",
  informationGap: "Informação relevante estava indisponível no draft e só apareceu depois.",
  postMatchClarity: "O relatório pós-game ajudou a entender o que aconteceu."
};

/**
 * Problemas registráveis. Cada tag é um **item para investigação**, nunca
 * uma correção confirmada nem um ajuste de motor.
 */
export const REVIEW_ISSUE_TAGS = [
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
] as const;

export type ReviewIssueTag = (typeof REVIEW_ISSUE_TAGS)[number];

export const REVIEW_ISSUE_TAG_DEFINITIONS: Record<ReviewIssueTag, string> = {
  MISSING_DATA: "Faltou dado que deveria existir para este caso.",
  WRONG_ROLE_CONTEXT: "O contexto de posição usado não corresponde ao que estava acontecendo.",
  STALE_SOURCE: "Alguma fonte usada estava desatualizada.",
  LOW_COVERAGE_NOT_CLEAR: "A cobertura era baixa e isso não ficou visível o suficiente.",
  PERSONAL_EVIDENCE_MISREPRESENTED: "A evidência pessoal foi representada de forma enganosa.",
  STRATEGIC_SIGNAL_MISREPRESENTED: "Um sinal estratégico foi apresentado além do que a evidência sustenta.",
  EXECUTION_RISK_MISREPRESENTED: "O risco de execução foi exagerado ou minimizado.",
  DUPLICATED_SIGNAL: "O mesmo sinal apareceu duas vezes com nomes diferentes.",
  CONTRADICTORY_EXPLANATION: "Duas afirmações da mesma análise se contradizem.",
  RANKING_SURPRISE: "A ordem surpreendeu e merece investigação. **Não significa que está errada.**",
  POOL_LIMITATION: "O pool disponível limitou o que podia ser recomendado.",
  MATCHUP_CONTEXT_MISSING: "Faltou contexto de confronto que teria mudado a leitura.",
  OTHER: "Outro problema, descrito nas anotações."
};

export type DraftReviewStatus = "IN_PROGRESS" | "PRE_MATCH_REVIEWED" | "COMPLETED" | "NEEDS_INVESTIGATION";

/**
 * Transições permitidas.
 *
 * `NEEDS_INVESTIGATION` é um estado **terminal paralelo** a `COMPLETED`: a
 * revisão está finalizada, e o que a diferencia é o revisor ter marcado que
 * o caso precisa ser olhado de novo. Nenhum dos dois volta para trás — se a
 * avaliação precisar mudar, nasce uma revisão nova.
 */
const ALLOWED_REVIEW_TRANSITIONS: Record<DraftReviewStatus, readonly DraftReviewStatus[]> = {
  IN_PROGRESS: ["PRE_MATCH_REVIEWED"],
  PRE_MATCH_REVIEWED: ["COMPLETED", "NEEDS_INVESTIGATION"],
  COMPLETED: [],
  NEEDS_INVESTIGATION: []
};

export function canTransitionReview(from: DraftReviewStatus, to: DraftReviewStatus): boolean {
  return ALLOWED_REVIEW_TRANSITIONS[from].includes(to);
}

export function isTerminalReviewStatus(status: DraftReviewStatus): boolean {
  return status === "COMPLETED" || status === "NEEDS_INVESTIGATION";
}

export interface PreMatchAssessment {
  rankingCoherence: ReviewRating;
  strategicExplanation: ReviewRating;
  personalContextRepresentation: ReviewRating;
  executionRiskRepresentation: ReviewRating;
  uncertaintyHonesty: ReviewRating;
  practicalUsefulness: ReviewRating;
  issueTags: ReviewIssueTag[];
  notes?: string;
  submittedAt: string;
}

export interface PostMatchAssessment {
  observedCorrespondence: ReviewRating;
  explanationUsefulness: ReviewRating;
  informationGap: ReviewRating;
  postMatchClarity: ReviewRating;
  issueTags: ReviewIssueTag[];
  notes?: string;
  /** O revisor marcou que este caso precisa ser investigado. */
  needsInvestigation: boolean;
  submittedAt: string;
}

export interface DraftReview {
  id: string;
  playerId: string;
  draftSessionId: string;
  /** `null` quando a sessão não tinha snapshot vigente no lock-in. */
  snapshotId: string | null;
  /** `null` enquanto a partida não foi vinculada — estado honesto e comum. */
  matchId: string | null;
  status: DraftReviewStatus;
  preMatchAssessment: PreMatchAssessment | null;
  postMatchAssessment: PostMatchAssessment | null;
  /** Momento da revelação. `null` significa que a revisão ainda está cega. */
  resultRevealedAt: string | null;
  createdAt: string;
  completedAt: string | null;
  reviewVersion: string;
  /** Revisão que esta corrige. `null` na primeira. */
  supersedesReviewId: string | null;
  /** Por que a anterior foi corrigida. Ausente na primeira. */
  correctionReason?: string;
}

/** Limite das anotações livres. Revisão é registro, não documento longo. */
export const REVIEW_NOTES_MAX_LENGTH = 2000;

/**
 * Sanitiza anotação livre: remove caracteres de controle, normaliza espaços
 * e corta no limite. Devolve `undefined` quando não sobra conteúdo — nota
 * vazia é ausência, não string vazia.
 *
 * Não faz escape de HTML: o destino é armazenamento e leitura em React, que
 * já escapa por padrão. Escapar aqui gravaria `&lt;` no banco e corromperia
 * o texto original do revisor.
 */
export function sanitizeReviewNotes(notes: string | undefined | null): string | undefined {
  if (typeof notes !== "string") return undefined;
  // Remove caracteres de controle (incluindo os invisíveis) e normaliza
  // espaços. ` -` e `` cobrem a faixa inteira.
  // eslint-disable-next-line no-control-regex
  const cleaned = notes.replace(/[ -]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return undefined;
  return cleaned.slice(0, REVIEW_NOTES_MAX_LENGTH);
}

/** Remove tags repetidas e desconhecidas, preservando a ordem declarada. */
export function normalizeIssueTags(tags: readonly string[] | undefined): ReviewIssueTag[] {
  if (!tags) return [];
  const known = new Set<string>(REVIEW_ISSUE_TAGS);
  const seen = new Set<string>();
  const result: ReviewIssueTag[] = [];
  for (const tag of tags) {
    if (!known.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag as ReviewIssueTag);
  }
  return result;
}

/**
 * Contexto que a fase cega pode receber.
 *
 * O tipo existe para tornar o vazamento **impossível de passar despercebido**:
 * não há campo de resultado, KDA, duração nem estatística posterior aqui. Se
 * alguém precisar deles, terá que mudar o tipo — e a mudança aparece no diff.
 */
export interface BlindReviewContext {
  draftSessionId: string;
  snapshotId: string | null;
  role: string;
  roleSource: string;
  source: string;
  lockedInAt: string | null;
  selectedChampionId: number | null;
  knownDraft: unknown;
  snapshot: unknown;
  algorithmVersions: Record<string, string>;
  /** Se existe partida vinculada — **sem nenhum dado dela**. */
  hasLinkedMatch: boolean;
}

/**
 * Quando a avaliação de ranking pode ser exigida.
 *
 * Sessão sem snapshot vigente no lock-in não tem ranking a avaliar; nesse
 * caso `rankingCoherence` só aceita `INSUFFICIENT_DATA` ou `NOT_APPLICABLE`.
 */
export function isRankingAssessable(snapshotId: string | null): boolean {
  return snapshotId !== null;
}

export type PreMatchValidationError =
  | "RANKING_NOT_ASSESSABLE"
  | "INVALID_RATING"
  | "INVALID_ISSUE_TAG";

export interface PreMatchValidationResult {
  ok: boolean;
  errors: PreMatchValidationError[];
}

/**
 * Valida a submissão da fase cega **sem** olhar para a partida. A única
 * regra estrutural é a do ranking: sem snapshot não há ordem a julgar.
 */
export function validatePreMatchAssessment(input: {
  assessment: Omit<PreMatchAssessment, "submittedAt">;
  snapshotId: string | null;
}): PreMatchValidationResult {
  const errors: PreMatchValidationError[] = [];
  const valid = new Set<string>(REVIEW_RATINGS);

  for (const dimension of PRE_MATCH_DIMENSIONS) {
    if (!valid.has(input.assessment[dimension])) errors.push("INVALID_RATING");
  }

  if (
    !isRankingAssessable(input.snapshotId) &&
    input.assessment.rankingCoherence !== "INSUFFICIENT_DATA" &&
    input.assessment.rankingCoherence !== "NOT_APPLICABLE"
  ) {
    errors.push("RANKING_NOT_ASSESSABLE");
  }

  const known = new Set<string>(REVIEW_ISSUE_TAGS);
  if (input.assessment.issueTags.some((tag) => !known.has(tag))) errors.push("INVALID_ISSUE_TAG");

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

/** Contagem com denominador explícito. Nunca só o numerador. */
export interface ReviewCount {
  count: number;
  total: number;
}

export interface DimensionDistribution {
  dimension: string;
  /** Quantas revisões marcaram cada nível. Zero real permanece visível. */
  ratings: Record<ReviewRating, number>;
  /** Revisões que avaliaram esta dimensão. */
  total: number;
}

export interface IssueTagFrequency {
  tag: ReviewIssueTag;
  count: number;
  /** Revisões consideradas — o denominador da frequência. */
  total: number;
}

export interface DraftReviewSummary {
  reviewsConsidered: number;
  /** Revisões que chegaram a um estado terminal. */
  completed: ReviewCount;
  /** Revisões ainda na fase cega. */
  blind: ReviewCount;
  /** Casos que o revisor marcou para investigação. */
  needsInvestigation: ReviewCount;
  /** Revisões em que alguma dimensão ficou `INSUFFICIENT_DATA`. */
  withInsufficientData: ReviewCount;
  preMatchDistribution: DimensionDistribution[];
  postMatchDistribution: DimensionDistribution[];
  issueTagFrequencies: IssueTagFrequency[];
  /** Versões do motor representadas, com quantas revisões cada uma. */
  algorithmVersions: { version: string; reviews: number }[];
  formVersions: { version: string; reviews: number }[];
  summaryVersion: string;
}

/**
 * Agrega revisões de forma **puramente descritiva**.
 *
 * Só entram revisões atuais (não substituídas) — passar uma corrigida e a
 * corretora contaria o mesmo caso duas vezes. Nada aqui vira nota geral,
 * percentual de acerto ou recomendação de peso: são contagens com
 * denominador, e só.
 */
export function summarizeDraftReviews(
  reviews: readonly (DraftReview & { algorithmVersions?: Record<string, string> })[]
): DraftReviewSummary {
  const total = reviews.length;
  const emptyRatings = (): Record<ReviewRating, number> => ({
    STRONG: 0,
    ADEQUATE: 0,
    WEAK: 0,
    INSUFFICIENT_DATA: 0,
    NOT_APPLICABLE: 0
  });

  const preMatch = new Map<string, { ratings: Record<ReviewRating, number>; total: number }>(
    PRE_MATCH_DIMENSIONS.map((dimension) => [dimension, { ratings: emptyRatings(), total: 0 }])
  );
  const postMatch = new Map<string, { ratings: Record<ReviewRating, number>; total: number }>(
    POST_MATCH_DIMENSIONS.map((dimension) => [dimension, { ratings: emptyRatings(), total: 0 }])
  );
  const tagCounts = new Map<ReviewIssueTag, number>(REVIEW_ISSUE_TAGS.map((tag) => [tag, 0]));
  const versionCounts = new Map<string, number>();
  const formCounts = new Map<string, number>();

  let completed = 0;
  let blind = 0;
  let needsInvestigation = 0;
  let withInsufficientData = 0;

  for (const review of reviews) {
    if (isTerminalReviewStatus(review.status)) completed += 1;
    if (review.resultRevealedAt === null) blind += 1;
    if (review.status === "NEEDS_INVESTIGATION") needsInvestigation += 1;

    formCounts.set(review.reviewVersion, (formCounts.get(review.reviewVersion) ?? 0) + 1);
    for (const version of Object.values(review.algorithmVersions ?? {})) {
      versionCounts.set(version, (versionCounts.get(version) ?? 0) + 1);
    }

    let insufficient = false;

    if (review.preMatchAssessment) {
      for (const dimension of PRE_MATCH_DIMENSIONS) {
        const rating = review.preMatchAssessment[dimension];
        const entry = preMatch.get(dimension);
        if (!entry) continue;
        entry.ratings[rating] += 1;
        entry.total += 1;
        if (rating === "INSUFFICIENT_DATA") insufficient = true;
      }
      for (const tag of review.preMatchAssessment.issueTags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    if (review.postMatchAssessment) {
      for (const dimension of POST_MATCH_DIMENSIONS) {
        const rating = review.postMatchAssessment[dimension];
        const entry = postMatch.get(dimension);
        if (!entry) continue;
        entry.ratings[rating] += 1;
        entry.total += 1;
        if (rating === "INSUFFICIENT_DATA") insufficient = true;
      }
      for (const tag of review.postMatchAssessment.issueTags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    if (insufficient) withInsufficientData += 1;
  }

  return {
    reviewsConsidered: total,
    completed: { count: completed, total },
    blind: { count: blind, total },
    needsInvestigation: { count: needsInvestigation, total },
    withInsufficientData: { count: withInsufficientData, total },
    preMatchDistribution: [...preMatch.entries()].map(([dimension, entry]) => ({
      dimension,
      ratings: entry.ratings,
      total: entry.total
    })),
    postMatchDistribution: [...postMatch.entries()].map(([dimension, entry]) => ({
      dimension,
      ratings: entry.ratings,
      total: entry.total
    })),
    issueTagFrequencies: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count, total }))
      .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, "en")),
    algorithmVersions: [...versionCounts.entries()]
      .map(([version, reviews_]) => ({ version, reviews: reviews_ }))
      .sort((left, right) => right.reviews - left.reviews || left.version.localeCompare(right.version, "en")),
    formVersions: [...formCounts.entries()]
      .map(([version, reviews_]) => ({ version, reviews: reviews_ }))
      .sort((left, right) => left.version.localeCompare(right.version, "en")),
    summaryVersion: DRAFT_REVIEW_FORM_VERSION
  };
}
