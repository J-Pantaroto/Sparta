import type { BuildRecommendation, ChampionClassProfile, ItemSummary, RecommendationReason, RecommendedItem } from "../types/domain.js";

/**
 * Motor de recomendacao de build (Fase 8). Puro, sem I/O - roda 100% sobre
 * dado real ja buscado por quem chama (`ChampionClassProfile`/`ItemSummary`
 * vem da Data Dragon, `champion.json`/`item.json`, nunca inventados aqui).
 *
 * Ao contrario da tabela curada `ChampionTag` (so 2 campeoes seedados hoje),
 * este motor usa `tags`/`info` que a propria Data Dragon publica pra todos
 * os ~170 campeoes - unico jeito de cobrir um time inimigo de campeoes
 * quaisquer sem esperar curadoria manual. Mesma filosofia de
 * `composition-rules.ts`/`recommendation-engine.ts`: regras e limiares
 * escolhidos a dedo (documentados), nunca estatistica inventada.
 */

type DamageStyle = "AD" | "AP" | "MIXED";

/** Tags de classe (Data Dragon) que indicam dano magico vs fisico. */
const MAGE_TAGS = ["Mage"];
const PHYSICAL_TAGS = ["Marksman", "Fighter", "Assassin"];

/**
 * Diferenca minima (em pontos, escala 0-10 de `info.attack`/`info.magic`)
 * entre as medias do time inimigo pra considerar a composicao inclinada
 * pra um lado - abaixo disso, o time e tratado como "equilibrado" e a
 * recomendacao nao força nem MR nem armadura. Julgamento de design, mesmo
 * espirito dos thresholds de `dimension-signals.ts`.
 */
const DEFENSE_LEAN_THRESHOLD = 1.5;

const AD_CORE_TAGS = ["Damage", "AttackSpeed", "CriticalStrike", "ArmorPenetration", "LifeSteal"];
// "AbilityHaste" fica de fora deliberadamente - e uma tag comum demais em
// itens defensivos/utilitarios (ex. Spirit Visage) pra servir como sinal de
// "isso e um item de dano magico".
const AP_CORE_TAGS = ["SpellDamage", "MagicPenetration"];

const CORE_ITEM_COUNT = 3;
const SITUATIONAL_ITEM_COUNT = 2;

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Deriva o estilo de dano do proprio campeao a partir das tags de classe
 * da Data Dragon. Campeoes com tag hibrida (ex. Mage+Assassin) ou so
 * Tank/Support desempatam pelas notas `attack`/`magic` publicadas (0-10) -
 * nunca um valor inventado, so a leitura do dado real disponivel.
 */
export function deriveDamageStyle(champion: ChampionClassProfile): DamageStyle {
  const isMage = champion.tags.some((tag) => MAGE_TAGS.includes(tag));
  const isPhysical = champion.tags.some((tag) => PHYSICAL_TAGS.includes(tag));

  if (isMage && !isPhysical) return "AP";
  if (isPhysical && !isMage) return "AD";
  if (isMage && isPhysical) return champion.magic >= champion.attack ? "AP" : "AD";

  if (champion.magic > champion.attack + 1) return "AP";
  if (champion.attack > champion.magic + 1) return "AD";
  return "MIXED";
}

export interface EnemyDamageLean {
  lean: "MAGIC" | "PHYSICAL" | "BALANCED";
  magicAvg: number;
  attackAvg: number;
}

/**
 * Resume pra que lado o time inimigo pende (magico/fisico/equilibrado) a
 * partir da media de `info.magic`/`info.attack` dos inimigos conhecidos.
 * `undefined` quando nenhum inimigo ainda foi informado - nunca chuta um
 * lean sem dado. Exportada pra ser reaproveitada tambem pelo resumo de
 * Pre-game (Fase 8b), mesmo sinal, um so lugar de calculo.
 */
export function summarizeEnemyDamageLean(enemyChampions: ChampionClassProfile[]): EnemyDamageLean | undefined {
  if (enemyChampions.length === 0) return undefined;
  const magicAvg = average(enemyChampions.map((champion) => champion.magic));
  const attackAvg = average(enemyChampions.map((champion) => champion.attack));
  const diff = magicAvg - attackAvg;
  const lean: EnemyDamageLean["lean"] =
    diff >= DEFENSE_LEAN_THRESHOLD ? "MAGIC" : diff <= -DEFENSE_LEAN_THRESHOLD ? "PHYSICAL" : "BALANCED";
  return { lean, magicAvg: round(magicAvg), attackAvg: round(attackAvg) };
}

function isBoots(item: ItemSummary): boolean {
  return item.tags.includes("Boots");
}

/** "Item final" = nada evolui dele - sinal usado pra priorizar itens completos na build, nunca um chute de gold mínimo. */
function isFinalItem(item: ItemSummary): boolean {
  return !item.into || item.into.length === 0;
}

function pickBoots(items: ItemSummary[], style: DamageStyle, enemyLean: EnemyDamageLean | undefined): RecommendedItem | undefined {
  const bootsOptions = items.filter(isBoots);
  if (bootsOptions.length === 0) return undefined;

  const byTag = (tag: string) => bootsOptions.find((item) => item.tags.includes(tag));

  if (enemyLean?.lean === "MAGIC") {
    const magicResist = byTag("SpellBlock");
    if (magicResist) {
      return { itemId: magicResist.itemId, name: magicResist.name, reason: "Time inimigo com foco mágico - resistência mágica nas botas." };
    }
  }
  if (enemyLean?.lean === "PHYSICAL") {
    const armor = byTag("Armor");
    if (armor) {
      return { itemId: armor.itemId, name: armor.name, reason: "Time inimigo com foco físico - armadura nas botas." };
    }
  }

  // Equilibrado ou sem dado do inimigo ainda - bota de conforto pro proprio estilo.
  const comfortTag = style === "AP" ? "CooldownReduction" : style === "AD" ? "AttackSpeed" : undefined;
  const comfort = comfortTag ? byTag(comfortTag) : undefined;
  if (comfort) {
    return { itemId: comfort.itemId, name: comfort.name, reason: "Bota de conforto pro seu estilo de dano." };
  }

  const base = bootsOptions[0];
  return { itemId: base.itemId, name: base.name, reason: "Bota básica - sem sinal suficiente pra recomendar uma variante específica." };
}

function pickCoreItems(items: ItemSummary[], style: DamageStyle): RecommendedItem[] {
  const relevantTags = style === "AP" ? AP_CORE_TAGS : style === "AD" ? AD_CORE_TAGS : [...AD_CORE_TAGS, ...AP_CORE_TAGS];
  return items
    .filter((item) => !isBoots(item) && isFinalItem(item) && item.tags.some((tag) => relevantTags.includes(tag)))
    .sort((a, b) => b.goldTotal - a.goldTotal)
    .slice(0, CORE_ITEM_COUNT)
    .map((item) => ({
      itemId: item.itemId,
      name: item.name,
      reason: `Dano ${style === "MIXED" ? "físico/mágico" : style === "AP" ? "mágico" : "físico"} compatível com seu campeão.`
    }));
}

function pickSituationalItems(items: ItemSummary[], enemyLean: EnemyDamageLean | undefined, alreadyPicked: Set<number>): RecommendedItem[] {
  if (!enemyLean || enemyLean.lean === "BALANCED") return [];
  const defensiveTag = enemyLean.lean === "MAGIC" ? "SpellBlock" : "Armor";
  const detail =
    enemyLean.lean === "MAGIC"
      ? `Time inimigo com foco mágico (méd. ${enemyLean.magicAvg}/10) - prioriza resistência mágica.`
      : `Time inimigo com foco físico (méd. ${enemyLean.attackAvg}/10) - prioriza armadura.`;

  return items
    .filter((item) => !isBoots(item) && isFinalItem(item) && !alreadyPicked.has(item.itemId) && item.tags.includes(defensiveTag))
    .sort((a, b) => b.goldTotal - a.goldTotal)
    .slice(0, SITUATIONAL_ITEM_COUNT)
    .map((item) => ({ itemId: item.itemId, name: item.name, reason: detail }));
}

export function recommendBuild(input: {
  ownChampion: ChampionClassProfile | undefined;
  enemyChampions: ChampionClassProfile[];
  items: ItemSummary[];
}): BuildRecommendation {
  const reasons: RecommendationReason[] = [];
  const warnings: RecommendationReason[] = [];

  if (!input.ownChampion) {
    warnings.push({
      code: "no_champion_data",
      label: "Sem dado do campeão",
      detail: "Não foi possível carregar os dados do campeão confirmado para gerar uma sugestão de build.",
      impact: 0
    });
    return { boots: undefined, coreItems: [], situationalItems: [], reasons, warnings };
  }

  const style = deriveDamageStyle(input.ownChampion);
  const enemyLean = summarizeEnemyDamageLean(input.enemyChampions);

  reasons.push({
    code: "own_damage_style",
    label: "Estilo de dano",
    detail: `${input.ownChampion.championName} identificado como dano ${style === "MIXED" ? "misto" : style === "AP" ? "mágico" : "físico"} (tags: ${input.ownChampion.tags.join(", ") || "nenhuma"}).`,
    impact: 50
  });

  if (!enemyLean) {
    warnings.push({
      code: "no_enemy_data",
      label: "Time inimigo ainda não definido",
      detail: "Sem campeões inimigos selecionados, a sugestão de itens situacionais/defensivos fica indisponível.",
      impact: 30
    });
  } else if (enemyLean.lean !== "BALANCED") {
    reasons.push({
      code: "enemy_damage_lean",
      label: "Inclinação do time inimigo",
      detail:
        enemyLean.lean === "MAGIC"
          ? `Time inimigo com foco mágico (méd. ${enemyLean.magicAvg}/10 vs ${enemyLean.attackAvg}/10 físico).`
          : `Time inimigo com foco físico (méd. ${enemyLean.attackAvg}/10 vs ${enemyLean.magicAvg}/10 mágico).`,
      impact: 60
    });
  } else {
    reasons.push({
      code: "enemy_damage_lean",
      label: "Inclinação do time inimigo",
      detail: `Time inimigo com dano equilibrado (méd. ${enemyLean.magicAvg}/10 mágico vs ${enemyLean.attackAvg}/10 físico).`,
      impact: 40
    });
  }

  if (input.enemyChampions.length > 0 && input.enemyChampions.length < 5) {
    warnings.push({
      code: "partial_enemy_team",
      label: "Time inimigo parcial",
      detail: `Só ${input.enemyChampions.length} de 5 campeões inimigos informados - a sugestão pode mudar conforme o resto do time é revelado.`,
      impact: 20
    });
  }

  const coreItems = pickCoreItems(input.items, style);
  const boots = pickBoots(input.items, style, enemyLean);
  const alreadyPicked = new Set(coreItems.map((item) => item.itemId));
  if (boots) alreadyPicked.add(boots.itemId);
  const situationalItems = pickSituationalItems(input.items, enemyLean, alreadyPicked);

  if (coreItems.length === 0) {
    warnings.push({
      code: "no_core_items",
      label: "Sem itens core disponíveis",
      detail: "Não foi possível encontrar itens do catálogo compatíveis com o estilo de dano deste campeão.",
      impact: 40
    });
  }

  return { boots, coreItems, situationalItems, reasons, warnings };
}
