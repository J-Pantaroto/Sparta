import { summarizePatchRelease, type PatchRelease } from "@sparta/core";
import { Badge, Card, SectionHeader } from "../ui";

interface PatchSummaryProps {
  release: PatchRelease;
}

function displayDate(value: string | null): string {
  if (!value) return "data de publicação não informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value));
}

export function PatchSummary({ release }: PatchSummaryProps) {
  const summary = summarizePatchRelease(release);
  return (
    <Card>
      <SectionHeader
        title={`Patch ${release.patch}`}
        description={`${displayDate(release.publishedAt)} · revisão ${release.revision}`}
        actions={
          <Badge tone={release.status === "STALE" ? "warning" : "neutral"}>
            {release.status === "STALE" ? "Conteúdo desatualizado" : "Fonte oficial Riot"}
          </Badge>
        }
      />
      <div className="sp-patch-summary__counts">
        <Badge tone="positive">{summary.counts.buffs} buffs</Badge>
        <Badge tone="negative">{summary.counts.nerfs} nerfs</Badge>
        <Badge tone="warning">{summary.counts.adjustments} ajustes</Badge>
        <Badge tone="neutral">{summary.counts.bugfixes} correções</Badge>
        <Badge tone="neutral">{summary.counts.changedItems} itens alterados</Badge>
        <Badge tone="neutral">{summary.counts.changedRunes} runas alteradas</Badge>
      </div>
      <p className="sp-patch-summary__source">
        <a href={release.sourceUrl} target="_blank" rel="noreferrer">
          Ver notas oficiais da Riot
        </a>
        {release.staleReason ? ` · ${release.staleReason}` : ""}
      </p>
    </Card>
  );
}
