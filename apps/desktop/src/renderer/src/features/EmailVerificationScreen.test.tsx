import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmEmailVerification: vi.fn(),
  resendEmailVerification: vi.fn()
}));

vi.mock("../services/api-client", () => ({
  confirmEmailVerification: mocks.confirmEmailVerification,
  resendEmailVerification: mocks.resendEmailVerification
}));

import { EmailVerificationScreen } from "./EmailVerificationScreen";

describe("EmailVerificationScreen", () => {
  it("sem sessionToken (logo apos o cadastro), nao mostra o botao de reconsulta", () => {
    render(
      <EmailVerificationScreen
        splashUrl=""
        email="player@example.com"
        onConfirmed={() => {}}
        onReturnToLogin={() => {}}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Já confirmei, verificar novamente" })
    ).toBeNull();
  });

  it("com sessionToken, o botao de reconsulta chama onRecheckRequested e propaga erro sem travar a tela", async () => {
    const onRecheckRequested = vi.fn().mockRejectedValue(new Error("ainda nao confirmado"));
    render(
      <EmailVerificationScreen
        splashUrl=""
        email="player@example.com"
        sessionToken="token-abc"
        onRecheckRequested={onRecheckRequested}
        onConfirmed={() => {}}
        onReturnToLogin={() => {}}
      />
    );

    const button = screen.getByRole("button", { name: "Já confirmei, verificar novamente" });
    fireEvent.click(button);

    await waitFor(() => expect(onRecheckRequested).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByText("ainda nao confirmado")).toBeDefined();
    });
  });

  it("reenvio mostra a mensagem neutra do servidor, sem afirmar entrega quando o provider falhou", async () => {
    mocks.resendEmailVerification.mockResolvedValue({
      status: "VERIFICATION_REQUIRED",
      message: "Se o endereco puder ser usado, enviaremos instrucoes de confirmacao.",
      nextAllowedAt: new Date().toISOString()
    });
    render(
      <EmailVerificationScreen
        splashUrl=""
        email="player@example.com"
        onConfirmed={() => {}}
        onReturnToLogin={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reenviar instruções" }));

    await waitFor(() => {
      expect(screen.getByText(/Se o endereco puder ser usado/)).toBeDefined();
    });
    expect(mocks.resendEmailVerification).toHaveBeenCalledWith("player@example.com");
  });
});
