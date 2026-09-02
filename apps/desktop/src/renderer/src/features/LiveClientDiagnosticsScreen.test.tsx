import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveClientStatePayload } from "../sparta-global";
import { LiveClientDiagnosticsScreen } from "./LiveClientDiagnosticsScreen";

/**
 * A tela de diagnostico e o unico lugar onde a observacao ao vivo aparece, e
 * e de DESENVOLVIMENTO. O que estes testes protegem: o gate visivel, a
 * distincao ausencia x zero na leitura, e a ausencia de qualquer dado de
 * adversario ou de identidade.
 */
function stubBridge(state: LiveClientStatePayload) {
  const listeners: ((next: LiveClientStatePayload) => void)[] = [];
  const bridge = {
    getLiveClientState: vi.fn(() => Promise.resolve(state)),
    onLiveClient: vi.fn((callback: (next: LiveClientStatePayload) => void) => {
      listeners.push(callback);
      return () => listeners.splice(listeners.indexOf(callback), 1);
    })
  };
  (window as unknown as { sparta: unknown }).sparta = bridge;
  return { bridge, push: (next: LiveClientStatePayload) => listeners.forEach((fn) => fn(next)) };
}

const LIVE_STATE: LiveClientStatePayload = {
  enabled: true,
  state: "LIVE",
  sessionId: "live-abc-1",
  snapshot: {
    observedAt: "2026-09-02T12:00:00.000Z",
    sessionId: "live-abc-1",
    game: { gameTimeSeconds: 125, mode: "CLASSIC", mapName: "Summoner's Rift" },
    activePlayer: {
      level: 7,
      currentGold: 0,
      scores: { kills: 2, deaths: 0, assists: 3, creepScore: 74 }
    },
    newEvents: [],
    availability: { game: true, activePlayer: true, scores: true, events: true }
  },
  recentEvents: [{ id: 4, name: "DragonKill", gameTimeSeconds: 610 }]
};

afterEach(() => {
  delete (window as unknown as { sparta?: unknown }).sparta;
});

describe("LiveClientDiagnosticsScreen", () => {
  it("declara o protótipo desligado quando o gate está fechado", async () => {
    stubBridge({
      enabled: false,
      state: "UNAVAILABLE",
      sessionId: "",
      snapshot: null,
      recentEvents: []
    });

    render(<LiveClientDiagnosticsScreen />);

    expect(await screen.findByText("Protótipo desligado")).toBeTruthy();
    // Nada de observação aparece com o gate fechado.
    expect(screen.queryByText("Sessão de observação")).toBeNull();
  });

  it("mostra a observação factual do próprio jogador", async () => {
    stubBridge(LIVE_STATE);

    render(<LiveClientDiagnosticsScreen />);

    expect(await screen.findByText("Ao vivo")).toBeTruthy();
    expect(screen.getByText("live-abc-1")).toBeTruthy();
    expect(screen.getByText("2:05")).toBeTruthy();
    expect(screen.getByText("CLASSIC")).toBeTruthy();
    expect(screen.getByText("2 / 0 / 3")).toBeTruthy();
    expect(screen.getByText("74")).toBeTruthy();
  });

  it("zero real aparece como zero; ausência aparece como travessão", async () => {
    stubBridge({
      ...LIVE_STATE,
      snapshot: {
        ...LIVE_STATE.snapshot!,
        game: { gameTimeSeconds: 0 },
        activePlayer: { currentGold: 0 },
        availability: { game: true, activePlayer: true, scores: false, events: true }
      }
    });

    render(<LiveClientDiagnosticsScreen />);

    // Ouro zero real é exibido; placar ausente vira travessão, nunca 0.
    expect(await screen.findByText("0:00")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("Placar: indisponível")).toBeTruthy();
    expect(screen.getByText("Partida: respondeu")).toBeTruthy();
  });

  it("lista cada evento uma única vez, com o ID factual da Riot", async () => {
    stubBridge(LIVE_STATE);

    render(<LiveClientDiagnosticsScreen />);

    expect(await screen.findByText("DragonKill")).toBeTruthy();
    expect(screen.getAllByText("DragonKill")).toHaveLength(1);
    expect(screen.getByText("#4")).toBeTruthy();
    expect(screen.getByText("10:10")).toBeTruthy();
  });

  it("nunca renderiza Riot ID nem dado de adversário", async () => {
    stubBridge(LIVE_STATE);

    const { container } = render(<LiveClientDiagnosticsScreen />);
    await screen.findByText("Ao vivo");

    const text = container.textContent ?? "";
    expect(text).not.toContain("#117");
    expect(text.toLowerCase()).not.toContain("riotid");
    for (const forbidden of ["Inimigo", "Adversário", "Time inimigo", "playerlist"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("acompanha a atualização transmitida pelo main", async () => {
    const { push } = stubBridge(LIVE_STATE);

    render(<LiveClientDiagnosticsScreen />);
    await screen.findByText("Ao vivo");

    push({ ...LIVE_STATE, state: "DEGRADED" });

    await waitFor(() => expect(screen.getByText("Degradado")).toBeTruthy());
  });
});
