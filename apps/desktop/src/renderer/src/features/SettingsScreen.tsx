import { Check, Palette, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchSettings, updateSettings } from "../services/api-client";
import { ThemeGallery } from "../theme/ThemeGallery";
import { ThemedPageHero } from "../theme/ThemedPageHero";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Loading,
  NumberField,
  PageLayout,
  SectionHeader,
  SegmentedControl,
  SignalChip,
  Tabs
} from "../ui";

const QUICK_LIMITS = [20, 50, 100];
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;

type Section = "theme" | "analysis";

export function SettingsScreen({
  ddragonVersion,
  sessionToken
}: {
  ddragonVersion: string;
  sessionToken: string | null;
}) {
  const [section, setSection] = useState<Section>("theme");

  return (
    <PageLayout>
      <ThemedPageHero eyebrow="Configurações" title="Preferências do aplicativo" />

      <Tabs<Section>
        ariaLabel="Seções das configurações"
        value={section}
        onChange={setSection}
        options={[
          {
            value: "theme",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
                <Palette size={14} /> Tema
              </span>
            )
          },
          {
            value: "analysis",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
                <SlidersHorizontal size={14} /> Análise
              </span>
            )
          }
        ]}
      />

      {section === "theme" ? (
        <ThemeGallery ddragonVersion={ddragonVersion} />
      ) : (
        <AnalysisSettings sessionToken={sessionToken} />
      )}
    </PageLayout>
  );
}

/**
 * Quantas das últimas partidas o Sparta considera nas análises. Mudar o
 * valor só tem efeito no próximo sync (as estatísticas agregadas e os
 * pontos fortes/fracos só recalculam lá), por isso o PUT já dispara um.
 */
function AnalysisSettings({ sessionToken }: { sessionToken: string | null }) {
  const [pendingLimit, setPendingLimit] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const settings = useAsyncData<{ matchAnalysisLimit: number }>(
    () => (sessionToken ? fetchSettings(sessionToken) : undefined),
    [sessionToken]
  );

  const currentLimit = pendingLimit ?? settings.data?.matchAnalysisLimit ?? 50;

  async function save(limit: number) {
    if (!sessionToken) return;
    const clamped = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, limit));
    setPendingLimit(clamped);
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await updateSettings(sessionToken, clamped);
      setSaveStatus("saved");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível salvar.");
      setSaveStatus("error");
    }
  }

  if (!sessionToken) {
    return (
      <Card>
        <EmptyState
          title="Faça login pra configurar a análise"
          description="Esta preferência fica na sua conta, não na máquina — por isso precisa de sessão."
        />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Profundidade da análise"
        description={`Quantas das suas últimas partidas o Sparta considera ao calcular desempenho, pontos fortes e fracos (de ${MIN_LIMIT} a ${MAX_LIMIT}).`}
        actions={
          saveStatus === "saved" ? (
            <Badge tone="positive" icon={<Check size={11} />}>
              Salvo
            </Badge>
          ) : saveStatus === "saving" ? (
            <Badge tone="neutral">Salvando...</Badge>
          ) : undefined
        }
      />

      {settings.status === "loading" && <Loading />}

      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-5)", flexWrap: "wrap" }}>
        <SegmentedControl<string>
          ariaLabel="Quantidade de partidas analisadas"
          value={QUICK_LIMITS.includes(currentLimit) ? String(currentLimit) : "custom"}
          onChange={(value) => {
            if (value !== "custom") void save(Number(value));
          }}
          options={[
            ...QUICK_LIMITS.map((limit) => ({ value: String(limit), label: `Últimas ${limit}` })),
            { value: "custom", label: "Personalizado", disabled: QUICK_LIMITS.includes(currentLimit) }
          ]}
        />
        <div style={{ width: 130 }}>
          <Field label="Valor exato">
            <NumberField
              value={currentLimit}
              min={MIN_LIMIT}
              max={MAX_LIMIT}
              onChange={setPendingLimit}
              onCommit={(value) => void save(value)}
              ariaLabel="Quantidade personalizada de partidas"
            />
          </Field>
        </div>
      </div>

      <div style={{ marginTop: "var(--space-5)" }}>
        <SignalChip tone={saveStatus === "error" ? "negative" : "info"}>
          {saveStatus === "error"
            ? saveError
            : "O novo limite vale a partir da próxima sincronização — que já é disparada automaticamente ao salvar."}
        </SignalChip>
      </div>
    </Card>
  );
}
