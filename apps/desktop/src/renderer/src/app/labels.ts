import type { Confidence, PickRecommendation, PlayerWeakness, Role } from "@sparta/core";

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

/** Rotulos das chaves de `PickRecommendation.metrics` (@sparta/core). */
export const metricLabels: Record<string, string> = {
  personalPerformance: "Desempenho pessoal",
  recentForm: "Forma recente",
  matchup: "Matchup",
  blindSafety: "Segurança em blind",
  allySynergy: "Sinergia com o time",
  enemyDraftAnswer: "Resposta ao draft inimigo",
  compositionFit: "Encaixe de composição",
  meta: "Meta do patch"
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
  comfort_pick: "Zona de conforto"
};
