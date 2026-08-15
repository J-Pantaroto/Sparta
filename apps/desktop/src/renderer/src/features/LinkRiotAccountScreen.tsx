import type { AccountOnboardingStatus } from "@sparta/core";
import { useId, useState, type FormEvent } from "react";
import { linkRiotAccount, startRiotRsoLink } from "../services/api-client";
import { AuthForm, AuthLayout, Button, Field, SignalChip, TextField } from "../ui";

interface LinkRiotAccountScreenProps {
  token: string;
  splashUrl: string | null;
  onboarding: AccountOnboardingStatus;
  onRefresh: () => void;
  onLogout: () => void;
}

export function LinkRiotAccountScreen({
  token,
  splashUrl,
  onboarding,
  onRefresh,
  onLogout
}: LinkRiotAccountScreenProps) {
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("BR1");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ids = { name: useId(), tag: useId() };

  async function startOfficialLink() {
    setError(null);
    setLoading(true);
    try {
      const result = await startRiotRsoLink(token);
      await window.sparta.openRiotAuthorization(result.authorizationUrl);
    } catch (linkError) {
      setError(
        linkError instanceof Error ? linkError.message : "Não foi possível iniciar o vínculo."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLocalLink(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await linkRiotAccount(token, { gameName, tagLine });
      onRefresh();
    } catch (linkError) {
      setError(
        linkError instanceof Error ? linkError.message : "Não foi possível vincular a conta."
      );
    } finally {
      setLoading(false);
    }
  }

  const officialBlocked = !onboarding.riot.rsoEnabled && !onboarding.riot.localRiotLinkEnabled;
  return (
    <AuthLayout
      splashUrl={splashUrl}
      progressStep={3}
      title="Vincule sua conta Riot"
      subtitle="O vínculo é obrigatório para que o Sparta acesse somente seus próprios dados pessoais."
      footer={
        <button type="button" className="sp-auth__link" onClick={onLogout}>
          Sair desta conta
        </button>
      }
    >
      <div className="sp-auth__form" aria-live="polite">
        {onboarding.state === "RIOT_LINK_PENDING" && (
          <SignalChip tone="info">
            A autorização Riot está pendente. Conclua no navegador e atualize.
          </SignalChip>
        )}
        {onboarding.state === "RIOT_LINK_REQUIRES_REAUTHENTICATION" && (
          <SignalChip tone="negative">
            O vínculo foi revogado ou precisa de nova autenticação.
          </SignalChip>
        )}
        {officialBlocked && (
          <SignalChip tone="negative">
            A vinculação oficial Riot ainda não está disponível neste ambiente. Nenhuma identidade
            será simulada.
          </SignalChip>
        )}
        {error && <SignalChip tone="negative">{error}</SignalChip>}

        {onboarding.riot.rsoEnabled && (
          <Button
            variant="primary"
            size="lg"
            block
            loading={loading}
            onClick={() => void startOfficialLink()}
          >
            Autorizar com a Riot
          </Button>
        )}
        {(onboarding.riot.rsoEnabled || onboarding.state === "RIOT_LINK_PENDING") && (
          <Button variant="secondary" size="lg" block onClick={onRefresh}>
            Já autorizei — atualizar estado
          </Button>
        )}
      </div>

      {onboarding.riot.localRiotLinkEnabled && (
        <AuthForm onSubmit={handleLocalLink}>
          <SignalChip tone="info">
            Ambiente local controlado: o Riot ID será resolvido pela API, mas não ficará verificado
            por RSO.
          </SignalChip>
          <Field label="Riot ID" htmlFor={ids.name}>
            <TextField
              id={ids.name}
              required
              value={gameName}
              onChange={setGameName}
              placeholder="Ex.: Zekerus"
            />
          </Field>
          <Field label="Tag" htmlFor={ids.tag} hint="A parte depois do # no seu Riot ID.">
            <TextField
              id={ids.tag}
              required
              value={tagLine}
              onChange={setTagLine}
              placeholder="Ex.: BR1"
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={loading}>
            Vincular no ambiente local
          </Button>
        </AuthForm>
      )}
    </AuthLayout>
  );
}
