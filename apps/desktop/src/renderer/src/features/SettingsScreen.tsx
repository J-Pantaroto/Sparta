import { useState } from "react";
import { ChampionSkinPicker } from "./ChampionSkinPicker";
import { fetchSettings, updateSettings } from "./api-client";
import { useAsyncData } from "./use-async-data";

interface SettingsScreenProps {
  ddragonVersion: string;
  sessionToken: string | null;
}

const QUICK_LIMITS = [20, 50, 100];
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;

/**
 * Configuracoes pessoais do app: tema visual (6a) e quantas partidas o
 * Sparta deve analisar (6b). Mudar o limite so tem efeito de verdade no
 * proximo sync (PlayerChampionStats/strengths/weaknesses/recentForm so
 * recalculam no sync) - por isso o PUT ja dispara um sync na hora.
 */
export function SettingsScreen({ ddragonVersion, sessionToken }: SettingsScreenProps) {
  return (
    <>
      <header className="page-header compact">
        <span>Configurações</span>
        <h1>Preferências pessoais</h1>
      </header>
      <ChampionSkinPicker ddragonVersion={ddragonVersion} />
      <AnalysisSettings sessionToken={sessionToken} />
    </>
  );
}

function AnalysisSettings({ sessionToken }: { sessionToken: string | null }) {
  const [pendingLimit, setPendingLimit] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
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
      setSaveStatus("idle");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível salvar.");
      setSaveStatus("error");
    }
  }

  if (!sessionToken) {
    return (
      <section className="panel wide">
        <h2>Análise</h2>
        <p>Faça login para configurar quantas partidas o Sparta deve analisar.</p>
      </section>
    );
  }

  return (
    <section className="panel wide">
      <h2>Análise</h2>
      <p>Quantas das suas últimas partidas o Sparta deve considerar (mínimo {MIN_LIMIT}, máximo {MAX_LIMIT}).</p>
      {settings.status === "loading" && <p>Carregando...</p>}
      <div className="draft-controls">
        {QUICK_LIMITS.map((limit) => (
          <button key={limit} type="button" className={currentLimit === limit ? "active" : ""} onClick={() => void save(limit)}>
            Últimas {limit}
          </button>
        ))}
        <label>
          Personalizado
          <input
            type="number"
            min={MIN_LIMIT}
            max={MAX_LIMIT}
            value={currentLimit}
            onChange={(event) => setPendingLimit(Number(event.target.value))}
            onBlur={(event) => void save(Number(event.target.value))}
          />
        </label>
      </div>
      {saveStatus === "saving" && <p>Salvando e sincronizando...</p>}
      {saveStatus === "error" && <p>{saveError}</p>}
      <p>Aplica na próxima sincronização (já disparada automaticamente ao salvar).</p>
    </section>
  );
}
