import { useState } from "react";
import {
  fetchReplayBundleSummary,
  verifySnapshotReplay,
  type ReplayBundleSummary,
  type ReplayVerificationResponse
} from "../services/api-client";
import { useAsyncData } from "../hooks/use-async-data";
import { configurationSourceLabels, replayCapabilityLabels } from "../app/labels";
import { Button, SignalChip } from "../ui";
import "./ReplayCapabilitySummary.css";

const DIVERGENCE_GROUP_LABELS: Record<string, string> = {
  presenca: "Presença do candidato",
  totalScore: "Score",
  dataCoverage: "Cobertura",
  rank: "Ranking",
  group: "Ranking"
};

/** Rótulo honesto do campo - só agrupa o que o replay de fato compara (nunca inventa "configuração"/"artefato": isso é rejeitado antes do replay rodar, não diverge nele). */
function divergenceFieldLabel(field: string): string {
  if (field.startsWith("metric.")) return `Métrica ${field.slice("metric.".length)}`;
  return DIVERGENCE_GROUP_LABELS[field] ?? field;
}

function formatDivergenceValue(value: number | string | null): string {
  if (value === null) return "—";
  return String(value);
}

/**
 * Resumo mínimo da capacidade de replay de um snapshot (Etapa 26b).
 *
 * Mostra só as cinco frases + schema/versão/tamanho/datas/última verificação
 * quando disponíveis — nunca o `contentJson` do bundle, que a API já nem
 * devolve. Reaproveitado no detalhe do snapshot (Histórico de drafts) e no
 * Laboratório do motor: um componente só, dois lugares.
 */
export function ReplayCapabilitySummary({
  token,
  snapshotId
}: {
  token: string;
  snapshotId: string;
}) {
  const summary = useAsyncData<ReplayBundleSummary>(
    () => fetchReplayBundleSummary(token, snapshotId),
    [token, snapshotId]
  );
  const [verified, setVerified] = useState<ReplayBundleSummary | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [divergences, setDivergences] = useState<ReplayVerificationResponse["divergences"]>([]);

  const data = verified ?? summary.data;

  const secondaryTextStyle = { color: "var(--text-secondary)", fontSize: "var(--text-sm)" } as const;

  if (summary.status === "loading") {
    return <p style={secondaryTextStyle}>Carregando capacidade de replay...</p>;
  }
  if (summary.status === "error" || !data) {
    // Informação suplementar: uma falha aqui não deve travar a tela mãe.
    return null;
  }

  // `MISSING_CONFIGURATION` fica em `info`, não em `negative`: o registro está
  // íntegro e os inputs de derivação todos lá — o que falta é um campo que
  // aquela versão do schema não tinha. Não é defeito do snapshot.
  const tone: "positive" | "negative" | "info" =
    data.capability === "FULL_DERIVATION_REPLAY_AVAILABLE"
      ? "positive"
      : data.capability === "FULL_DERIVATION_REPLAY_INVALID"
        ? "negative"
        : "info";

  return (
    <div style={{ display: "grid", gap: "var(--space-2)" }}>
      <SignalChip tone={tone} title={data.reason}>
        {replayCapabilityLabels[data.capability] ?? data.capability}
      </SignalChip>

      {data.hasBundle && (
        <p style={secondaryTextStyle}>
          Schema {data.bundleSchemaVersion}
          {data.algorithmVersions?.recommendationEngine
            ? ` · Motor ${data.algorithmVersions.recommendationEngine}`
            : ""}
          {typeof data.contentBytes === "number"
            ? ` · ${(data.contentBytes / 1024).toFixed(1)} KB`
            : ""}
          {data.evaluatedAt
            ? ` · Capturado em ${new Date(data.evaluatedAt).toLocaleString("pt-BR")}`
            : ""}
          {data.lastVerification
            ? ` · Última verificação: ${new Date(data.lastVerification.verifiedAt).toLocaleString("pt-BR")}`
            : " · Ainda não verificado"}
        </p>
      )}

      {data.configuration && (
        <p style={secondaryTextStyle}>
          Configuração: {configurationSourceLabels[data.configuration.source] ?? data.configuration.source}
          {data.configuration.version ? ` ${data.configuration.version}` : ""}
          {data.configuration.configHash
            ? ` · hash ${data.configuration.configHash.slice(0, 12)}…`
            : " · sem identificador (anterior ao registro de configuração)"}
          {data.configuration.releaseId
            ? ` · release ${data.configuration.releaseId.slice(0, 8)}…`
            : ""}
          {data.hasBundle
            ? data.configuration.embeddedInBundle
              ? " · parâmetros preservados no bundle"
              : " · parâmetros não preservados no bundle"
            : ""}
        </p>
      )}

      {!data.hasBundle && data.reweightAvailable && (
        <p style={secondaryTextStyle}>
          A reponderação de métricas congeladas continua disponível para este snapshot.
        </p>
      )}

      {data.hasBundle && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            loading={verifying}
            onClick={(event) => {
              // Este componente é renderizado dentro do `<button>` do
              // `InteractiveCard` pai (achado real na validação): sem isso, o
              // clique também alterna o card e esconde o resultado que acabou
              // de chegar.
              event.stopPropagation();
              setVerifying(true);
              setVerifyError(null);
              verifySnapshotReplay(token, snapshotId)
                .then((result) => {
                  setVerified({
                    ...data,
                    capability: result.capability,
                    reason: result.reason,
                    reweightAvailable: result.reweightAvailable,
                    lastVerification: { status: result.status, verifiedAt: new Date().toISOString() }
                  });
                  setDivergences(result.divergences);
                })
                .catch((error: unknown) => {
                  setVerifyError(error instanceof Error ? error.message : "Falha ao verificar.");
                })
                .finally(() => setVerifying(false));
            }}
          >
            Verificar replay
          </Button>
          {verifyError && (
            <p style={{ ...secondaryTextStyle, color: "var(--color-red)" }}>{verifyError}</p>
          )}
        </div>
      )}

      {divergences.length > 0 && <DivergenceTable divergences={divergences} />}
    </div>
  );
}

/**
 * Comparação estrutural do replay (Etapa 31I): campo esperado vs obtido,
 * agrupado só pelo que o motor de fato compara - nunca inventa categoria
 * "configuração"/"artefato" aqui, porque um descasamento desses barra o
 * replay antes de rodar (`FULL_DERIVATION_REPLAY_INVALID`), não gera
 * divergência de campo.
 */
function DivergenceTable({
  divergences
}: {
  divergences: ReplayVerificationResponse["divergences"];
}) {
  return (
    <div className="sp-replay-divergence">
      <p className="sp-replay-divergence__title">
        {divergences.length} divergência(s) - campo esperado (persistido) vs obtido (reconstruído)
      </p>
      <div className="sp-replay-divergence__table-wrap">
        <table className="sp-replay-divergence__table">
          <thead>
            <tr>
              <th scope="col">Candidato</th>
              <th scope="col">Campo</th>
              <th scope="col">Esperado</th>
              <th scope="col">Obtido</th>
              <th scope="col">Delta</th>
            </tr>
          </thead>
          <tbody>
            {divergences.map((entry, index) => (
              <tr key={`${entry.field}-${entry.championId ?? "geral"}-${index}`}>
                <td>{entry.championId !== undefined ? `Campeão #${entry.championId}` : "—"}</td>
                <td>{divergenceFieldLabel(entry.field)}</td>
                <td>{formatDivergenceValue(entry.expected)}</td>
                <td>{formatDivergenceValue(entry.reconstructed)}</td>
                <td>{entry.delta !== undefined ? entry.delta.toFixed(2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
