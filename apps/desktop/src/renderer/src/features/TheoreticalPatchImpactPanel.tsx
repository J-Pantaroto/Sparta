import type {
  PatchImpactDimension,
  PatchImpactDirection,
  PatchImpactMagnitude,
  TheoreticalPatchImpact
} from "@sparta/core";
import { Badge, SectionHeader } from "../ui";

const dimensionLabels: Record<PatchImpactDimension, string> = {
  INITIAL_DAMAGE: "Dano inicial",
  SUSTAINED_DAMAGE: "Dano sustentado",
  BURST: "Burst",
  POKE: "Poke",
  WAVECLEAR: "Wave clear",
  MOBILITY: "Mobilidade",
  ENGAGE: "Engage",
  DISENGAGE: "Disengage",
  PEEL: "Peel",
  PROTECTION: "Proteção",
  CONTROL: "Controle",
  RANGE: "Alcance",
  RESISTANCE: "Resistência",
  SUSTAIN: "Sustain",
  RESOURCE_COST: "Custo de recursos",
  COOLDOWN: "Cooldown",
  SCALING: "Scaling",
  EARLY_POWER: "Força no início",
  MID_POWER: "Força no meio",
  LATE_POWER: "Força no fim",
  CONSISTENCY: "Consistência",
  ERROR_TOLERANCE: "Tolerância a erro",
  UNCLASSIFIED: "Dimensão não determinada"
};

const directionLabels: Record<PatchImpactDirection, string> = {
  POSITIVE: "Possível efeito positivo",
  NEGATIVE: "Possível efeito negativo",
  MIXED: "Efeito misto",
  NEUTRAL: "Sem variação no escalar",
  UNKNOWN: "Direção desconhecida"
};

const magnitudeLabels: Record<PatchImpactMagnitude, string> = {
  MINOR: "Magnitude menor",
  MODERATE: "Magnitude moderada",
  MAJOR: "Magnitude maior"
};

function directionTone(
  direction: PatchImpactDirection
): "positive" | "negative" | "warning" | "neutral" {
  if (direction === "POSITIVE") return "positive";
  if (direction === "NEGATIVE") return "negative";
  if (direction === "MIXED") return "warning";
  return "neutral";
}

export function TheoreticalPatchImpactPanel({
  impact
}: {
  impact: TheoreticalPatchImpact;
}) {
  if (!impact.entityChanged) return null;
  return (
    <div className="sp-patch-impact">
      <SectionHeader
        title="Impacto teórico do patch"
        description={`${Math.round(impact.coverage * 100)}% das unidades oficiais receberam interpretação segura neste algoritmo.`}
        actions={
          <Badge tone={impact.status === "AVAILABLE" ? "neutral" : "warning"}>
            {impact.status === "AVAILABLE"
              ? "Interpretação disponível"
              : impact.status === "STALE"
                ? "Base desatualizada"
                : impact.status === "PARTIAL"
                  ? "Interpretação parcial"
                  : "Interpretação indisponível"}
          </Badge>
        }
      />

      {impact.signals.map((signal) => (
        <article key={signal.dimension} className="sp-patch-impact__signal">
          <div className="sp-patch-impact__heading">
            <strong>{dimensionLabels[signal.dimension]}</strong>
            <Badge tone={directionTone(signal.direction)}>
              {directionLabels[signal.direction]}
            </Badge>
            {signal.magnitude && (
              <Badge tone="neutral">{magnitudeLabels[signal.magnitude]}</Badge>
            )}
          </div>
          <p className="sp-patch-impact__description">{signal.explanation}</p>
          <ul className="sp-patch-impact__evidence">
            {signal.evidence.map((evidence, index) => (
              <li
                key={`${evidence.patchChangeId}-${evidence.structuredChangeIndex ?? index}-${signal.dimension}`}
              >
                {evidence.affectedComponent ? `${evidence.affectedComponent}: ` : ""}
                {evidence.label ?? "mudança oficial"}
                {evidence.previousValue !== undefined && evidence.newValue !== undefined
                  ? ` (${evidence.previousValue} → ${evidence.newValue})`
                  : ""}
                {evidence.capability
                  ? ` · relação com ${evidence.capability.sourceName} derivada pelo Sparta`
                  : ""}
              </li>
            ))}
          </ul>
        </article>
      ))}

      {impact.unavailableSignals.length > 0 && (
        <div className="sp-patch-impact__limitations">
          <strong>Limitações preservadas</strong>
          <ul className="sp-patch-impact__limitation-list">
            {impact.unavailableSignals.map((signal, index) => (
              <li
                key={`${signal.supportingChangeIds.join("-")}-${signal.dimension}-${index}`}
              >
                {dimensionLabels[signal.dimension]}:{" "}
                {signal.unavailableReason ?? "interpretação segura indisponível."}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="sp-patch-impact__warning">
        Dados globais pós-patch ainda indisponíveis. Esta interpretação não altera score,
        ranking ou força observada no meta.
      </p>
    </div>
  );
}
