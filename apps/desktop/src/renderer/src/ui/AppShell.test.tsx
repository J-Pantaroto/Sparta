import { fireEvent, render, screen } from "@testing-library/react";
import { Gauge } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AppShell, PlayerSummary, Sidebar, SidebarGroup, SidebarNavItem, Topbar } from "./AppShell";

describe("shell autenticado v2", () => {
  it("expõe item ativo e tooltip na sidebar compacta", () => {
    render(
      <AppShell
        collapsed
        sidebar={
          <Sidebar collapsed version="0.9.0">
            <SidebarGroup label="Visão geral">
              <SidebarNavItem
                collapsed
                label="Dashboard"
                description="Resumo pessoal"
                icon={<Gauge size={16} />}
                active
                onClick={() => undefined}
              />
            </SidebarGroup>
          </Sidebar>
        }
      >
        Conteúdo
      </AppShell>
    );
    const item = screen.getByRole("button", { name: "Dashboard" });
    expect(item.getAttribute("aria-current")).toBe("page");
    expect(item.getAttribute("title")).toContain("Resumo pessoal");
    expect(document.querySelector(".sp-shell--collapsed")).not.toBeNull();
  });

  it("abre o menu da conta e mantém ações navegáveis por teclado", () => {
    const account = vi.fn();
    const settings = vi.fn();
    const logout = vi.fn();
    render(
      <Topbar
        title="Dashboard"
        context="Resumo"
        accountName="Jogador#BR1"
        apiAvailable
        leagueConnected={false}
        onAccount={account}
        onSettings={settings}
        onLogout={logout}
      />
    );
    const trigger = screen.getByRole("button", { name: /Jogador#BR1/ });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /Conta e segurança/ }));
    expect(account).toHaveBeenCalledOnce();
  });

  it("resume o jogador sem usar arte de skin como identidade", () => {
    render(<PlayerSummary name="Jogador#BR1" meta="Acesso pronto" />);
    expect(screen.getByText("Jogador#BR1")).toBeDefined();
    expect(document.querySelector(".sp-player__art")?.textContent).toBe("J");
    expect(document.querySelector(".sp-player img")).toBeNull();
  });
});
