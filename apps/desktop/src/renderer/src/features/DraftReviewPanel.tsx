import { useState } from "react";
import { EyeOff, Eye, ClipboardCheck, AlertTriangle } from "lucide-react";
import {
  openDraftReview,
  revealDraftReviewResult,
  submitPostMatchReview,
  submitPreMatchReview,
  type BlindReviewContextResponse,
  type DraftReviewRecord,
  type ReviewRatingValue
} from "../services/api-client";
import { Button, Card, EmptyState, SectionHeader, SignalChip, SignalChipList } from "../ui";

/**
 * Revisão humana de um draft registrado (Etapa 24).
 *
 * ## O que esta tela NÃO é
 *
 * Não é ferramenta de ajuste de pesos. Nada aqui altera o motor, e nenhuma
 * avaliação vira nota ou percentual de acerto — a escala é qualitativa e
 * permanece qualitativa.
 *
 * ## Modo cego
 *
 * O resultado da partida **não chega ao renderer** enquanto a revisão está
 * cega: quem garante isso é o backend, não este componente. Aqui a ausência
 * é só refletida na tela.
 */

const RATINGS: ReviewRatingValue[] = ["STRONG", "ADEQUATE", "WEAK", "INSUFFICIENT_DATA", "NOT_APPLICABLE"];

const RATING_LABELS: Record<ReviewRatingValue, string> = {
  STRONG: "Bem sustentada",
  ADEQUATE: "Útil com limitações",
  WEAK: "Não representa as evidências",
  INSUFFICIENT_DATA: "Dados insuficientes",
  NOT_APPLICABLE: "Não se aplica"
};

const PRE_DIMENSIONS: { key: string; label: string }[] = [
  { key: "rankingCoherence", label: "Coerência do ranking" },
  { key: "strategicExplanation", label: "Encaixe estratégico" },
  { key: "personalContextRepresentation", label: "Experiência pessoal" },
  { key: "executionRiskRepresentation", label: "Risco de execução" },
  { key: "uncertaintyHonesty", label: "Honestidade sobre limitações" },
  { key: "practicalUsefulness", label: "Utilidade prática" }
];

const POST_DIMENSIONS: { key: string; label: string }[] = [
  { key: "observedCorrespondence", label: "Correspondência observada" },
  { key: "explanationUsefulness", label: "Explicações continuaram úteis" },
  { key: "informationGap", label: "Informação que faltava no draft" },
  { key: "postMatchClarity", label: "Clareza do relatório pós-game" }
];

const ISSUE_TAGS = [
  "MISSING_DATA",
  "WRONG_ROLE_CONTEXT",
  "STALE_SOURCE",
  "LOW_COVERAGE_NOT_CLEAR",
  "PERSONAL_EVIDENCE_MISREPRESENTED",
  "STRATEGIC_SIGNAL_MISREPRESENTED",
  "EXECUTION_RISK_MISREPRESENTED",
  "DUPLICATED_SIGNAL",
  "CONTRADICTORY_EXPLANATION",
  "RANKING_SURPRISE",
  "POOL_LIMITATION",
  "MATCHUP_CONTEXT_MISSING",
  "OTHER"
] as const;

type Phase = "CLOSED" | "BLIND" | "REVEALED" | "DONE";

export function DraftReviewPanel({
  sessionToken,
  draftSessionId
}: {
  sessionToken: string | null;
  draftSessionId: string;
}) {
  const [phase, setPhase] = useState<Phase>("CLOSED");
  const [review, setReview] = useState<DraftReviewRecord | null>(null);
  const [context, setContext] = useState<BlindReviewContextResponse | null>(null);
  const [revealNote, setRevealNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [preRatings, setPreRatings] = useState<Record<string, ReviewRatingValue>>({});
  const [postRatings, setPostRatings] = useState<Record<string, ReviewRatingValue>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [needsInvestigation, setNeedsInvestigation] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "CLOSED") {
    return (
      <Button
        variant="secondary"
        onClick={() =>
          void run(async () => {
            if (!sessionToken) return;
            const result = await openDraftReview(sessionToken, draftSessionId);
            setReview(result.review);
            setContext(result.context);
            setPhase("BLIND");
          })
        }
        disabled={busy || !sessionToken}
      >
        Revisar este draft
      </Button>
    );
  }

  const statusChip =
    phase === "BLIND" ? (
      <SignalChip tone="info" pill>
        <EyeOff size={12} /> Resultado ainda oculto
      </SignalChip>
    ) : phase === "REVEALED" ? (
      <SignalChip tone="info" pill>
        <Eye size={12} /> Resultado revelado
      </SignalChip>
    ) : review?.status === "NEEDS_INVESTIGATION" ? (
      <SignalChip tone="negative" pill>
        <AlertTriangle size={12} /> Caso marcado para investigação
      </SignalChip>
    ) : (
      <SignalChip tone="positive" pill>
        <ClipboardCheck size={12} /> Revisão concluída
      </SignalChip>
    );

  return (
    <Card tone="inset">
      <SectionHeader
        title="Revisão humana deste draft"
        description="Avaliação qualitativa e auditável. Nada aqui altera o motor, os pesos ou o snapshot."
        actions={statusChip}
      />

      {error && <EmptyState inline title="Ação não concluída" description={error} />}

      {phase === "BLIND" && (
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          {context && (
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
              Contexto original: {context.role} · snapshot{" "}
              {context.snapshotId ? "vigente no lock-in" : "indisponível"} ·{" "}
              {context.hasLinkedMatch ? "há partida vinculada (não revelada)" : "sem partida vinculada"}.
            </p>
          )}

          {!context?.snapshotId && (
            <SignalChip tone="info">
              Esta sessão não tem snapshot vigente no lock-in — a coerência do ranking não pode ser
              avaliada e deve ficar como dados insuficientes.
            </SignalChip>
          )}

          <RatingGrid dimensions={PRE_DIMENSIONS} value={preRatings} onChange={setPreRatings} />
          <TagPicker selected={tags} onChange={setTags} />
          <NotesField value={notes} onChange={setNotes} />

          <Button
            onClick={() =>
              void run(async () => {
                if (!sessionToken || !review) return;
                const assessment: Record<string, unknown> = { issueTags: tags, notes };
                for (const dimension of PRE_DIMENSIONS) {
                  assessment[dimension.key] = preRatings[dimension.key] ?? "INSUFFICIENT_DATA";
                }
                const result = await submitPreMatchReview(sessionToken, review.id, assessment);
                setReview(result.review);
                setTags([]);
                setNotes("");
                setPhase("REVEALED");
              })
            }
            disabled={busy}
          >
            Finalizar avaliação cega
          </Button>
        </div>
      )}

      {phase === "REVEALED" && (
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          <SignalChip tone="positive">
            Avaliação pré-partida concluída e preservada. Ela não aceita mais alterações.
          </SignalChip>

          {revealNote === null ? (
            <Button
              onClick={() =>
                void run(async () => {
                  if (!sessionToken || !review) return;
                  const result = await revealDraftReviewResult(sessionToken, review.id);
                  setReview(result.review);
                  setRevealNote(
                    result.match
                      ? `Partida ${result.match.matchId} revelada.`
                      : (result.matchUnavailableReason ?? "Sem partida vinculada.")
                  );
                })
              }
              disabled={busy}
            >
              Revelar resultado da partida
            </Button>
          ) : (
            <>
              <SignalChip tone="info">{revealNote}</SignalChip>
              <RatingGrid dimensions={POST_DIMENSIONS} value={postRatings} onChange={setPostRatings} />
              <TagPicker selected={tags} onChange={setTags} />
              <NotesField value={notes} onChange={setNotes} />
              <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={needsInvestigation}
                  onChange={(event) => setNeedsInvestigation(event.target.checked)}
                />
                <span style={{ fontSize: "var(--text-sm)" }}>
                  Marcar este caso para investigação
                </span>
              </label>
              <Button
                onClick={() =>
                  void run(async () => {
                    if (!sessionToken || !review) return;
                    const assessment: Record<string, unknown> = {
                      issueTags: tags,
                      notes,
                      needsInvestigation
                    };
                    for (const dimension of POST_DIMENSIONS) {
                      assessment[dimension.key] = postRatings[dimension.key] ?? "INSUFFICIENT_DATA";
                    }
                    const result = await submitPostMatchReview(sessionToken, review.id, assessment);
                    setReview(result.review);
                    setPhase("DONE");
                  })
                }
                disabled={busy}
              >
                Salvar revisão completa
              </Button>
            </>
          )}
        </div>
      )}

      {phase === "DONE" && review && (
        <SignalChipList stacked>
          <SignalChip tone="info">
            Revisão registrada em {new Date(review.createdAt).toLocaleString("pt-BR")} · formulário{" "}
            {review.reviewVersion}
          </SignalChip>
          <SignalChip tone="info">
            As tags registradas são itens de investigação — não alteram peso, fórmula nem ranking.
          </SignalChip>
        </SignalChipList>
      )}
    </Card>
  );
}

function RatingGrid({
  dimensions,
  value,
  onChange
}: {
  dimensions: { key: string; label: string }[];
  value: Record<string, ReviewRatingValue>;
  onChange: (next: Record<string, ReviewRatingValue>) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {dimensions.map((dimension) => (
        <div key={dimension.key} style={{ display: "grid", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {dimension.label}
          </span>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {RATINGS.map((rating) => (
              <Button
                key={rating}
                size="sm"
                variant={value[dimension.key] === rating ? "primary" : "ghost"}
                onClick={() => onChange({ ...value, [dimension.key]: rating })}
              >
                {RATING_LABELS[rating]}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TagPicker({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-2)" }}>
      <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
        Problemas percebidos (itens para investigação, não correções confirmadas)
      </span>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {ISSUE_TAGS.map((tag) => (
          <Button
            key={tag}
            size="sm"
            variant={selected.includes(tag) ? "primary" : "ghost"}
            onClick={() =>
              onChange(selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag])
            }
          >
            {tag}
          </Button>
        ))}
      </div>
    </div>
  );
}

function NotesField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <label style={{ display: "grid", gap: "var(--space-2)" }}>
      <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
        Anotações (opcional)
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={2000}
        style={{
          background: "var(--surface-2)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-2)",
          font: "inherit"
        }}
      />
    </label>
  );
}
