import { useEffect, useState } from "react";
import { Check, Volume2 } from "lucide-react";
import type {
  CoachingCategory,
  CoachingRuntimeState,
  CoachingSettings,
  VoiceDescriptor
} from "@sparta/core";
import { Badge, Button, Card, EmptyState, Field, SectionHeader, Select, SignalChip } from "../ui";

const CATEGORY_LABELS: Record<CoachingCategory, string> = {
  VISION: "Visão",
  EARLY_SAFETY: "Segurança inicial",
  SURVIVABILITY: "Sobrevivência",
  FARM_RESOURCES: "Farm e recursos"
};

const STATUS_LABELS: Record<CoachingRuntimeState["modelStatus"], string> = {
  DISABLED: "Desligado",
  CHECKING: "Verificando modelo local",
  AVAILABLE: "Modelo local disponível",
  AI_UNAVAILABLE: "IA local indisponível"
};

export function LocalCoachSettings() {
  const [runtime, setRuntime] = useState<CoachingRuntimeState | null>(null);
  const [voices, setVoices] = useState<VoiceDescriptor[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.sparta.localCoach.getState().then((value) => active && setRuntime(value));
    void window.sparta.localCoach.listVoices().then((value) => active && setVoices(value));
    const unsubscribe = window.sparta.localCoach.onState((value) => setRuntime(value));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function save(next: CoachingSettings) {
    setMessage(null);
    const accepted = await window.sparta.localCoach.updateSettings(next);
    setMessage(accepted ? "Preferências locais salvas." : "Configuração recusada pelo gate local.");
  }

  if (!runtime)
    return (
      <Card>
        <EmptyState title="Carregando o coach local" />
      </Card>
    );

  const settings = runtime.settings;
  return (
    <Card>
      <SectionHeader
        eyebrow="Protótipo local"
        title="Coach de voz contextual"
        description="Desligado por padrão. Processa apenas fatos do próprio jogador, com modelo e voz locais; não usa nuvem."
        actions={
          <Badge tone={runtime.modelStatus === "AVAILABLE" ? "positive" : "neutral"}>
            {STATUS_LABELS[runtime.modelStatus]}
          </Badge>
        }
      />

      {!runtime.prototypeEnabled && (
        <SignalChip tone="info">
          Protótipo fechado. Em desenvolvimento, ative explicitamente SPARTA_LIVE_CLIENT_PROTOTYPE=1
          e SPARTA_LOCAL_AI_COACH=1.
        </SignalChip>
      )}

      <div style={{ display: "grid", gap: "var(--space-5)", marginTop: "var(--space-5)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={!runtime.prototypeEnabled}
            onChange={(event) => void save({ ...settings, enabled: event.target.checked })}
          />
          Ativar coach local nesta máquina
        </label>

        <div>
          <strong>Categorias</strong>
          <div
            style={{
              display: "flex",
              gap: "var(--space-4)",
              flexWrap: "wrap",
              marginTop: "var(--space-3)"
            }}
          >
            {(Object.keys(CATEGORY_LABELS) as CoachingCategory[]).map((category) => (
              <label
                key={category}
                style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={settings.categories[category]}
                  onChange={(event) =>
                    void save({
                      ...settings,
                      categories: { ...settings.categories, [category]: event.target.checked }
                    })
                  }
                />
                {CATEGORY_LABELS[category]}
              </label>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "var(--space-4)"
          }}
        >
          <Field label={`Volume: ${settings.volume}%`}>
            <input
              aria-label="Volume da voz"
              type="range"
              min={0}
              max={100}
              value={settings.volume}
              onChange={(event) => void save({ ...settings, volume: Number(event.target.value) })}
            />
          </Field>
          <Field label={`Velocidade: ${settings.rate}`}>
            <input
              aria-label="Velocidade da voz"
              type="range"
              min={-5}
              max={5}
              value={settings.rate}
              onChange={(event) => void save({ ...settings, rate: Number(event.target.value) })}
            />
          </Field>
          <Field label="Detalhe">
            <Select
              ariaLabel="Nível de detalhe do coach"
              value={settings.verbosity}
              onChange={(verbosity) => void save({ ...settings, verbosity })}
              options={[
                { value: "BRIEF", label: "Breve" },
                { value: "NORMAL", label: "Normal" }
              ]}
            />
          </Field>
          <Field label="Voz offline">
            <Select
              ariaLabel="Voz offline"
              value={settings.voiceId ?? ""}
              onChange={(voiceId) => void save({ ...settings, voiceId: voiceId || null })}
              options={[
                { value: "", label: "Padrão do Windows" },
                ...voices.map((voice) => ({
                  value: voice.id,
                  label: `${voice.name} (${voice.language})`
                }))
              ]}
            />
          </Field>
        </div>

        <div
          style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}
        >
          <Button
            icon={<Volume2 size={15} />}
            disabled={!runtime.prototypeEnabled || voices.length === 0}
            onClick={() =>
              void window.sparta.localCoach
                .testVoice()
                .then((ok) =>
                  setMessage(ok ? "Teste de voz concluído." : "Voz local indisponível.")
                )
            }
          >
            Testar voz
          </Button>
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
            Modelo: {runtime.modelName ?? "não configurado"} · provedor {runtime.modelProvider}
          </span>
        </div>
        {message && (
          <SignalChip
            tone={message.includes("salvas") || message.includes("concluído") ? "positive" : "info"}
          >
            <Check size={12} /> {message}
          </SignalChip>
        )}
      </div>
    </Card>
  );
}
