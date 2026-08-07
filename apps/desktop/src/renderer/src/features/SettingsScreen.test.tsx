import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

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
  (window as unknown as { sparta: { version: string } }).sparta = { version: "0.9.0" };
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
