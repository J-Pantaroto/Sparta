import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { AboutSection } from "./AboutSection";

/**
 * `AboutSection` le `window.sparta.version` de forma sincrona (mesmo padrao
 * ja usado por `App.tsx`) - em produção o preload real sempre expõe isso
 * antes do renderer montar, mas em jsdom precisa de um stub mínimo.
 */
beforeAll(() => {
  (window as unknown as { sparta: { version: string } }).sparta = { version: "0.9.0" };
});

describe("AboutSection", () => {
  it("exibe os dois avisos legais da Riot Games, verbatim, sem paráfrase", () => {
    render(<AboutSection />);

    expect(
      screen.getByText(
        'Sparta GG was created under Riot Games\' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.'
      )
    ).toBeDefined();

    expect(
      screen.getByText(
        "Sparta GG is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc."
      )
    ).toBeDefined();
  });

  it("os dois avisos coexistem e nenhum substitui o outro", () => {
    render(<AboutSection />);
    // "Legal Jibber Jabber" aparece 2x de propósito (rótulo da seção +
    // dentro do próprio texto oficial em inglês) - o que importa é que as
    // DUAS políticas estão presentes ao mesmo tempo, não uma no lugar da
    // outra.
    expect(screen.getAllByText(/Legal Jibber Jabber/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Política de desenvolvedor — League of Legends")).toBeDefined();
  });

  it("mostra o disclaimer sem depender de rede - texto vem embutido no bundle", () => {
    // AboutSection não faz fetch nem usa useAsyncData; se este teste passa
    // sem nenhum mock de rede/API, o texto está disponível offline.
    render(<AboutSection />);
    expect(screen.getByText(/não endossa nem patrocina este projeto/)).toBeDefined();
  });

  it("não contém nenhum link para localhost ou apontando pro GitHub como site", () => {
    const { container } = render(<AboutSection />);
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toContain("localhost");
    expect(html).not.toContain("github.com");
  });

  it("os links institucionais são botões desabilitados, não âncoras funcionais", () => {
    render(<AboutSection />);
    const siteButton = screen.getByRole("button", { name: /Site institucional/ });
    expect(siteButton.tagName).toBe("BUTTON");
    expect(siteButton).toHaveProperty("disabled", true);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("toda menção a 'oficial'/'aprovado'/'parceiro' da Riot é uma negação, nunca uma afirmação", () => {
    const { container } = render(<AboutSection />);
    const text = container.textContent ?? "";
    // As únicas ocorrências de "produto oficial"/"aprovado"/"parceiro da
    // Riot" no componente são dentro desta negação explícita - se o texto
    // mudar pra afirmar o contrário, a string exata deixa de bater e o
    // teste falha.
    expect(text).toContain(
      "nenhum elemento de design sugere se tratar de produto oficial, aprovado ou parceiro da Riot Games"
    );
    expect(text).not.toMatch(/em parceria com a Riot/i);
    expect(text).not.toMatch(/supported by Riot/i);
    expect(text).not.toMatch(/Riot approved/i);
  });

  it("exibe a versão do app a partir do bridge exposto pelo preload", () => {
    render(<AboutSection />);
    expect(screen.getByText("v0.9.0")).toBeDefined();
  });
});
