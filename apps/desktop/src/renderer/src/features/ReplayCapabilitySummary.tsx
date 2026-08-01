import { useState } from "react";
import {
  fetchReplayBundleSummary,
  verifySnapshotReplay,
  type ReplayBundleSummary
} from "../services/api-client";
import { useAsyncData } from "../hooks/use-async-data";
import { replayCapabilityLabels } from "../app/labels";
import { Button, SignalChip } from "../ui";

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

  const data = verified ?? summary.data;

  const secondaryTextStyle = { color: "var(--text-secondary)", fontSize: "var(--text-sm)" } as const;

  if (summary.status === "loading") {
    return <p style={secondaryTextStyle}>Carregando capacidade de replay...</p>;
  }
  if (summary.status === "error" || !data) {
    // Informação suplementar: uma falha aqui não deve travar a tela mãe.
    return null;
  }

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
    </div>
  );
}
