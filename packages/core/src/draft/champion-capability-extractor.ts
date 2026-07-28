import {
  CHAMPION_CAPABILITY_KEYS,
  type CapabilityEvidence,
  type CapabilitySourceReference,
  type ChampionCapability,
  type ChampionCapabilityExtractionInput,
  type ChampionCapabilityKey,
  type ChampionCapabilityProfile
} from "../types/champion-capability.js";

export const CHAMPION_CAPABILITY_ALGORITHM_VERSION =
  "champion-capability-extraction/1.0.0";
export const CHAMPION_CAPABILITY_LOCALE = "pt_BR";

interface TextSource extends CapabilitySourceReference {
  texts: string[];
}

interface ExtractionRule {
  id: string;
  keys: ChampionCapabilityKey[];
  pattern: RegExp;
  rejectPattern?: RegExp;
}

/**
 * Regras deliberadamente literais. Elas detectam somente palavras/expressões
 * explícitas do texto oficial em pt_BR; não há tabela por campeão nem leitura
 * de classe, posição, score ou ChampionTag.
 */
const TEXT_RULES: readonly ExtractionRule[] = [
  {
    id: "HARD_CC_STUN_EXPLICIT_PT_BR/v1",
    keys: ["HARD_CC"],
    pattern: /\b(?:atordoa|atordoado|atordoamento|stun)\b/,
    rejectPattern:
      /\b(?:imune a [^.]{0,40}atordo|se for atordoado|quando [^.]{0,60}atordoado|(?:inimigo|alvo) atordoado|nao [^.]{0,30}atordoa)\b/
  },
  {
    id: "HARD_CC_ROOT_EXPLICIT_PT_BR/v1",
    keys: ["HARD_CC"],
    pattern: /\b(?:enraiza|enraizado|enraizamento|imobiliza|imobilizado)\b/,
    rejectPattern:
      /\b(?:a si mesm[oa]|se enraiza|ser imobilizado|for imobilizado|ficar imobilizado|e imobilizado por|alvo enraizado|inimigo proximo e imobilizado)\b/
  },
  {
    id: "HARD_CC_KNOCKUP_EXPLICIT_PT_BR/v1",
    keys: ["HARD_CC", "DISPLACEMENT"],
    pattern: /\b(?:arremessa(?:dos?|ndo)? ao ar|lança(?:dos?|ndo)? ao ar|knockup)\b/
  },
  {
    id: "HARD_CC_KNOCKBACK_EXPLICIT_PT_BR/v1",
    keys: ["HARD_CC", "DISPLACEMENT"],
    pattern: /\b(?:empurra|empurrado|arremessa para tras|repelido|repulsao|knockback)\b/,
    rejectPattern:
      /\b(?:que [ao] empurra|tambem e empurrado|a si mesm[oa]|nao [^.]{0,30}empurra)\b/
  },
  {
    id: "HARD_CC_SUPPRESSION_EXPLICIT_PT_BR/v1",
    keys: ["HARD_CC"],
    pattern: /\b(?:suprime|suprimido|supressao)\b/
  },
  {
    id: "HARD_CC_CHARM_EXPLICIT_PT_BR/v1",
    keys: ["HARD_CC"],
    pattern: /\b(?:encanto|encantado)\b/
  },
  {
    id: "HARD_CC_FEAR_EXPLICIT_PT_BR/v1",
    keys: ["HARD_CC"],
    pattern: /\b(?:amedronta|amedrontado|terror|foge de medo)\b/
  },
  {
    id: "HARD_CC_TAUNT_EXPLICIT_PT_BR/v1",
    keys: ["HARD_CC"],
    pattern: /\b(?:provocacao|provocado)\b/
  },
  {
    id: "HARD_CC_SILENCE_EXPLICIT_PT_BR/v1",
    keys: ["HARD_CC"],
    pattern: /\b(?:silencia|silenciado|silencio)\b/
  },
  {
    id: "SOFT_CC_SLOW_EXPLICIT_PT_BR/v1",
    keys: ["SOFT_CC"],
    pattern: /\b(?:lentidao|desacelera|desacelerado)\b/,
    rejectPattern:
      /\b(?:a si mesm[oa]|imune a [^.]{0,40}lentidao|resistencia a lentidao|sofre lentidao)\b/
  },
  {
    id: "SOFT_CC_MOVEMENT_REDUCTION_EXPLICIT_PT_BR/v1",
    keys: ["SOFT_CC"],
    pattern:
      /\b(?:reduz|reduzindo|reduzida) (?:a |sua )?velocidade de movimento\b/
  },
  {
    id: "DASH_EXPLICIT_PT_BR/v1",
    keys: ["DASH", "MOBILITY"],
    pattern: /\b(?:avanca rapidamente|avanca ate|avanca em direcao|arremete|dispara na direcao)\b/
  },
  {
    id: "BLINK_TELEPORT_EXPLICIT_PT_BR/v1",
    keys: ["BLINK", "MOBILITY"],
    pattern: /\b(?:teleporta|teleportando|teleporte)\b/,
    rejectPattern:
      /\bteleporta [^.]{0,40}\b(?:aliado|inimigo|alvo)\b[^.]{0,40}\bpara\b/
  },
  {
    id: "MOVEMENT_SPEED_GAIN_EXPLICIT_PT_BR/v1",
    keys: ["MOVEMENT_SPEED", "MOBILITY"],
    pattern:
      /\b(?:(?:ganha|recebe|concede) [^.]{0,80}\bvelocidade de movimento\b|aumenta (?:a |sua )?velocidade de movimento\b)/
  },
  {
    id: "ANTI_MOBILITY_EXPLICIT_PT_BR/v1",
    keys: ["ANTI_MOBILITY"],
    pattern:
      /\bimpede (?:o alvo|um inimigo|inimigos|campeoes inimigos) [^.]{0,80}(?:de se mover|habilidades de movimento|avancar)\b/
  },
  {
    id: "PROTECTION_SHIELD_EXPLICIT_PT_BR/v1",
    keys: ["PROTECTION"],
    pattern:
      /\b(?:concede|concedendo|recebe|recebendo|ganha|ganhando|cria|criando|gera|gerando|aplica|aplicando|fornece|fornecendo|converte|convertendo|protege-se com|protegendo-se com) [^.]{0,100}\bescudo\b/,
    rejectPattern: /\bresistencia do escudo\b/
  },
  {
    id: "PROTECTION_HEAL_EXPLICIT_PT_BR/v1",
    keys: ["PROTECTION"],
    pattern:
      /\b(?:se cura|se curando|curando [^.]{0,50}(?:a si|aliad)|cura [^.]{0,50}(?:a si|aliad|vida)|concede cura|restaura [^.]{0,50}\bvida\b|recupera [^.]{0,50}\bvida\b)\b/,
    rejectPattern: /\b(?:aumenta a cura|resistencia do escudo)\b/
  }
] as const;

const UNAVAILABLE_REASON =
  "A Data Dragon analisada não fornece evidência explícita suficiente para esta capacidade.";

function normalizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanOfficialText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function matchingSnippet(
  text: string,
  rule: ExtractionRule,
  championName: string
): string | undefined {
  const cleaned = cleanOfficialText(text);
  const sentences = cleaned.split(/(?<=[.!?;])\s+/);
  return sentences.find((sentence) => {
    const normalized = normalizeText(sentence);
    return (
      rule.pattern.test(normalized) &&
      !(rule.rejectPattern?.test(normalized) ?? false) &&
      !isSelfDisplacement(normalized, rule, championName)
    );
  });
}

function isSelfDisplacement(
  normalized: string,
  rule: ExtractionRule,
  championName: string
): boolean {
  if (!rule.keys.includes("DISPLACEMENT")) return false;
  const name = normalizeText(championName);
  return new RegExp(
    `\\b(?:empurra|arremessa) ${escapeRegExp(name)}\\b`
  ).test(normalized);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textSources(
  input: ChampionCapabilityExtractionInput
): TextSource[] {
  const sources: TextSource[] = [];
  if (input.passive) {
    sources.push({
      sourceType: "PASSIVE",
      sourceId: "passive",
      sourceName: input.passive.name,
      texts: [input.passive.description ?? ""].filter(Boolean)
    });
  }
  for (const spell of input.spells) {
    sources.push({
      sourceType: "SPELL",
      sourceId: spell.id,
      sourceName: spell.name,
      texts: [spell.description ?? "", spell.tooltip ?? ""].filter(Boolean)
    });
  }
  return sources;
}

function provenance(
  input: ChampionCapabilityExtractionInput,
  status: ChampionCapability["status"]
) {
  return {
    sourceType: "CALCULATED" as const,
    sourceId: "sparta",
    resource: `champion/${input.championKey}.json`,
    patch: input.dataDragonVersion ?? undefined,
    locale: input.locale,
    algorithmVersion: CHAMPION_CAPABILITY_ALGORITHM_VERSION,
    status
  };
}

function evidenceByKey(
  sources: readonly TextSource[],
  championName: string
): Map<ChampionCapabilityKey, CapabilityEvidence[]> {
  const result = new Map<ChampionCapabilityKey, CapabilityEvidence[]>();
  for (const source of sources) {
    for (const rule of TEXT_RULES) {
      const sourceText = source.texts
        .map((text) => matchingSnippet(text, rule, championName))
        .find((snippet): snippet is string => snippet !== undefined);
      if (!sourceText) continue;

      for (const key of rule.keys) {
        const list = result.get(key) ?? [];
        const evidence: CapabilityEvidence = {
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          sourceText,
          extractionRule: rule.id
        };
        if (
          !list.some(
            (entry) =>
              entry.sourceType === evidence.sourceType &&
              entry.sourceId === evidence.sourceId &&
              entry.extractionRule === evidence.extractionRule
          )
        ) {
          list.push(evidence);
        }
        result.set(key, list);
      }
    }
  }
  return result;
}

function unavailableCapability(
  key: ChampionCapabilityKey,
  input: ChampionCapabilityExtractionInput
): ChampionCapability {
  return {
    key,
    status: "UNAVAILABLE",
    value: null,
    evidence: [],
    provenance: {
      ...provenance(input, "UNAVAILABLE"),
      unavailableReason: UNAVAILABLE_REASON
    },
    unavailableReason: UNAVAILABLE_REASON
  };
}

/**
 * Extrai presença explícita e medidas objetivas. Ausência textual nunca vira
 * `false`: a capacidade permanece `UNAVAILABLE`.
 */
export function extractChampionCapabilityProfile(
  input: ChampionCapabilityExtractionInput
): ChampionCapabilityProfile {
  if (input.locale !== CHAMPION_CAPABILITY_LOCALE) {
    throw new Error(
      `Locale não suportado pelo extrator de capacidades: ${input.locale}.`
    );
  }
  const sources = textSources(input);
  const sourceReferences: CapabilitySourceReference[] = sources.map(
    ({ sourceType, sourceId, sourceName }) => ({
      sourceType,
      sourceId,
      sourceName
    })
  );
  if (Number.isFinite(input.attackRange)) {
    sourceReferences.push({
      sourceType: "CHAMPION_METADATA",
      sourceId: "stats.attackrange",
      sourceName: "Alcance de ataque base"
    });
  }

  const evidence = evidenceByKey(sources, input.championName);
  const capabilities = CHAMPION_CAPABILITY_KEYS.map((key) => {
    if (
      key === "RANGE_PROFILE" &&
      input.attackRange !== undefined &&
      Number.isFinite(input.attackRange) &&
      input.attackRange >= 0
    ) {
      return {
        key,
        status: "AVAILABLE",
        value: input.attackRange,
        evidence: [
          {
            sourceType: "CHAMPION_METADATA",
            sourceId: "stats.attackrange",
            sourceName: "Alcance de ataque base",
            sourceText: String(input.attackRange),
            extractionRule: "RANGE_PROFILE_BASE_ATTACK_RANGE/v1"
          }
        ],
        provenance: provenance(input, "AVAILABLE")
      } satisfies ChampionCapability;
    }

    const found = evidence.get(key);
    return found && found.length > 0
      ? ({
          key,
          status: "AVAILABLE",
          value: true,
          evidence: found,
          provenance: provenance(input, "AVAILABLE")
        } satisfies ChampionCapability)
      : unavailableCapability(key, input);
  });

  const availableCapabilities = capabilities.filter(
    (capability) =>
      capability.status === "AVAILABLE" || capability.status === "PARTIAL"
  ).length;
  const totalCapabilities = CHAMPION_CAPABILITY_KEYS.length;
  const coverage = Math.round((availableCapabilities / totalCapabilities) * 10_000) / 10_000;

  return {
    championId: input.championId,
    championKey: input.championKey,
    championName: input.championName,
    dataDragonVersion: input.dataDragonVersion,
    locale: input.locale,
    algorithmVersion: CHAMPION_CAPABILITY_ALGORITHM_VERSION,
    status:
      availableCapabilities === 0
        ? "UNAVAILABLE"
        : availableCapabilities === totalCapabilities
          ? "AVAILABLE"
          : "PARTIAL",
    coverage,
    availableCapabilities,
    totalCapabilities,
    sourceReferences,
    capabilities
  };
}
