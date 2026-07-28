import type {
  PersonalCatalogResolution,
  PersonalInventoryPattern,
  PersonalLoadoutEvidence,
  PersonalLoadoutHistory as LoadoutHistory,
  PersonalRunePattern,
  PersonalSpellPattern,
  Role
} from "@sparta/core";
import { roleLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchPersonalLoadoutEvidence } from "../services/api-client";
import { Badge, Card, ErrorState, Loading, SectionHeader } from "../ui";

interface PersonalLoadoutHistoryProps {
  token: string | null | undefined;
  playerId?: string;
  championId: number;
  role: Role;
  requestedPatch?: string;
}

export function PersonalLoadoutHistory({
  token,
  playerId,
  championId,
  role,
  requestedPatch
}: PersonalLoadoutHistoryProps) {
  const evidence = useAsyncData<PersonalLoadoutEvidence>(
    () =>
      token && playerId
        ? fetchPersonalLoadoutEvidence(token, playerId, championId, role, {
            patch: requestedPatch
          })
        : undefined,
    [token, playerId, championId, role, requestedPatch]
  );

  return (
    <Card pad="md">
      <SectionHeader
        title="Seu histórico com este campeão"
        description="Configurações observadas nas suas partidas nesta posição. Evidência pessoal factual: não altera ranking, não é orientação global e não garante desempenho."
        actions={<Badge tone="neutral">{roleLabels[role]}</Badge>}
      />
      {!token || !playerId ? (
        <p className="sp-muted">Vincule sua conta Riot para consultar este histórico pessoal.</p>
      ) : evidence.status === "loading" ? (
        <Loading block label="Carregando histórico pessoal..." />
      ) : evidence.status === "error" ? (
        <ErrorState
          inline
          title="Histórico pessoal indisponível"
          description={evidence.error ?? "Não foi possível consultar as observações agora."}
        />
      ) : evidence.data ? (
        <LoadoutEvidenceBody evidence={evidence.data} />
      ) : (
        <p className="sp-muted">Histórico pessoal indisponível.</p>
      )}
    </Card>
  );
}

function LoadoutEvidenceBody({ evidence }: { evidence: PersonalLoadoutEvidence }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      {evidence.patchScope.requestedPatch &&
        evidence.patchScope.hasRequestedPatchObservations === false && (
          <p className="sp-muted">
            Sem observações no patch {evidence.patchScope.requestedPatch} para este campeão nesta
            posição.
          </p>
        )}
      <HistoryBody history={evidence} />
      {evidence.recentHistory && (
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "var(--space-4)" }}>
          <h4 style={{ margin: 0 }}>Histórico recente de outros patches</h4>
          <p className="sp-muted">{evidence.recentHistory.staleReason}</p>
          <HistoryBody history={evidence.recentHistory} />
        </div>
      )}
    </div>
  );
}

function HistoryBody({ history }: { history: LoadoutHistory }) {
  if (history.sampleSize === 0) {
    return <p className="sp-muted">{history.unavailableReason}</p>;
  }
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <PatternBlock
        title="Itens finais mais observados"
        pattern={history.finalInventories[0]}
        unavailableReason={history.parts.finalInventories.unavailableReason}
        describe={describeInventory}
      />
      <PatternBlock
        title="Página de runas mais utilizada por você"
        pattern={history.runePages[0]}
        unavailableReason={history.parts.runePages.unavailableReason}
        describe={describeRunes}
      />
      <PatternBlock
        title="Feitiços mais utilizados por você"
        pattern={history.summonerSpellSets[0]}
        unavailableReason={history.parts.summonerSpellSets.unavailableReason}
        describe={describeSpells}
      />
    </div>
  );
}

function PatternBlock<
  T extends PersonalInventoryPattern | PersonalRunePattern | PersonalSpellPattern
>({
  title,
  pattern,
  unavailableReason,
  describe
}: {
  title: string;
  pattern?: T;
  unavailableReason?: string;
  describe: (pattern: T) => string;
}) {
  return (
    <section>
      <strong>{title}</strong>
      {!pattern ? (
        <p className="sp-muted" style={{ marginBottom: 0 }}>
          {unavailableReason ?? "Indisponível para as partidas observadas."}
        </p>
      ) : (
        <>
          <p style={{ marginBottom: "var(--space-2)" }}>{describe(pattern)}</p>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <Badge tone="neutral">
              {pattern.games} {pattern.games === 1 ? "partida" : "partidas"}
            </Badge>
            <Badge tone="neutral">
              {pattern.patches.length > 0
                ? `Patches ${pattern.patches.join(", ")}`
                : "Patch não informado"}
            </Badge>
            <Badge tone="neutral">
              {pattern.queueIds.length > 0
                ? `Filas ${pattern.queueIds.join(", ")}`
                : "Fila não resolvida"}
            </Badge>
            <Badge tone={pattern.status === "PARTIAL" ? "warning" : "positive"}>
              {pattern.status === "PARTIAL" ? "Parcial" : "Observado"}
            </Badge>
          </div>
          <p className="sp-muted" style={{ marginBottom: 0 }}>
            {pattern.lastUsedAt
              ? `Observado pela última vez em ${new Date(pattern.lastUsedAt).toLocaleDateString("pt-BR")}.`
              : "Data da última utilização indisponível."}
          </p>
        </>
      )}
    </section>
  );
}

function resolutionName(entry: PersonalCatalogResolution): string {
  return entry.names[0] ?? `ID ${entry.id}`;
}

function describeInventory(pattern: PersonalInventoryPattern): string {
  if (pattern.items.length === 0) return "Inventário final observado sem itens nos slots.";
  return pattern.items
    .map((item) => `${resolutionName(item)}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`)
    .join(" · ");
}

function describeRunes(pattern: PersonalRunePattern): string {
  const styles = [
    pattern.primaryStyleId ? `Primária ${pattern.primaryStyleId}` : "Primária indisponível",
    pattern.secondaryStyleId ? `Secundária ${pattern.secondaryStyleId}` : "Secundária indisponível"
  ].join(" · ");
  const perks = pattern.selections.map((selection) => resolutionName(selection.enrichment));
  return `${styles}${perks.length > 0 ? ` · ${perks.join(" · ")}` : ""}`;
}

function describeSpells(pattern: PersonalSpellPattern): string {
  return pattern.spells.map(resolutionName).join(" + ");
}
