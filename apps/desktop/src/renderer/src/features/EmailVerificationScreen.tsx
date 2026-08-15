import { useEffect, useState } from "react";
import { confirmEmailVerification, resendEmailVerification } from "../services/api-client";
import { AuthLayout, Button, SignalChip } from "../ui";

interface EmailVerificationScreenProps {
  splashUrl: string | null;
  email: string;
  initialLocalPreviewToken?: string;
  /**
   * So existe quando o usuario chegou aqui DEPOIS de logar (conta ja tinha
   * senha, so faltava confirmar o email) - nesse caso da pra reconsultar a
   * sessao. Logo apos o cadastro nao ha token ainda, entao o botao de
   * reconsulta some e "Voltar para entrar" e o unico caminho.
   */
  sessionToken?: string | null;
  onConfirmed: () => void;
  onRecheckRequested?: () => Promise<void> | void;
  onReturnToLogin: () => void;
}

export function EmailVerificationScreen({
  splashUrl,
  email,
  initialLocalPreviewToken,
  sessionToken,
  onConfirmed,
  onRecheckRequested,
  onReturnToLogin
}: EmailVerificationScreenProps) {
  const queryToken =
    new globalThis.URLSearchParams(globalThis.location.search).get("token") ?? undefined;
  const [localPreviewToken, setLocalPreviewToken] = useState(initialLocalPreviewToken);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const token = queryToken ?? localPreviewToken;

  async function handleRecheck() {
    if (!onRecheckRequested) return;
    setChecking(true);
    setError(null);
    try {
      await onRecheckRequested();
    } catch (recheckError) {
      setError(
        recheckError instanceof Error ? recheckError.message : "Não foi possível verificar agora."
      );
    } finally {
      setChecking(false);
    }
  }

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
        {sessionToken && onRecheckRequested && (
          <Button
            variant="ghost"
            size="lg"
            block
            loading={checking}
            onClick={() => void handleRecheck()}
          >
            Já confirmei, verificar novamente
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
