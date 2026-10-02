import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_COACHING_SETTINGS } from "@sparta/core";

vi.mock("../theme/accent-color", () => ({ extractAccentPalette: vi.fn().mockResolvedValue(null) }));

import { FeaturedChampionProvider } from "../theme/featured-champion-context";
import { SettingsScreen } from "./SettingsScreen";

/**
 * Etapa 31L.1, seção 8: "Configurações/Sobre abre via teclado". A aba
 * "Sobre" reusa o componente genérico `Tabs` (botão `role="tab"` nativo,
 * já usado em toda a tela) - o mesmo padrão de teste de teclado já
 * estabelecido em `ui/AppShell.test.tsx` (focus + keyDown Enter + click,
 * já que jsdom não traduz Enter em click automaticamente pra botões
 * nativos como um navegador real faria).
 */
beforeAll(() => {
  (window as unknown as { sparta: unknown }).sparta = {
    version: "0.9.0",
    localCoach: {
      getState: vi.fn().mockResolvedValue({
        prototypeEnabled: true,
        publicRelease: false,
        settings: DEFAULT_COACHING_SETTINGS,
        modelStatus: "AI_UNAVAILABLE",
        modelProvider: "ollama-loopback",
        modelName: null,
        queueState: "IDLE",
        activeSessionId: null,
        lastEvent: null,
        metrics: {
          inferenceCount: 0,
          inferenceP50Ms: null,
          inferenceP95Ms: null,
          timeouts: 0,
          rejected: 0,
          silence: 0,
          spoken: 0,
          expired: 0,
          dropped: 0
        }
      }),
      onState: vi.fn().mockReturnValue(() => undefined),
      listVoices: vi.fn().mockResolvedValue([{ id: "Maria", name: "Maria", language: "pt-BR" }]),
      updateSettings: vi.fn().mockResolvedValue(true),
      testVoice: vi.fn().mockResolvedValue(true),
      setPersonalContext: vi.fn().mockResolvedValue(true),
      getDiagnostics: vi.fn().mockResolvedValue([])
    }
  };
});

describe("SettingsScreen - coach local", () => {
  it("explicita indisponibilidade da IA sem esconder configuracao e teste de voz", async () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: /Coach local/ }));
    expect(await screen.findByText("IA local indisponível")).toBeDefined();
    expect(screen.getByRole("button", { name: "Testar voz" })).toBeDefined();
    expect(screen.getByText(/Desligado por padrão/)).toBeDefined();
  });

  it("salva opt-in local pelo bridge estreito", async () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: /Coach local/ }));
    const toggle = await screen.findByRole("checkbox", { name: /Ativar coach local/ });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(window.sparta.localCoach.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      )
    );
  });
});

function renderSettings() {
  return render(
    <FeaturedChampionProvider>
      <SettingsScreen ddragonVersion="16.14.1" sessionToken={null} />
    </FeaturedChampionProvider>
  );
}

describe("SettingsScreen - aba Sobre", () => {
  it("a aba Sobre é alcançável e ativável por teclado", () => {
    renderSettings();

    const aboutTab = screen.getByRole("tab", { name: /Sobre/ });
    aboutTab.focus();
    expect(document.activeElement).toBe(aboutTab);

    fireEvent.keyDown(aboutTab, { key: "Enter" });
    fireEvent.click(aboutTab);

    expect(aboutTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByText(/Legal Jibber Jabber/).length).toBeGreaterThan(0);
  });

  it("os avisos legais da Riot ficam visíveis assim que a aba Sobre é aberta, sem chamada de rede", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: /Sobre/ }));

    expect(screen.getByText(/não endossa nem patrocina este projeto/)).toBeDefined();
    expect(screen.getByText("Política de desenvolvedor — League of Legends")).toBeDefined();
  });
});
