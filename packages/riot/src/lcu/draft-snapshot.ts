import type { Role } from "@sparta/core";
import { derivePlayerRole, POSITION_TO_ROLE } from "./player-role.js";
import type { LcuChampionSelectSnapshot } from "./read-only-client.js";

/** Um campeao ja revelado na sessao, do lado aliado ou inimigo. */
export interface LcuDraftMember {
  championId: number;
  /** Posicao atribuida pelo LCU, quando a fila atribui (ranqueada/draft). */
  position?: Role;
}

/**
 * Estado do draft lido da sessao de champion select. So IDs numericos: o
 * processo main nao tem catalogo de campeao, entao a resolucao de nome/arte
 * fica com o renderer, que ja carrega o catalogo da Data Dragon.
 */
export interface LcuDraftSnapshot {
  /** Companheiros de time ja revelados - NAO inclui o proprio jogador. */
  allies: LcuDraftMember[];
  enemies: LcuDraftMember[];
  bannedChampionIds: number[];
  /** Inimigo na mesma posicao do jogador, quando as duas sao conhecidas. */
  enemyLaneChampionId?: number;
  /** Campeao do proprio jogador, quando ja escolhido. */
  selectedChampionId?: number;
}

/** `0` e o valor do LCU pra "ainda nao escolheu". */
const NO_CHAMPION = 0;

function toMember(member: { championId: number; assignedPosition?: string }): LcuDraftMember {
  const position = member.assignedPosition?.toLowerCase();
  return {
    championId: member.championId,
    position: position ? POSITION_TO_ROLE[position] : undefined
  };
}

/**
 * Deriva o estado do draft (aliados, inimigos, banimentos) da sessao de
 * champion select do LCU - somente leitura, nenhuma acao e enviada ao
 * cliente (ver docs/riot-compliance.md).
 *
 * Ate agora o Sparta so lia dessa sessao a ordem de pick e a posicao do
 * jogador; o time inimigo tinha que ser marcado a mao num grid de ~170
 * icones, no meio do champion select. Com isto, quando o cliente esta
 * aberto, o draft se preenche sozinho e a recomendacao passa a considerar
 * campeao ja escolhido e banido (o motor descarta os dois).
 *
 * O proprio jogador fica FORA de `allies`: aliado ali significa
 * "companheiro de time", e incluir a si mesmo faria a analise de composicao
 * contar o candidato duas vezes (o motor ja injeta o campeao avaliado).
 * O campeao do jogador sai em `selectedChampionId`.
 *
 * Retorna `undefined` quando ainda nao ha sessao - o chamador mantem o que
 * tinha em vez de limpar o draft a cada piscada da API.
 */
export function deriveDraftSnapshot(snapshot: LcuChampionSelectSnapshot): LcuDraftSnapshot | undefined {
  if (!snapshot.sessionExists) return undefined;

  const localCellId = snapshot.localPlayerCellId;
  const myTeam = snapshot.myTeam ?? [];
  const theirTeam = snapshot.theirTeam ?? [];

  const localMember = localCellId === undefined ? undefined : myTeam.find((member) => member.cellId === localCellId);

  const allies = myTeam
    .filter((member) => member.cellId !== localCellId && member.championId !== NO_CHAMPION)
    .map(toMember);

  const enemies = theirTeam.filter((member) => member.championId !== NO_CHAMPION).map(toMember);

  // Banimentos: acoes de ban ja concluidas, dos dois times. Um ban derruba
  // o campeao pra todo mundo, entao nao importa quem baniu.
  const bannedChampionIds = [
    ...new Set(
      (snapshot.actions ?? [])
        .flat()
        .filter((action) => action.type === "ban" && action.completed)
        .map((action) => action.championId ?? NO_CHAMPION)
        .filter((championId) => championId !== NO_CHAMPION)
    )
  ];

  const playerRole = derivePlayerRole(snapshot);
  const enemyLaneChampionId =
    playerRole === undefined ? undefined : enemies.find((enemy) => enemy.position === playerRole)?.championId;

  return {
    allies,
    enemies,
    bannedChampionIds,
    enemyLaneChampionId,
    selectedChampionId:
      localMember && localMember.championId !== NO_CHAMPION ? localMember.championId : undefined
  };
}

/**
 * Compara dois snapshots pra decidir se vale propagar mudanca. O poll roda
 * a cada 2.5s e a maior parte dos ticks nao muda nada - sem esta guarda o
 * renderer receberia um objeto novo toda vez e refaria a busca de
 * recomendacoes a cada 2.5 segundos.
 */
export function isSameDraftSnapshot(a: LcuDraftSnapshot | undefined, b: LcuDraftSnapshot | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}
