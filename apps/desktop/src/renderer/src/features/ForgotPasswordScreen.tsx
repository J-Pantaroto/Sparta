import { useId, useState, type FormEvent } from "react";
import { requestPasswordReset } from "../services/api-client";
import { AuthForm, AuthLayout, Button, Field, SignalChip, TextField } from "../ui";

interface ForgotPasswordScreenProps {
  splashUrl: string;
  onReturnToLogin: () => void;
}

/**
 * So o PEDIDO de redefinicao. A resposta e sempre a mesma frase neutra,
 * exista ou nao a conta - o backend garante isso (ver docs/password-
 * recovery.md); esta tela so precisa nao inventar nada em cima disso.
 */
export function ForgotPasswordScreen({ splashUrl, onReturnToLogin }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [localPreviewToken, setLocalPreviewToken] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const emailId = useId();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      setMessage(result.message);
      setLocalPreviewToken(result.localPreviewToken);
      setSent(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Não foi possível conectar à API."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      splashUrl={splashUrl}
      title="Esqueci minha senha"
      subtitle={
        sent
          ? "Se o endereço tiver uma conta com senha, enviamos instruções de redefinição."
          : "Informe o email da sua conta Sparta GG. Enviaremos um link para definir uma nova senha."
      }
      footer={
        <button type="button" className="sp-auth__link" onClick={onReturnToLogin}>
          Voltar para entrar
        </button>
      }
    >
      {sent ? (
        <div className="sp-auth__form" role="status" aria-live="polite">
          {localPreviewToken && (
            <SignalChip tone="info">
              Ambiente local controlado: este fluxo não equivale a entrega real em produção. Token
              de teste: {localPreviewToken}
            </SignalChip>
          )}
          {message && <SignalChip tone="info">{message}</SignalChip>}
          <p className="sp-auth__hint">
            Verifique sua caixa de entrada e siga o link enviado. Ele abre uma página no navegador
            para você definir a nova senha — depois disso, volte aqui e entre normalmente.
          </p>
        </div>
      ) : (
        <AuthForm onSubmit={handleSubmit}>
          <Field label="Email" htmlFor={emailId}>
            <TextField
              id={emailId}
              type="email"
              required
              value={email}
              onChange={setEmail}
              placeholder="voce@email.com"
              autoComplete="email"
            />
          </Field>
          {error && <SignalChip tone="negative">{error}</SignalChip>}
          <Button type="submit" variant="primary" size="lg" block loading={loading}>
            Enviar instruções
          </Button>
        </AuthForm>
      )}
    </AuthLayout>
  );
}
