import type { AccountOnboardingStatus } from "@sparta/core";
import { useId, useState, type FormEvent } from "react";
import type { SessionUser } from "../services/api-client";
import { changeAccountEmail, revokeRiotLink } from "../services/api-client";
import {
  Button,
  Card,
  Field,
  Grid,
  PageHero,
  PageLayout,
  SectionHeader,
  SignalChip,
  TextField
} from "../ui";
import "./AccountScreen.css";

export function AccountScreen({
  token,
  user,
  onboarding,
  onSessionRotated,
  onOnboardingChanged,
  onLogout
}: {
  token: string;
  user: SessionUser;
  onboarding: AccountOnboardingStatus;
  onSessionRotated: (token: string, email: string, localPreviewToken?: string) => void;
  onOnboardingChanged: () => void;
  onLogout: () => void;
}) {
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ids = { email: useId(), password: useId() };

  async function changeEmail(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await changeAccountEmail(token, { email, currentPassword: password });
      setMessage(
        "Email alterado. A nova confirmação é obrigatória e as sessões anteriores foram revogadas."
      );
      onSessionRotated(result.token, result.user.email ?? email, result.localPreviewToken);
    } catch (changeError) {
      setError(
        changeError instanceof Error ? changeError.message : "Não foi possível alterar o email."
      );
    } finally {
      setLoading(false);
    }
  }

  async function revoke() {
    setLoading(true);
    setError(null);
    try {
      await revokeRiotLink(token);
      onOnboardingChanged();
    } catch (revokeError) {
      setError(
        revokeError instanceof Error ? revokeError.message : "Não foi possível revogar o vínculo."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout>
      <PageHero
        eyebrow="Conta"
        title={user.displayName ?? "Sua conta Sparta"}
        subtitle="Identidade, acesso e sessões. Este não é um perfil analítico."
      />
      <Grid cols={2}>
        <Card>
          <SectionHeader
            title="Estado do acesso"
            description="Calculado pelo backend a partir dos fatos persistidos."
          />
          <dl className="sp-account-details">
            <div className="sp-account-details__row">
              <dt className="sp-account-details__term">Email</dt>
              <dd className="sp-account-details__value">{onboarding.email.masked}</dd>
            </div>
            <div className="sp-account-details__row">
              <dt className="sp-account-details__term">Confirmação</dt>
              <dd className="sp-account-details__value">
                {onboarding.email.verified ? "Confirmado" : "Pendente"}
              </dd>
            </div>
            <div className="sp-account-details__row">
              <dt className="sp-account-details__term">Riot</dt>
              <dd className="sp-account-details__value">
                {onboarding.riot.riotId ?? "Não vinculada"}
              </dd>
            </div>
            <div className="sp-account-details__row">
              <dt className="sp-account-details__term">Onboarding</dt>
              <dd className="sp-account-details__value">{onboarding.state}</dd>
            </div>
            <div className="sp-account-details__row">
              <dt className="sp-account-details__term">Sessão</dt>
              <dd className="sp-account-details__value">Protegida pelo sistema operacional</dd>
            </div>
          </dl>
          <div className="sp-account-actions">
            {onboarding.riot.linked && (
              <Button variant="danger" loading={loading} onClick={() => void revoke()}>
                Revogar vínculo Riot
              </Button>
            )}
            <Button variant="secondary" onClick={onLogout}>
              Sair e revogar sessões
            </Button>
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Alterar email"
            description="Exige sua senha atual e reinicia a confirmação do endereço."
          />
          <form className="sp-account-form" onSubmit={changeEmail}>
            <Field label="Novo email" htmlFor={ids.email}>
              <TextField
                id={ids.email}
                type="email"
                required
                value={email}
                onChange={setEmail}
                autoComplete="email"
              />
            </Field>
            <Field label="Senha atual" htmlFor={ids.password}>
              <TextField
                id={ids.password}
                type="password"
                required
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
            </Field>
            {message && <SignalChip tone="info">{message}</SignalChip>}
            {error && <SignalChip tone="negative">{error}</SignalChip>}
            <Button type="submit" variant="primary" loading={loading}>
              Alterar e confirmar novamente
            </Button>
          </form>
        </Card>
      </Grid>

      <Card tone="flat">
        <SectionHeader
          title="Exclusão da conta"
          description="A exclusão permanente ainda não possui fluxo operacional nesta etapa. Nenhuma exclusão será simulada."
          actions={
            <Button variant="danger" disabled>
              Excluir conta
            </Button>
          }
        />
      </Card>
    </PageLayout>
  );
}
