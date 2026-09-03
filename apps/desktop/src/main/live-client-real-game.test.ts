// @vitest-environment node
import { describe, expect, it } from "vitest";
import { connect } from "node:net";
import { LIVE_CLIENT_HOST, LIVE_CLIENT_PORT, LiveClientObserver } from "@sparta/riot";
import { DISABLED_LIVE_CLIENT_STATE, reduceLiveClientState } from "./live-client-state";

/**
 * Validacao contra uma partida REAL do League, com o Game Client servindo
 * https://127.0.0.1:2999.
 *
 * Por que existe: os demais testes provam o comportamento contra respostas
 * sinteticas. Este exercita o mesmo codigo de produto (observador + reducer)
 * contra o jogo de verdade, e e o unico caminho que fecha
 * `REAL_GAME_VALIDATION` sem depender de alguem repetir passos manuais.
 *
 * Opt-in explicito (`SPARTA_LIVE_CLIENT_REAL_GAME=1`) E porta escutando: sem
 * as duas condicoes ele se declara PULADO, nunca passa por omissao. Nao roda
 * em CI, e isso e correto - CI nao tem League instalado.
 *
 * Nada aqui imprime, grava ou afirma Riot ID: o que se verifica sobre o
 * identificador e a AUSENCIA dele depois da redacao.
 */
const OPT_IN = process.env.SPARTA_LIVE_CLIENT_REAL_GAME === "1";

async function gameClientListening(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: LIVE_CLIENT_HOST, port: LIVE_CLIENT_PORT });
    const settle = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1_000, () => settle(false));
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
  });
}

describe("observacao contra partida real", () => {
  it("le a partida em andamento e entrega um payload sanitizado", async (context) => {
    if (!OPT_IN || !(await gameClientListening())) {
      // Sem jogo aberto (ou sem opt-in) nao ha o que validar aqui.
      context.skip();
      return;
    }

    const observer = new LiveClientObserver();
    const rounds = [];
    for (let index = 0; index < 4; index += 1) {
      const result = await observer.poll();
      if (result) rounds.push(result);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    observer.stop();

    const withSnapshot = rounds.filter((round) => round.snapshot !== null);
    expect(withSnapshot.length).toBeGreaterThanOrEqual(2);

    const first = withSnapshot[0]!.snapshot!;
    const last = withSnapshot[withSnapshot.length - 1]!.snapshot!;

    // Partida real: o relogio anda, e a identidade da sessao nao muda.
    expect(last.game.gameTimeSeconds!).toBeGreaterThan(first.game.gameTimeSeconds!);
    expect(last.sessionId).toBe(first.sessionId);
    expect(first.availability.game).toBe(true);

    // Deduplicacao contra a API real, que devolve o historico inteiro a cada
    // chamada: nenhum id repetido entre rodadas da mesma sessao.
    const emitted = withSnapshot.flatMap((round) => round.snapshot!.newEvents.map((e) => e.id));
    expect(new Set(emitted).size).toBe(emitted.length);

    // O que de fato cruzaria o IPC.
    let state = DISABLED_LIVE_CLIENT_STATE;
    for (const round of withSnapshot) state = reduceLiveClientState(state, round).next;

    const serialized = JSON.stringify(state);
    expect(state.snapshot?.activePlayer.riotId).toBeUndefined();
    expect(serialized).not.toContain("#");
    expect(serialized).not.toContain("riotId");
    // Nenhuma superficie de terceiro atravessa: o contrato nem tem campo.
    for (const forbidden of ["summonerName", "items", "runes", "team", "respawnTimer", "position"]) {
      expect(serialized).not.toContain(forbidden);
    }
  }, 20_000);
});
