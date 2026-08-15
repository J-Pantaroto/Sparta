import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requestPasswordReset: vi.fn() }));

vi.mock("../services/api-client", () => ({
  requestPasswordReset: mocks.requestPasswordReset
}));

import { ForgotPasswordScreen } from "./ForgotPasswordScreen";

describe("ForgotPasswordScreen", () => {
  it("envia o pedido e mostra a resposta neutra, sem revelar se a conta existe", async () => {
    mocks.requestPasswordReset.mockResolvedValue({
      status: "RESET_REQUESTED",
      message: "Se o endereco tiver uma conta com senha, enviaremos instrucoes de redefinicao.",
      nextAllowedAt: new Date().toISOString()
    });
    render(<ForgotPasswordScreen splashUrl="" onReturnToLogin={() => {}} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "player@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));

    await waitFor(() => {
      expect(screen.getByText(/Se o endereco tiver uma conta com senha/)).toBeDefined();
    });
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith("player@example.com");
    // depois de enviado, o formulario de email some - nao ha como reenviar
    // sem voltar, o que evita reenvio acidental em loop
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("mostra o token de preview so em ambiente local controlado", async () => {
    mocks.requestPasswordReset.mockResolvedValue({
      status: "RESET_REQUESTED",
      message: "mensagem neutra",
      nextAllowedAt: new Date().toISOString(),
      localPreviewToken: "token-de-teste-local",
      localPreviewOnly: true
    });
    render(<ForgotPasswordScreen splashUrl="" onReturnToLogin={() => {}} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "player@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));

    await waitFor(() => {
      expect(screen.getByText(/Ambiente local controlado/)).toBeDefined();
    });
    expect(screen.getByText(/token-de-teste-local/)).toBeDefined();
  });

  it("erro de rede aparece como mensagem, sem fingir sucesso", async () => {
    mocks.requestPasswordReset.mockRejectedValue(new Error("Falha na requisicao."));
    render(<ForgotPasswordScreen splashUrl="" onReturnToLogin={() => {}} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "player@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));

    await waitFor(() => {
      expect(screen.getByText("Falha na requisicao.")).toBeDefined();
    });
    // o formulario continua visivel - a falha nao empurra pro estado "enviado"
    expect(screen.getByLabelText("Email")).toBeDefined();
  });

  it("botao 'Voltar para entrar' aciona o callback", () => {
    const onReturnToLogin = vi.fn();
    render(<ForgotPasswordScreen splashUrl="" onReturnToLogin={onReturnToLogin} />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar para entrar" }));
    expect(onReturnToLogin).toHaveBeenCalled();
  });
});
