import type { Role } from "@sparta/core";
import type { LcuChampionSelectSnapshot } from "./read-only-client.js";

/**
 * Mapeia o `assignedPosition` do LCU (minusculo, vocabulario do cliente
 * League) pro `Role` do Sparta. `"bottom"` = ADC, `"utility"` = SUPPORT -
 * nomenclatura da Riot, nao inventada aqui.
 */
const POSITION_TO_ROLE: Record<string, Role> = {
  top: "TOP",
  jungle: "JUNGLE",
  middle: "MID",
  bottom: "ADC",
  utility: "SUPPORT"
};

/**
 * Deriva o papel (Role) do jogador local a partir da sessao de champion
 * select do LCU. Le `assignedPosition` da entrada do proprio jogador em
 * `myTeam` (por `cellId === localPlayerCellId`) - campo que o LCU atualiza
 * ao vivo quando dois jogadores trocam de posicao pela ferramenta de troca
 * do proprio cliente, entao reler a cada poll ja detecta a troca de lane
 * sem estado extra.
 *
 * Retorna `undefined` (nunca chuta) quando a sessao nao existe, o jogador
 * local nao foi encontrado em `myTeam`, ou a posicao vem vazia/desconhecida
 * (blind pick, ARAM e outras filas onde o LCU nao atribui posicao) - o
 * chamador cai pro seletor manual nesses casos.
 */
export function derivePlayerRole(snapshot: LcuChampionSelectSnapshot): Role | undefined {
  if (!snapshot.sessionExists || snapshot.localPlayerCellId === undefined || !snapshot.myTeam) {
    return undefined;
  }
  const localMember = snapshot.myTeam.find((member) => member.cellId === snapshot.localPlayerCellId);
  const position = localMember?.assignedPosition?.toLowerCase();
  if (!position) return undefined;
  return POSITION_TO_ROLE[position];
}
