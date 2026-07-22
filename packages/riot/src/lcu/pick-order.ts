import type { LcuChampionSelectSnapshot } from "./read-only-client.js";

/**
 * Deriva a ordem de pick do jogador local (1-based) dentro do proprio time -
 * mesma semantica de `DraftState.pickOrder` no `recommendation-engine.ts`
 * (`pickOrder <= 1` significa blind pick, sem info do time adversario).
 * Conta quantas acoes de "pick" ja `completed` de companheiros de time
 * (`myTeam`, por `cellId`) aconteceram antes da propria acao de pick do
 * jogador, soma 1. Trocas de campeao (`championId` muda) nao afetam a
 * contagem, ja que ela e por `actorCellId`, nao por campeao escolhido.
 *
 * Retorna `undefined` quando a sessao ainda nao tem `localPlayerCellId`/
 * `actions`/`myTeam` disponiveis (sessao carregando ou nao existe) ou
 * quando a propria acao de pick do jogador ainda nao apareceu no historico
 * de acoes - o chamador deve cair pro input manual nesses casos, nunca
 * chutar um valor. Nao validado contra filas fora do draft ranqueado
 * normal (ARAM, blind pick puro, etc.) - o formato de `actions` pode variar.
 */
export function derivePickOrder(snapshot: LcuChampionSelectSnapshot): number | undefined {
  if (!snapshot.sessionExists || snapshot.localPlayerCellId === undefined) return undefined;
  const { localPlayerCellId, actions, myTeam } = snapshot;
  if (!actions || !myTeam) return undefined;

  const teamCellIds = new Set(myTeam.map((member) => member.cellId));
  const allActions = actions.flat();

  const ownPickIndex = allActions.findIndex(
    (action) => action.actorCellId === localPlayerCellId && action.type === "pick"
  );
  if (ownPickIndex === -1) return undefined;

  const priorTeamPicks = allActions
    .slice(0, ownPickIndex)
    .filter((action) => action.type === "pick" && action.completed && teamCellIds.has(action.actorCellId));

  return priorTeamPicks.length + 1;
}
