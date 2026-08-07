import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HashChip } from "./HashChip";

describe("HashChip", () => {
  it("mostra o hash resumido por padrão e revela o valor completo ao clicar", () => {
    render(<HashChip label="config" value="8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90" />);

    expect(screen.getByText("config")).toBeTruthy();
    expect(screen.getByText("8878a6…ce90")).toBeTruthy();
    expect(screen.queryByText("8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90")).toBeNull();

    fireEvent.click(screen.getByText("8878a6…ce90"));

    expect(
      screen.getByText("8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90")
    ).toBeTruthy();
  });

  it("copia o valor completo (não o resumido) ao clicar em copiar", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HashChip value="fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38" />);
    fireEvent.click(screen.getByLabelText("Copiar"));

    expect(writeText).toHaveBeenCalledWith(
      "fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38"
    );
    // Deixa o `.then()` da cópia (setCopied) resolver dentro de act() antes do teardown.
    await screen.findByLabelText("Copiado");
  });

  it("hash curto (id) não é truncado", () => {
    render(<HashChip value="release-1" />);
    expect(screen.getByText("release-1")).toBeTruthy();
  });
});
