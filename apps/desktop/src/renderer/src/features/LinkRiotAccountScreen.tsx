import { useId, useState, type FormEvent } from "react";
import { linkRiotAccount, type RiotAccountSummary } from "../services/api-client";
import { AuthForm, AuthLayout, Button, Field, SignalChip, TextField } from "../ui";

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
  const ids = { name: useId(), tag: useId() };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await linkRiotAccount(token, { gameName, tagLine });
      onLinked(result.riotAccount);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível vincular a conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      splashUrl={splashUrl}
      title="Vincular conta Riot"
      subtitle="Informe seu Riot ID pra o Sparta sincronizar seu histórico real de partidas. A leitura é feita pela API oficial da Riot — nada é escrito no seu cliente."
      skip={
        <button type="button" onClick={onSkip}>
          Vincular depois
        </button>
      }
    >
      <AuthForm onSubmit={handleSubmit}>
        <Field label="Nome de invocador" htmlFor={ids.name}>
          <TextField id={ids.name} required value={gameName} onChange={setGameName} placeholder="Ex.: Zekerus" />
        </Field>
        <Field label="Tag" htmlFor={ids.tag} hint="A parte depois do # no seu Riot ID.">
          <TextField id={ids.tag} required value={tagLine} onChange={setTagLine} placeholder="Ex.: BR1" />
        </Field>

        {error && <SignalChip tone="negative">{error}</SignalChip>}

        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          Vincular conta
        </Button>
      </AuthForm>
    </AuthLayout>
  );
}
