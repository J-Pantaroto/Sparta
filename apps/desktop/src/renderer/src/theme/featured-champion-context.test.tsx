import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./accent-color", () => ({ extractAccentPalette: vi.fn().mockResolvedValue(null) }));

import { FeaturedChampionProvider, useFeaturedChampion } from "./featured-champion-context";

function Probe() {
  const preferences = useFeaturedChampion();
  return (
    <div>
      <span>{preferences.visualTheme}</span>
      <span>{preferences.density}</span>
      <span>{preferences.visualIntensity}</span>
      <button type="button" onClick={() => preferences.setVisualTheme("obsidian")}>
        Tema
      </button>
      <button type="button" onClick={() => preferences.setDensity("compact")}>
        Densidade
      </button>
      <button type="button" onClick={() => preferences.setVisualIntensity("reduced")}>
        Reduzir
      </button>
    </div>
  );
}

function IdentityProbe() {
  const preferences = useFeaturedChampion();
  return (
    <div>
      <span>{preferences.hasFeaturedChampion ? "Com campeão" : "Sparta"}</span>
      <span>{preferences.splashUrl ?? "Sem splash"}</span>
    </div>
  );
}

describe("preferências visuais v2", () => {
  beforeEach(() => localStorage.clear());

  it("aplica tema, densidade e redução visual como preferências locais", () => {
    render(
      <FeaturedChampionProvider>
        <Probe />
      </FeaturedChampionProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Tema" }));
    fireEvent.click(screen.getByRole("button", { name: "Densidade" }));
    fireEvent.click(screen.getByRole("button", { name: "Reduzir" }));

    expect(document.documentElement.dataset.spartaTheme).toBe("obsidian");
    expect(document.documentElement.dataset.density).toBe("compact");
    expect(document.documentElement.dataset.visualIntensity).toBe("reduced");
    expect(localStorage.getItem("sparta:visual-preferences-v2")).toContain("obsidian");
  });

  it("não altera tokens semânticos por código runtime ao trocar tema", () => {
    render(
      <FeaturedChampionProvider>
        <Probe />
      </FeaturedChampionProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Tema" }));
    const inline = document.documentElement.getAttribute("style") ?? "";
    expect(inline).not.toMatch(/--color-green|--color-red|--color-yellow/);
  });

  it("começa no estado neutro Sparta sem escolher Ahri implicitamente", () => {
    render(
      <FeaturedChampionProvider>
        <IdentityProbe />
      </FeaturedChampionProvider>
    );

    expect(screen.getByText("Sparta")).toBeDefined();
    expect(screen.getByText("Sem splash")).toBeDefined();
    expect(localStorage.getItem("sparta:featured-champion")).toBeNull();
  });
});
