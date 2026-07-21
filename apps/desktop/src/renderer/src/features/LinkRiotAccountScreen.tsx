import { useState, type FormEvent } from "react";
import { linkRiotAccount, type RiotAccountSummary } from "./api-client";

interface LinkRiotAccountScreenProps {
  token: string;
  splashUrl: string;
  onLinked: (account: RiotAccountSummary) => void;
  onSkip: () => void;
}

export function LinkRiotAccountScreen({ token, splashUrl, onLinked, onSkip }: LinkRiotAccountScreenProps) {
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("BR1");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await linkRiotAccount(token, { gameName, tagLine });
      onLinked(result.riotAccount);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Nao foi possivel vincular a conta.");
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

        <h1 className="auth-title">Vincular conta Riot</h1>
        <p className="auth-subtitle">Informe seu Riot ID para conectar seu perfil de League of Legends.</p>

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="gameName">Nome de invocador</label>
            <input
              id="gameName"
              required
              value={gameName}
              onChange={(event) => setGameName(event.target.value)}
              placeholder="Ex.: Sparta"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="tagLine">Tag</label>
            <input
              id="tagLine"
              required
              value={tagLine}
              onChange={(event) => setTagLine(event.target.value)}
              placeholder="Ex.: BR1"
            />
          </div>

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Vinculando..." : "Vincular conta"}
          </button>
        </form>

        <div className="auth-skip">
          <button type="button" onClick={onSkip}>
            Vincular depois
          </button>
        </div>
      </div>
    </div>
  );
}
