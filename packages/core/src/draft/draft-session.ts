import type { DraftState, PlayerRoleSource, Role } from "../types/domain.js";

/**
 * Sessão de draft persistida: o que estava acontecendo no champion select e
 * em que ponto do ciclo de vida ela parou.
 *
 * ## O que este módulo NÃO faz
 *
 * Não avalia se a escolha do jogador foi boa, não compara com a partida e não
 * adivinha conclusão. Uma sessão cuja partida nunca foi identificada fica
 * **sem vínculo** e sem `COMPLETED` — "não sabemos como terminou" é um estado
 * legítimo, e inventar o contrário destruiria justamente o dado que esta
 * persistência existe pra guardar.
 */

export const DRAFT_SESSION_CONTRACT_VERSION = "draft-session/1.0.0";

/** De onde a sessão veio. Manual nunca é apresentada como observada. */
export type DraftSessionSource =
  /** Lida da sessão de champion select do cliente do League. */
  | "LCU"
  /** Montada à mão no modo de simulação do Sparta. */
  | "USER";

/**
 * Ciclo de vida.
 *
 * - `ACTIVE`     — champion select em andamento.
 * - `LOCKED_IN`  — o jogador confirmou um campeão no Sparta.
 * - `IN_GAME`    — a partida começou (fase do gameflow), sem vínculo ainda.
 * - `COMPLETED`  — vínculo **confirmado** com uma partida do Match-V5.
 * - `ABANDONED`  — dodge, saída do champion select ou encerramento sem pick.
 *
 * `COMPLETED` exige identificador confiável. Sem ele a sessão fica em
 * `IN_GAME` ou `LOCKED_IN` — nunca é promovida por semelhança.
 */
export type DraftSessionStatus = "ACTIVE" | "LOCKED_IN" | "IN_GAME" | "COMPLETED" | "ABANDONED";

/** Estados a partir dos quais nada mais muda. */
export const TERMINAL_DRAFT_SESSION_STATUSES: readonly DraftSessionStatus[] = ["COMPLETED", "ABANDONED"];

/**
 * Transições permitidas. Tudo que não está aqui é recusado — inclusive
 * qualquer volta para `ACTIVE`: sessão encerrada não reabre, e um tick
 * atrasado do LCU não pode ressuscitá-la.
 */
const ALLOWED_TRANSITIONS: Record<DraftSessionStatus, readonly DraftSessionStatus[]> = {
  ACTIVE: ["ACTIVE", "LOCKED_IN", "IN_GAME", "ABANDONED"],
  // Sem confirmar campeão dá pra entrar em jogo (o Sparta pode não ter
  // registrado o lock) e dá pra abandonar.
  LOCKED_IN: ["LOCKED_IN", "IN_GAME", "COMPLETED", "ABANDONED"],
  IN_GAME: ["IN_GAME", "COMPLETED", "ABANDONED"],
  COMPLETED: [],
  ABANDONED: []
};

export function canTransitionDraftSession(from: DraftSessionStatus, to: DraftSessionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalDraftSessionStatus(status: DraftSessionStatus): boolean {
  return TERMINAL_DRAFT_SESSION_STATUSES.includes(status);
}

/** Um campeão conhecido do draft, com a posição quando a fila atribuiu uma. */
export interface KnownDraftPick {
  championId: number;
  championName: string;
  /** Ausente quando a fila não atribuiu posição (blind pick, escolha manual). */
  role?: Role;
}

/**
 * Estado conhecido do draft no instante da gravação.
 *
 * ## Bans não têm lado
 *
 * `DraftState.bannedChampionIds` é uma lista plana, e a derivação do LCU
 * junta os bans dos dois times de propósito (um ban derruba o campeão pra
 * todo mundo). **Separar bans aliados de inimigos exigiria inventar o lado**,
 * então eles são preservados sem atribuição de time e o contrato diz isso em
 * `banSideKnown: false`. Quando a leitura do cliente passar a distinguir, o
 * campo vira `true` e as duas listas são preenchidas de verdade.
 */
export interface KnownDraftState {
  allies: KnownDraftPick[];
  enemies: KnownDraftPick[];
  /** Bans conhecidos, sem atribuição de time enquanto `banSideKnown` for `false`. */
  bannedChampionIds: number[];
  banSideKnown: boolean;
  allyBannedChampionIds?: number[];
  enemyBannedChampionIds?: number[];
  /** Adversário da própria posição, quando identificado. */
  directOpponentChampionId?: number;
  /** Quantos dos 5 aliados (incluindo o jogador) ainda não foram revelados. */
  unknownAllyPicks: number;
  /** Quantos dos 5 inimigos ainda não foram revelados. */
  unknownEnemyPicks: number;
}

const TEAM_SIZE = 5;

/**
 * Extrai o estado conhecido de um `DraftState`. Nada é completado: o que não
 * foi revelado vira contagem de desconhecidos, não entrada vazia.
 *
 * O próprio jogador não está em `draft.allies` (contrato da Fase 16), então
 * ele é contado à parte no total de aliados revelados.
 */
export function summarizeKnownDraftState(draft: DraftState): KnownDraftState {
  const toPick = (pick: { championId: number; championName: string; role?: Role }): KnownDraftPick => ({
    championId: pick.championId,
    championName: pick.championName,
    ...(pick.role ? { role: pick.role } : {})
  });

  const allies = draft.allies.map(toPick);
  const enemies = draft.enemies.map(toPick);
  const revealedAllies = allies.length + (draft.selectedChampionId !== undefined ? 1 : 0);

  return {
    allies,
    enemies,
    bannedChampionIds: [...draft.bannedChampionIds],
    banSideKnown: false,
    ...(draft.enemyLaneChampionId !== undefined
      ? { directOpponentChampionId: draft.enemyLaneChampionId }
      : {}),
    unknownAllyPicks: Math.max(0, TEAM_SIZE - revealedAllies),
    unknownEnemyPicks: Math.max(0, TEAM_SIZE - enemies.length)
  };
}

export interface DraftSessionRecord {
  id: string;
  playerId: string;
  source: DraftSessionSource;
  status: DraftSessionStatus;
  role: Role;
  roleSource: PlayerRoleSource;
  queueId?: number;
  gameVersion?: string;
  patch?: string;
  selectedChampionId?: number;
  knownDraft: KnownDraftState;
  startedAt: string;
  updatedAt: string;
  lockedInAt?: string;
  completedAt?: string;
  /**
   * Identificador da sessão do lado do cliente. Hoje é uma chave técnica
   * gerada pelo desktop **ao entrar** no champion select e descartada ao
   * sair; quando o LCU expuser um id estável de sessão, ele passa a ocupar
   * este campo. Ver `docs/draft-persistence.md`.
   */
  externalSessionId?: string;
  /** `matchId` do Match-V5, só quando o vínculo é confiável. */
  linkedMatchId?: string;
}

/**
 * Por que a escolha do jogador não pôde ser comparada ao ranking.
 * Nenhum destes valores é julgamento sobre a escolha.
 */
export type SelectedChampionRankState =
  /** Estava entre as recomendações registradas, com posição conhecida. */
  | "RANKED"
  /** Havia snapshot válido e o campeão não estava nele. */
  | "NOT_IN_SNAPSHOT"
  /** A escolha aconteceu antes de existir snapshot — só o fato é conhecido. */
  | "NO_SNAPSHOT";

export interface SelectedChampionComparison {
  championId: number;
  state: SelectedChampionRankState;
  /** Posição no ranking daquele snapshot. Ausente fora de `RANKED`. */
  rank?: number;
  /** Grupo em que apareceu. Ausente fora de `RANKED`. */
  group?: "PRIMARY" | "ALTERNATIVE";
  /** Snapshot usado na comparação. Ausente em `NO_SNAPSHOT`. */
  snapshotId?: string;
}

/**
 * Compara o campeão escolhido com um snapshot, **sem emitir julgamento**.
 * Escolha fora do ranking é um fato registrado, não um erro: o jogador pode
 * ter motivos que o Sparta não modela.
 */
export function compareSelectedChampion(input: {
  selectedChampionId: number;
  snapshot?: {
    id: string;
    recommendations: readonly { championId: number; rank: number; group: "PRIMARY" | "ALTERNATIVE" }[];
  };
}): SelectedChampionComparison {
  if (!input.snapshot) {
    return { championId: input.selectedChampionId, state: "NO_SNAPSHOT" };
  }

  const match = input.snapshot.recommendations.find(
    (recommendation) => recommendation.championId === input.selectedChampionId
  );
  if (!match) {
    return {
      championId: input.selectedChampionId,
      state: "NOT_IN_SNAPSHOT",
      snapshotId: input.snapshot.id
    };
  }

  return {
    championId: input.selectedChampionId,
    state: "RANKED",
    rank: match.rank,
    group: match.group,
    snapshotId: input.snapshot.id
  };
}

/**
 * Estado do vínculo com uma partida. `UNLINKED` é honesto e permanente até
 * aparecer um identificador confiável — nunca resolvido por semelhança de
 * campeão, horário, resultado ou posição.
 */
export type MatchLinkState = "LINKED" | "UNLINKED";

export interface MatchLinkDecision {
  state: MatchLinkState;
  matchId?: string;
  /** Por que não foi vinculada. Ausente quando `LINKED`. */
  reason?: string;
}

/**
 * Decide o vínculo. Só aceita um identificador de partida explícito; qualquer
 * outra pista é recusada com motivo.
 */
export function decideMatchLink(input: { matchId?: string }): MatchLinkDecision {
  const matchId = input.matchId?.trim();
  if (!matchId) {
    return {
      state: "UNLINKED",
      reason: "Nenhum identificador de partida confiável foi observado para esta sessão."
    };
  }
  return { state: "LINKED", matchId };
}
