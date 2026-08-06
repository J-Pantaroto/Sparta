import { useEffect, useState } from "react";
import { confirmEmailVerification, resendEmailVerification } from "../services/api-client";
import { AuthLayout, Button, SignalChip } from "../ui";

interface EmailVerificationScreenProps {
  splashUrl: string;
  email: string;
  initialLocalPreviewToken?: string;
  onConfirmed: () => void;
  onReturnToLogin: () => void;
}

export function EmailVerificationScreen({
  splashUrl,
  email,
  initialLocalPreviewToken,
  onConfirmed,
  onReturnToLogin
}: EmailVerificationScreenProps) {
  const queryToken =
    new globalThis.URLSearchParams(globalThis.location.search).get("token") ?? undefined;
  const [localPreviewToken, setLocalPreviewToken] = useState(initialLocalPreviewToken);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const token = queryToken ?? localPreviewToken;

  useEffect(() => {
    if (queryToken) void handleConfirmation(queryToken);
  }, []);

  async function handleConfirmation(value = token) {
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      await confirmEmailVerification(value);
      globalThis.history.replaceState({}, "", globalThis.location.pathname);
      onConfirmed();
    } catch (confirmationError) {
      setError(
        confirmationError instanceof Error
          ? confirmationError.message
          : "O link não pôde ser confirmado."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    setError(null);
    try {
      const result = await resendEmailVerification(email);
      setLocalPreviewToken(result.localPreviewToken);
      setMessage(result.message);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Não foi possível reenviar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      splashUrl={splashUrl}
      progressStep={2}
      title="Confirme seu email"
      subtitle={`Enviamos instruções para ${email}. O acesso aos dados pessoais continua bloqueado até a confirmação.`}
      footer={
        <button type="button" className="sp-auth__link" onClick={onReturnToLogin}>
          Voltar para entrar
        </button>
      }
    >
      <div className="sp-auth__form" role="status" aria-live="polite">
        {localPreviewToken && (
          <SignalChip tone="info">
            Ambiente local controlado: este fluxo não equivale a entrega real em produção.
          </SignalChip>
        )}
        {message && <SignalChip tone="info">{message}</SignalChip>}
        {error && <SignalChip tone="negative">{error}</SignalChip>}
        {token && (
          <Button
            variant="primary"
            size="lg"
            block
            loading={loading}
            onClick={() => void handleConfirmation()}
          >
            {localPreviewToken ? "Confirmar neste ambiente local" : "Confirmar email"}
          </Button>
        )}
        <Button
          variant="secondary"
          size="lg"
          block
          loading={loading}
          onClick={() => void handleResend()}
        >
          Reenviar instruções
        </Button>
      </div>
    </AuthLayout>
  );
}
