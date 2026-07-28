import type { ChampionClassProfile, ChampionTag, DamageProfile } from "../types/domain.js";

/**
 * Deriva os atributos de gameplay do Sparta (`ChampionTag`) a partir do
 * unico dado que a Riot publica pra TODOS os campeoes: as tags de classe e
 * as notas `info` do `champion.json` da Data Dragon.
 *
 * Por que derivar em vez de curar a mao: a tabela curada tinha 2 campeoes
 * de ~170, entao praticamente toda recomendacao de draft caia nos valores
 * neutros padrao (`blindSafety` 50, `allySynergy` 50, `enemyDraftAnswer`
 * 50, `compositionFit` neutro) - o motor tolera a ausencia, mas o
 * resultado era "desempenho pessoal + forma recente" com o resto de
 * enchimento. Cobrir todo mundo com uma leitura de CLASSE e menos preciso
 * que curadoria individual, mas e muito mais informativo que nada.
 *
 * O QUE ISTO NAO E: nao e calibracao estatistica nem conhecimento de
 * campeao individual. Duas Marksman recebem exatamente o mesmo perfil, e
 * campeao que foge do arquetipo da classe (Senna, Pyke, Ivern) fica com um
 * perfil generico demais. Por isso a derivacao NUNCA sobrescreve uma
 * entrada curada a mao - ver `mergeChampionTags`, que preserva as manuais.
 */

/**
 * Versao do algoritmo de derivacao. Faz parte da proveniencia gravada em
 * `data/seeds/champion-tags.json` (Etapa 8): sem ela nao da pra saber com
 * que regra um perfil foi produzido, nem detectar que o arquivo ficou pra
 * tras depois de a tabela de classes mudar.
 *
 * **Suba esta versao sempre que CLASS_PROFILE, os pesos ou os limiares
 * mudarem** - sao eles que determinam o resultado.
 */
export const CHAMPION_TAG_DERIVATION_VERSION = "champion-tag-derivation/1.0.0";

/** Classes da Data Dragon. Sao as unicas 6 possiveis no `champion.json`. */
type ChampionClass = "Assassin" | "Fighter" | "Mage" | "Marksman" | "Support" | "Tank";

const CLASSES: ChampionClass[] = ["Assassin", "Fighter", "Mage", "Marksman", "Support", "Tank"];

/**
 * Perfil de cada classe nas dimensoes do `ChampionTag` (0-1). Julgamento de
 * design sobre o arquetipo, na mesma linha de `roleBaselines` em
 * `champion-performance.ts`: nao calibrado contra dado real de partida.
 *
 * Leitura das colunas:
 * - `frontline`: aguenta ficar na frente e absorver dano.
 * - `engage`:    inicia luta.
 * - `peel`:      protege quem carrega.
 * - `pickoff`:   pega alguem sozinho e mata.
 * - `waveclear`: limpa onda rapido.
 * - `scaling`:   quanto ganha com itens/tempo.
 * - `early`:     pressao nos primeiros minutos.
 * - `blind`:     quao seguro e escolher sem saber o matchup.
 */
const CLASS_PROFILE: Record<
  ChampionClass,
  { frontline: number; engage: number; peel: number; pickoff: number; waveclear: number; scaling: number; early: number; blind: number }
> = {
  Tank: { frontline: 1, engage: 0.75, peel: 0.6, pickoff: 0.3, waveclear: 0.4, scaling: 0.5, early: 0.45, blind: 0.85 },
  Fighter: { frontline: 0.65, engage: 0.6, peel: 0.3, pickoff: 0.45, waveclear: 0.5, scaling: 0.55, early: 0.65, blind: 0.7 },
  Assassin: { frontline: 0.1, engage: 0.55, peel: 0.1, pickoff: 0.9, waveclear: 0.4, scaling: 0.5, early: 0.75, blind: 0.55 },
  Mage: { frontline: 0.1, engage: 0.35, peel: 0.4, pickoff: 0.55, waveclear: 0.8, scaling: 0.7, early: 0.45, blind: 0.7 },
  Marksman: { frontline: 0.05, engage: 0.15, peel: 0.15, pickoff: 0.35, waveclear: 0.7, scaling: 0.85, early: 0.4, blind: 0.7 },
  Support: { frontline: 0.3, engage: 0.45, peel: 0.85, pickoff: 0.4, waveclear: 0.25, scaling: 0.45, early: 0.5, blind: 0.8 }
};

/** Peso de `info.defense` (0-10) na linha de frente, alem da classe. */
const DEFENSE_WEIGHT = 0.35;
/** Quanto a dificuldade publicada reduz a seguranca de pegar em blind. */
const DIFFICULTY_BLIND_PENALTY = 0.25;

/** Limiares pra transformar um valor derivado numa etiqueta descritiva. */
const TAG_THRESHOLDS = {
  frontline: 0.6,
  engage: 0.6,
  peel: 0.6,
  pickoff: 0.7,
  waveclear: 0.7,
  scaling: 0.7,
  early: 0.65
} as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function knownClasses(profile: ChampionClassProfile): ChampionClass[] {
  return profile.tags.filter((tag): tag is ChampionClass => (CLASSES as string[]).includes(tag));
}

/**
 * Combina as classes de um campeao hibrido pelo MAIOR valor de cada
 * dimensao, nao pela media: uma Support/Tank protege como suporte E segura
 * a frente como tanque - a media apagaria as duas capacidades.
 *
 * A excecao e `blind`, que usa o MENOR valor: se qualquer uma das classes
 * do campeao e arriscada de pegar sem informacao, o campeao e arriscado.
 */
function combineClasses(classes: ChampionClass[]) {
  const profiles = classes.map((name) => CLASS_PROFILE[name]);
  const best = (key: keyof (typeof CLASS_PROFILE)["Tank"]) => Math.max(...profiles.map((entry) => entry[key]));
  return {
    frontline: best("frontline"),
    engage: best("engage"),
    peel: best("peel"),
    pickoff: best("pickoff"),
    waveclear: best("waveclear"),
    scaling: best("scaling"),
    early: best("early"),
    blind: Math.min(...profiles.map((entry) => entry.blind))
  };
}

/**
 * Perfil de dano. Reusa o mesmo criterio de `deriveDamageStyle`
 * (build-recommendation.ts) e acrescenta os dois valores que o
 * `ChampionTag` tem a mais: MIXED (attack e magic proximos e ambos
 * relevantes) e UTILITY (suporte cujo impacto nao vem de dano).
 */
export function deriveDamageProfile(profile: ChampionClassProfile): DamageProfile {
  const classes = knownClasses(profile);
  const isSupport = classes.includes("Support");
  const isMage = classes.includes("Mage");
  const isPhysical = classes.some((name) => name === "Marksman" || name === "Fighter" || name === "Assassin");

  // Suporte sem dano expressivo de nenhum tipo: o impacto vem de utilidade.
  if (isSupport && !isMage && !isPhysical && profile.attack < 5 && profile.magic < 5) return "UTILITY";

  if (isMage && !isPhysical) return "AP";
  if (isPhysical && !isMage) return "AD";
  if (isMage && isPhysical) return profile.magic >= profile.attack ? "AP" : "AD";

  if (profile.magic > profile.attack + 1) return "AP";
  if (profile.attack > profile.magic + 1) return "AD";
  return "MIXED";
}

function buildDescriptiveTags(
  classes: ChampionClass[],
  values: { frontline: number; engage: number; peel: number; pickoff: number; waveclear: number; scaling: number; early: number }
): string[] {
  const tags = classes.map((name) => name.toLowerCase());
  if (values.frontline >= TAG_THRESHOLDS.frontline) tags.push("frontline");
  if (values.engage >= TAG_THRESHOLDS.engage) tags.push("engage");
  if (values.peel >= TAG_THRESHOLDS.peel) tags.push("peel");
  if (values.pickoff >= TAG_THRESHOLDS.pickoff) tags.push("pickoff");
  if (values.waveclear >= TAG_THRESHOLDS.waveclear) tags.push("waveclear");
  if (values.scaling >= TAG_THRESHOLDS.scaling) tags.push("scaling");
  if (values.early >= TAG_THRESHOLDS.early) tags.push("early_pressure");
  return tags;
}

/**
 * `ChampionTag` derivado de um campeao da Data Dragon.
 *
 * `roles` sai **vazio** de proposito: a Data Dragon nao publica em que rota
 * o campeao joga, e chutar (Marksman -> ADC, Mage -> MID) erraria em todo
 * campeao flex. Nenhum motor consome `tag.roles` hoje; inventar o campo so
 * criaria dado falso. Curadoria manual também não é uma fonte global
 * aprovada; elegibilidade por posição vive em contrato separado.
 */
export function deriveChampionTag(profile: ChampionClassProfile): ChampionTag {
  const classes = knownClasses(profile);
  // Campeao sem nenhuma classe reconhecida (dado inesperado da CDN): fica
  // no meio da escala em tudo, que e exatamente o que o motor ja assume
  // quando nao ha tag nenhuma - nunca um perfil inventado.
  const combined = classes.length > 0 ? combineClasses(classes) : {
    frontline: 0.5, engage: 0.5, peel: 0.5, pickoff: 0.5, waveclear: 0.5, scaling: 0.5, early: 0.5, blind: 0.5
  };

  const difficulty = clamp01(profile.difficulty / 10);
  const values = {
    frontline: clamp01(combined.frontline * (1 - DEFENSE_WEIGHT) + (profile.defense / 10) * DEFENSE_WEIGHT),
    engage: clamp01(combined.engage),
    peel: clamp01(combined.peel),
    pickoff: clamp01(combined.pickoff),
    waveclear: clamp01(combined.waveclear),
    scaling: clamp01(combined.scaling),
    early: clamp01(combined.early)
  };

  return {
    championId: profile.championId,
    championName: profile.championName,
    roles: [],
    damageProfile: deriveDamageProfile(profile),
    tags: buildDescriptiveTags(classes, values),
    blindSafety: round2(clamp01(combined.blind - difficulty * DIFFICULTY_BLIND_PENALTY)),
    difficulty: round2(difficulty),
    engage: round2(values.engage),
    peel: round2(values.peel),
    frontline: round2(values.frontline),
    pickoff: round2(values.pickoff),
    waveclear: round2(values.waveclear),
    scaling: round2(values.scaling),
    earlyPressure: round2(values.early)
  };
}

/**
 * Junta o conjunto derivado com o curado a mao, com o curado sempre
 * vencendo. Regenerar a derivacao (patch novo, campeao novo) nunca apaga
 * trabalho manual - e o caminho pra a curadoria crescer por cima da base
 * automatica em vez de competir com ela.
 */
export function mergeChampionTags(derived: ChampionTag[], curated: ChampionTag[]): ChampionTag[] {
  const byId = new Map<number, ChampionTag>();
  derived.forEach((tag) => {
    if (tag.championId !== undefined) byId.set(tag.championId, { ...tag, roles: [] });
  });
  curated.forEach((tag) => {
    if (tag.championId !== undefined) byId.set(tag.championId, { ...tag, roles: [] });
  });
  return [...byId.values()].sort((a, b) => a.championName.localeCompare(b.championName));
}
