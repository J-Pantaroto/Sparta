import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthLayout } from "./AuthLayout";

describe("AuthLayout - identidade neutra", () => {
  it("usa a marca Sparta sem campeão e preserva o foco programático do título", () => {
    render(
      <AuthLayout splashUrl={null} title="Entrar">
        <button type="button">Continuar</button>
      </AuthLayout>
    );

    const title = screen.getByRole("heading", { name: "Entrar" });
    expect(document.activeElement).toBe(title);
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(document.querySelector(".sp-auth > .sp-identity")).not.toBeNull();
    expect(document.querySelector(".sp-auth__mark img")).not.toBeNull();
  });
});
