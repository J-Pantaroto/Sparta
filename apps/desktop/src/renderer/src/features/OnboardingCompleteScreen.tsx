import { AuthLayout, Button, SignalChip } from "../ui";

export function OnboardingCompleteScreen({
  splashUrl,
  riotId,
  localControlledMode,
  onContinue
}: {
  splashUrl: string;
  riotId?: string;
  localControlledMode: boolean;
  onContinue: () => void;
}) {
  return (
    <AuthLayout
      splashUrl={splashUrl}
      progressStep={4}
      title="Acesso pronto"
      subtitle="Sua conta concluiu as etapas exigidas neste ambiente."
    >
      <div className="sp-auth__form">
        <SignalChip tone="positive">
          {riotId ? `${riotId} vinculado` : "Vínculo Riot confirmado"}
        </SignalChip>
        {localControlledMode && (
          <SignalChip tone="info">
            Ambiente local controlado: o vínculo não possui verificação oficial RSO.
          </SignalChip>
        )}
        <Button variant="primary" size="lg" block onClick={onContinue}>
          Abrir o Sparta
        </Button>
      </div>
    </AuthLayout>
  );
}
