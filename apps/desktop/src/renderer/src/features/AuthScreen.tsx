import { useId, useState, type FormEvent } from "react";
import { login, register } from "../services/api-client";
import { AuthForm, AuthLayout, Button, Field, SignalChip, TextField } from "../ui";

interface AuthScreenProps {
  splashUrl: string;
  onAuthenticated: (token: string) => void;
  onSkip: () => void;
}

type Mode = "login" | "register";

export function AuthScreen({ splashUrl, onAuthenticated, onSkip }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ids = { name: useId(), email: useId(), password: useId() };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result =
        mode === "login"
          ? await login({ email, password })
          : await register({ email, password, displayName: displayName || undefined });
      onAuthenticated(result.token);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível conectar à API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      splashUrl={splashUrl}
      title={mode === "login" ? "Entrar" : "Criar conta"}
      subtitle={
        mode === "login"
          ? "Acesse sua conta pra continuar."
          : "Crie sua conta pra vincular seu perfil da Riot."
      }
      footer={
        mode === "login" ? (
          <>
            Ainda não tem conta?{" "}
            <button type="button" className="sp-auth__link" onClick={() => setMode("register")}>
              Criar conta
            </button>
          </>
        ) : (
          <>
            Já tem conta?{" "}
            <button type="button" className="sp-auth__link" onClick={() => setMode("login")}>
              Entrar
            </button>
          </>
        )
      }
      skip={
        <button type="button" onClick={onSkip}>
          Continuar sem conta (modo local)
        </button>
      }
    >
      <AuthForm onSubmit={handleSubmit}>
        {mode === "register" && (
          <Field label="Nome de exibição" htmlFor={ids.name}>
            <TextField
              id={ids.name}
              value={displayName}
              onChange={setDisplayName}
              placeholder="Como devemos te chamar"
              autoComplete="nickname"
            />
          </Field>
        )}
        <Field label="Email" htmlFor={ids.email}>
          <TextField
            id={ids.email}
            type="email"
            required
            value={email}
            onChange={setEmail}
            placeholder="voce@email.com"
            autoComplete="email"
          />
        </Field>
        <Field label="Senha" htmlFor={ids.password} hint={mode === "register" ? "Mínimo de 8 caracteres." : undefined}>
          <TextField
            id={ids.password}
            type="password"
            required
            minLength={8}
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </Field>

        {error && <SignalChip tone="negative">{error}</SignalChip>}

        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          {mode === "login" ? "Entrar" : "Criar conta"}
        </Button>
      </AuthForm>
    </AuthLayout>
  );
}
