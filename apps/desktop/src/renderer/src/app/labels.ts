import type {
  Confidence,
  PickRecommendation,
  PlayerWeakness,
  ProvenanceSourceType,
  RecommendationMetricKey,
  Role
} from "@sparta/core";

/**
 * Rotulos em portugues pros valores crus do dominio. Ficam num modulo so
 * porque varias telas mostram os mesmos enums - antes cada uma redefinia
 * (ou pior, mostrava o valor cru em ingles, tipo "high").
 */

export const ROLES: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

export const roleLabels: Record<Role, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MID: "Mid",
  ADC: "ADC",
  SUPPORT: "Suporte"
};

export const severityLabels: Record<PlayerWeakness["severity"], string> = {
  low: "baixa",
  medium: "média",
  high: "alta"
};

export const confidenceLabels: Record<Confidence, string> = {
  low: "baixa",
  medium: "média",
  high: "alta"
};

export const formTrendLabels: Record<string, string> = {
  improving: "melhorando",
  declining: "piorando",
  // "estável" sozinho soa como veredito sem contexto (feedback real do
  // usuario): descreve o que de fato significa - as ultimas partidas nao
  // mudaram o score o bastante pra contar como tendencia.
  stable: "sem variação recente"
};

/**
 * Rotulos das chaves de `ChampionPerformanceScore.components`
 * (`scoreChampionPerformance`). A ordem aqui e a ordem de exibicao: os
 * sinais mais diretos de desempenho primeiro.
 */
export const componentLabels: Record<string, string> = {
  kda: "KDA",
  winrate: "Vitórias",
  cs: "CS por minuto",
  damage: "Dano por minuto",
  gold: "Ouro por minuto",
  deaths: "Sobrevivência",
  kp: "Participação em abates",
  objective: "Participação em objetivos",
  vision: "Controle de visão",
  recent: "Forma recente"
};

/**
 * Rotulos das metricas estruturadas (`RecommendationMetricKey`). Cobre
 * tambem as chaves ainda nao produzidas pelo motor - o contrato ja separa
 * os conceitos, entao o rotulo existe junto e nao vira um `?? key` cru na
 * tela quando a metrica passar a ser calculada.
 */
export const metricKeyLabels: Record<RecommendationMetricKey, string> = {
  PERSONAL_PERFORMANCE: "Desempenho pessoal",
  PERSONAL_EXPERIENCE: "Experiência com o campeão",
  RECENT_FORM: "Forma recente",
  PERSONAL_MATCHUP: "Seu histórico no confronto",
  GLOBAL_MATCHUP: "Confronto no meta",
  LANE_MATCHUP: "Confronto de rota",
  BLIND_SAFETY: "Segurança em blind",
  ALLY_SYNERGY: "Sinergia com o time",
  TEAM_COMPOSITION: "Encaixe de composição",
  ENEMY_COMPOSITION_ANSWER: "Resposta ao draft inimigo",
  CHAMPION_DIFFICULTY: "Dificuldade do campeão",
  EXECUTION_RISK: "Risco de execução",
  PATCH_OFFICIAL_CHANGE: "Alteração no patch",
  PATCH_IMPACT: "Impacto do patch",
  META_STRENGTH: "Força no meta"
};

/**
 * Origem resumida, pra exibir junto da metrica quando ajuda a interpretar o
 * numero. Deliberadamente curto: o detalhe completo vive na proveniencia.
 */
export const sourceTypeLabels: Record<ProvenanceSourceType, string> = {
  OFFICIAL: "dado oficial da Riot",
  OBSERVED: "observado",
  CALCULATED: "calculado do seu histórico",
  DERIVED: "derivado por algoritmo",
  INFERRED: "estimado",
  USER_PROVIDED: "informado por você",
  CACHE: "de cache local"
};

/**
 * Categoria da recomendacao de pick - vem em ingles do dominio
 * (`PickRecommendation.category`) e era mostrada crua na tela.
 */
export const categoryLabels: Record<PickRecommendation["category"], string> = {
  best_blind: "Melhor pra blind",
  best_matchup: "Melhor matchup",
  best_teamfit: "Encaixa no time",
  safe_pick: "Escolha segura",
  comfort_pick: "Zona de conforto",
  strategic_option: "Opção estratégica"
};
