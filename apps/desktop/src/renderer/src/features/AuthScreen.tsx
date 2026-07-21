import { useState, type FormEvent } from "react";
import { login, register } from "./api-client";

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
      setError(submitError instanceof Error ? submitError.message : "Nao foi possivel conectar a API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell" style={{ backgroundImage: `url(${splashUrl})` }}>
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>Sparta</strong>
            <span>Draft intelligence</span>
          </div>
        </div>

        <h1 className="auth-title">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
        <p className="auth-subtitle">
          {mode === "login" ? "Acesse sua conta para continuar." : "Crie sua conta para vincular seu perfil Riot."}
        </p>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <div className="auth-field">
              <label htmlFor="displayName">Nome de exibicao</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Como devemos te chamar"
              />
            </div>
          )}
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@email.com"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimo de 8 caracteres"
            />
          </div>

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <p className="auth-switch">
          {mode === "login" ? (
            <>
              Ainda nao tem conta?{" "}
              <button type="button" onClick={() => setMode("register")}>
                Criar conta
              </button>
            </>
          ) : (
            <>
              Ja tem conta?{" "}
              <button type="button" onClick={() => setMode("login")}>
                Entrar
              </button>
            </>
          )}
        </p>

        <div className="auth-skip">
          <button type="button" onClick={onSkip}>
            Continuar sem conta (modo local)
          </button>
        </div>
      </div>
    </div>
  );
}
