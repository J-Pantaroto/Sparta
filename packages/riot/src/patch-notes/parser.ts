import { createHash } from "node:crypto";
import { URL } from "node:url";
import type {
  PatchChange,
  PatchChangeType,
  PatchEntityType,
  PatchRelease,
  StructuredPatchDelta
} from "@sparta/core";
import { load, type CheerioAPI } from "cheerio";
import { assertOfficialPatchNotesUrl } from "./source.js";

export const RIOT_PATCH_NOTES_PARSER_VERSION = "riot-patch-notes-parser/1.0.0";

export class IncompatiblePatchNotesError extends Error {
  readonly code = "PATCH_PARSER_INCOMPATIBLE";
}

interface ParserInput {
  html: string;
  patch: string;
  locale: string;
  sourceUrl: string;
  collectedAt: string;
}

interface ParsedGroup {
  component?: string;
  details: string[];
}

type CheerioSelection = ReturnType<CheerioAPI>;

const clean = (value: string) => value.replace(/\s+/gu, " ").trim();
const fold = (value: string) =>
  clean(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseScalar(raw: string): { value: number; unit?: string } | undefined {
  const match = clean(raw).match(/^(-?\d+(?:[.,]\d+)?)\s*(%|s|ms)?$/u);
  if (!match) return undefined;
  const value = Number(match[1]!.replace(",", "."));
  if (!Number.isFinite(value)) return undefined;
  return { value, unit: match[2] };
}

export function parseStructuredPatchDelta(detail: string): StructuredPatchDelta {
  const normalized = clean(detail);
  const separator = normalized.indexOf(":");
  const label = separator >= 0 ? clean(normalized.slice(0, separator)) : normalized;
  const valueText = separator >= 0 ? clean(normalized.slice(separator + 1)) : "";
  const arrow = valueText.match(/^(.*?)\s*(?:⇒|→)\s*(.*?)$/u);
  if (!arrow) return { label, status: "PARTIAL" };

  const previousValue = clean(arrow[1]!);
  const newValue = clean(arrow[2]!);
  const previous = parseScalar(previousValue);
  const next = parseScalar(newValue);
  const sameUnit = previous?.unit === next?.unit;

  return {
    label,
    previousValue,
    newValue,
    ...(previous && next && sameUnit
      ? {
          numericPreviousValue: previous.value,
          numericNewValue: next.value,
          numericDelta: next.value - previous.value,
          ...(previous.unit ? { unit: previous.unit } : {})
        }
      : {}),
    status: "AVAILABLE"
  };
}

function has(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyOfficialPatchChange(input: {
  heading?: string;
  summary: string;
  details: string[];
}): PatchChangeType {
  const heading = fold(input.heading ?? "");
  const summary = fold(input.summary)
    .replace(/em vez de fortalecimentos?[^,.]*/gu, "")
    .replace(/nao (?:vamos |pretendemos )?fortalecer[^,.]*/gu, "");
  const details = input.details.map(fold);
  const text = `${heading} ${summary}`;

  if (has(heading, [/corre(?:cao|coes) de bugs?/u, /bugfix/u])) return "BUGFIX";
  if (has(heading, [/fortalecimentos?/u, /\bbuffs?\b/u])) return "BUFF";
  if (has(heading, [/enfraquecimentos?/u, /\bnerfs?\b/u])) return "NERF";
  if (has(heading, [/\bajustes?\b/u, /adjustments?/u])) return "ADJUSTMENT";

  const allBugfixes =
    details.length > 0 &&
    details.every((detail) =>
      has(detail, [
        /^corre(?:cao|coes) de bugs?/u,
        /\b(?:agora|voltou a) (?:funciona|concede|aplica|causa|calcula|exibe).*\bcorret/u,
        /\bnao (?:pode|vai|faz|causa|impede|concede) mais\b/u
      ])
    );
  if (allBugfixes) return "BUGFIX";

  const explicitNew = details.length > 0 && details.every((detail) => /\bnovo\b/u.test(detail));
  const explicitRemoved =
    details.length > 0 && details.every((detail) => /\bremovid[oa]\b/u.test(detail));
  if (explicitNew) return "NEW";
  if (explicitRemoved) return "REMOVED";

  const buff = has(text, [
    /\bfortalec(?:er|endo|ido|ida|imento|imentos)\b/u,
    /\baumentar(?:emos)?\b/u,
    /\bdar\b[^.]{0,60}\bmais (?:poder|forca)\b/u,
    /\bmais poder\b/u,
    /\bmelhorar(?:emos)?\b/u,
    /\bmerece (?:um pouco de )?carinho\b/u,
    /\brecompens[a-z-]* mais\b/u
  ]);
  const nerf = has(text, [
    /\benfraquec(?:er|endo|ido|ida|imento|imentos)\b/u,
    /\breduzir(?:emos)?\b/u,
    /\bdiminuir(?:emos)?\b/u,
    /\bmenos (?:poder|forte|opressor)\b/u
  ]);
  const adjustment = has(text, [
    /\bajust(?:e|es|ar|ando|ado|ada)\b/u,
    /\bcompens(?:ar|ando|acao)\b/u,
    /\btransferir (?:poder|forca)\b/u
  ]);

  if ((buff && nerf) || adjustment) return "ADJUSTMENT";
  if (buff) return "BUFF";
  if (nerf) return "NERF";
  return "UNCLASSIFIED";
}

function sectionHeadingForBlock($: CheerioAPI, block: CheerioSelection): string {
  const border = block.closest(".content-border");
  const heading = border.prevAll("header").first().find("h2").first();
  if (heading.length > 0) return clean(heading.text());
  return clean(block.prevAll("header").first().find("h2").first().text());
}

function entityTypeForSection(section: string): PatchEntityType | undefined {
  const value = fold(section);
  if (/\b(champions?|campeoes)\b/u.test(value)) return "CHAMPION";
  if (/\b(items?|itens)\b/u.test(value)) return "ITEM";
  if (/\b(runes?|runas)\b/u.test(value)) return "RUNE";
  return undefined;
}

function detailsFrom($: CheerioAPI, root: CheerioSelection): string[] {
  return root
    .find("li")
    .toArray()
    .map((node) => clean($(node).text()))
    .filter(Boolean);
}

function groupsFromBlock($: CheerioAPI, block: CheerioSelection): ParsedGroup[] {
  const headings = block.find("h4").toArray();
  if (headings.length === 0) return [{ details: detailsFrom($, block) }];
  return headings
    .map((node) => {
      const heading = $(node);
      const details = heading
        .nextUntil("h4")
        .filter("ul, ol")
        .find("li")
        .toArray()
        .map((item) => clean($(item).text()))
        .filter(Boolean);
      return { component: clean(heading.text()), details };
    })
    .filter((group) => group.details.length > 0);
}

function publishedAtFromPage($: CheerioAPI): string | null {
  for (const node of $("script[type='application/ld+json']").toArray()) {
    try {
      const raw = JSON.parse($(node).text()) as unknown;
      const queue = Array.isArray(raw) ? [...raw] : [raw];
      while (queue.length > 0) {
        const value = queue.shift();
        if (!value || typeof value !== "object") continue;
        const record = value as Record<string, unknown>;
        if (
          typeof record.datePublished === "string" &&
          !Number.isNaN(Date.parse(record.datePublished))
        ) {
          return new Date(record.datePublished).toISOString();
        }
        for (const child of Object.values(record)) {
          if (child && typeof child === "object") queue.push(child);
        }
      }
    } catch {
      // JSON-LD auxiliar inválido não contamina a evidência principal.
    }
  }
  return null;
}

function entityResolution(entityType: PatchEntityType) {
  return entityType === "CHAMPION" || entityType === "ITEM" || entityType === "RUNE"
    ? {
        status: "UNRESOLVED" as const,
        reason: "Associação ao catálogo local ainda não executada."
      }
    : { status: "NOT_APPLICABLE" as const };
}

function changeProvenance(input: ParserInput) {
  return {
    sourceType: "OFFICIAL" as const,
    sourceId: "riot-patch-notes",
    resource: input.sourceUrl,
    patch: input.patch,
    locale: input.locale,
    collectedAt: input.collectedAt,
    algorithmVersion: RIOT_PATCH_NOTES_PARSER_VERSION,
    status: "AVAILABLE" as const
  };
}

function parseEntityBlocks($: CheerioAPI, input: ParserInput): PatchChange[] {
  const changes: PatchChange[] = [];
  $(".patch-change-block").each((_index, node) => {
    const block = $(node);
    const section = sectionHeadingForBlock($, block);
    const entityType = entityTypeForSection(section);
    if (!entityType) return;
    const entityName = clean(block.find("h3.change-title").first().text());
    if (!entityName) return;
    const summary = clean(
      block.find("blockquote.context").first().text() || block.find(".summary").first().text()
    );

    for (const group of groupsFromBlock($, block)) {
      const changeType = classifyOfficialPatchChange({
        heading: section,
        summary,
        details: group.details
      });
      const identity = {
        patch: input.patch,
        locale: input.locale,
        entityType,
        entityName,
        changeType,
        affectedComponent: group.component,
        officialSummary: summary,
        officialDetails: group.details
      };
      changes.push({
        id: digest(identity).slice(0, 24),
        entityType,
        entityName,
        entityResolution: entityResolution(entityType),
        changeType,
        affectedComponent: group.component,
        officialSummary: summary,
        officialDetails: group.details,
        structuredChanges: group.details.map(parseStructuredPatchDelta),
        status: "AVAILABLE",
        provenance: changeProvenance(input)
      });
    }
  });
  return changes;
}

function sectionContent($: CheerioAPI, h2: CheerioSelection): CheerioSelection {
  const header = h2.closest("header");
  const content = header.next(".content-border");
  if (content.length > 0) return content;
  return h2.parent().nextUntil("h2, header");
}

function parseSystemAndBugfixSections($: CheerioAPI, input: ParserInput): PatchChange[] {
  const changes: PatchChange[] = [];
  $("h2").each((_index, node) => {
    const h2 = $(node);
    const title = clean(h2.text());
    const normalized = fold(title);
    const isSystem = /^sistemas?$/u.test(normalized) || /^systems?$/u.test(normalized);
    const isBugfix = /corre(?:cao|coes) de bugs?/u.test(normalized) || /bugfix/u.test(normalized);
    if (!isSystem && !isBugfix) return;
    const content = sectionContent($, h2);
    const summary = clean(content.find("blockquote").first().text());
    const headings = content.find("h3, h4").toArray();
    const groups: ParsedGroup[] =
      headings.length > 0
        ? headings
            .map((headingNode) => {
              const heading = $(headingNode);
              const details = heading
                .nextUntil("h3, h4")
                .filter("ul, ol")
                .find("li")
                .toArray()
                .map((item) => clean($(item).text()))
                .filter(Boolean);
              return { component: clean(heading.text()), details };
            })
            .filter((group) => group.details.length > 0)
        : [{ details: detailsFrom($, content) }];

    for (const group of groups) {
      if (group.details.length === 0) continue;
      const entityType: PatchEntityType = isSystem ? "SYSTEM" : "OTHER";
      const entityName = group.component || title;
      const changeType = isBugfix
        ? "BUGFIX"
        : classifyOfficialPatchChange({ heading: title, summary, details: group.details });
      const identity = {
        patch: input.patch,
        locale: input.locale,
        entityType,
        entityName,
        changeType,
        affectedComponent: group.component,
        officialSummary: summary,
        officialDetails: group.details
      };
      changes.push({
        id: digest(identity).slice(0, 24),
        entityType,
        entityName,
        entityResolution: { status: "NOT_APPLICABLE" },
        changeType,
        affectedComponent: group.component,
        officialSummary: summary,
        officialDetails: group.details,
        structuredChanges: group.details.map(parseStructuredPatchDelta),
        status: "AVAILABLE",
        provenance: changeProvenance(input)
      });
    }
  });
  return changes;
}

export function parseOfficialPatchNotes(input: ParserInput): PatchRelease {
  assertOfficialPatchNotesUrl(input.sourceUrl);
  if (!/^\d{1,2}\.\d{1,2}$/u.test(input.patch)) {
    throw new IncompatiblePatchNotesError("Identificador de patch incompatível.");
  }
  const $ = load(input.html);
  const title = clean($("h1").first().text());
  const titleFolded = fold(title);
  const patchPattern = input.patch.replace(".", "[.-]");
  if (!title || !new RegExp(`\\b${patchPattern}\\b`, "u").test(titleFolded)) {
    throw new IncompatiblePatchNotesError("A página não identifica o patch solicitado.");
  }

  const recognizedSections = $("h2")
    .toArray()
    .map((node) => clean($(node).text()))
    .filter(
      (section) =>
        entityTypeForSection(section) || /sistemas?|systems?|bugs?|bugfix/u.test(fold(section))
    );
  if (recognizedSections.length === 0) {
    throw new IncompatiblePatchNotesError(
      "A estrutura oficial da página não é compatível com o parser."
    );
  }

  const changes = [...parseEntityBlocks($, input), ...parseSystemAndBugfixSections($, input)];
  const canonicalChanges = changes.map((change) => ({
    entityType: change.entityType,
    entityName: change.entityName,
    changeType: change.changeType,
    affectedComponent: change.affectedComponent,
    officialSummary: change.officialSummary,
    officialDetails: change.officialDetails,
    structuredChanges: change.structuredChanges
  }));
  const sourceHash = digest({
    patch: input.patch,
    locale: input.locale,
    sourceUrl: new URL(input.sourceUrl).toString(),
    title,
    publishedAt: publishedAtFromPage($),
    changes: canonicalChanges
  });
  const status: PatchRelease["status"] = changes.some((change) => change.status !== "AVAILABLE")
    ? "PARTIAL"
    : "AVAILABLE";
  const provenance = {
    ...changeProvenance(input),
    status
  };

  return {
    patch: input.patch,
    title,
    locale: input.locale,
    publishedAt: publishedAtFromPage($),
    collectedAt: input.collectedAt,
    sourceUrl: new URL(input.sourceUrl).toString(),
    sourceHash,
    parserVersion: RIOT_PATCH_NOTES_PARSER_VERSION,
    revision: 0,
    status,
    changes,
    provenance
  };
}
