import type { ChampionTag, DraftState, MatchupData, Role } from "../types/domain.js";
import type { ChampionCapabilityProfile } from "../types/champion-capability.js";
import type { ChampionTagProvenance } from "../types/champion-tag-provenance.js";
import { CHAMPION_TAG_SOURCE_ID } from "./champion-tag-manifest.js";
import type { AvailabilityStatus, DataProvenance } from "../types/provenance.js";
import { toConfidenceScore } from "../types/provenance.js";
import {
  analyzeDraftStrategy,
  STRATEGIC_CAPABILITY_LABELS,
  type DraftStrategicAnalysis,
  type StrategicSignal,
  type TeamCapabilityAnalysis
} from "./draft-strategic-analysis.js";

/**
 * Análise pré-game: o que os dados **atuais** permitem dizer sobre o campeão
 * escolhido dentro deste draft.
 *
 * Não responde "qual é a estratégia perfeita pra vencer". A análise é
 * proporcional à evidência: com dois inimigos revelados ela diz o que dá pra
 * ler de dois inimigos, e diz que são dois.
 *
 * ## O que deliberadamente NÃO é modelado
 *
 * Interações específicas entre campeões (travar investida, punir corpo a
 * corpo, encadear controle de grupo) exigiriam um modelo estruturado de
 * habilidades que o Sparta não tem. Toda conclusão aqui sai das 9 dimensões
 * do `ChampionTag` — quando elas não sustentam a afirmação, o sinal fica
 * indisponível em vez de virar texto convincente.
 *
 * ## Determinismo
 *
 * Nenhuma aleatoriedade, nenhuma chamada externa, nenhum LLM. O mesmo input
 * produz exatamente a mesma saída — por isso `now` entra como parâmetro em
 * vez de a função ler o relógio.
 */

export const PRE_GAME_ANALYSIS_VERSION = "2.0.0";

/** Time completo de LoL. Usado pra dizer "3 de 5", nunca pra completar nada. */
const TEAM_SIZE = 5;

/** Acima disto a dimensão é tratada como presente na composição conhecida. */
const DIMENSION_PRESENT = 55;
/** Abaixo disto ela é tratada como ausente entre os campeões conhecidos. */
const DIMENSION_ABSENT = 35;

export type AnalysisTone = "POSITIVE" | "NEUTRAL" | "WARNING";

export interface AnalysisSignal {
  key: string;
  title: string;
  description: string;
  status: AvailabilityStatus;
  tone?: AnalysisTone;
  /** Intensidade 0-100 do sinal. `null` quando não há número por trás. */
  strength?: number | null;
  confidence?: number | null;
  provenance?: DataProvenance;
  /** Fatos verificáveis que sustentam a descrição. */
  evidence?: string[];
  unavailableReason?: string;
}

export interface AnalysisSection {
  key: string;
  title: string;
  status: AvailabilityStatus;
  signals: AnalysisSignal[];
  unavailableReason?: string;
  /** Quantos elementos sustentam a seção (campeões conhecidos, por exemplo). */
  knownCount?: number;
  expectedCount?: number;
}

export interface PreGameCoverageBreakdown {
  /** Peso do componente e se ele estava disponível. */
  [component: string]: { weight: number; available: boolean };
}

export interface PreGameAnalysis {
  status: AvailabilityStatus;
  /**
   * Fração 0-1 dos sinais esperados que de fato existem. **Não é confiança
   * estatística nem chance de vitória** - é quanto do draft e das tabelas
   * estavam disponíveis na hora de analisar.
   */
  dataCoverage: number;
  coverageBreakdown: PreGameCoverageBreakdown;
  selectedChampion: {
    championId: number;
    championName: string;
    role: Role;
    /**
     * Origem do perfil (`ChampionTag`) usado nesta análise: derivado das
     * classes da Data Dragon, parcialmente revisado ou revisado. **Ausente
     * significa origem não informada** - perfil gravado antes da Etapa 8,
     * ou campeão sem tag. A interface mostra isso num lugar secundário; não
     * é estatística oficial nem entra em nenhuma frase da análise.
     */
    profileProvenance?: ChampionTagProvenance;
  };
  summary: AnalysisSignal;
  laneContext: AnalysisSection;
  alliedComposition: AnalysisSection;
  enemyComposition: AnalysisSection;
  selectedChampionFit: AnalysisSection;
  knownRisks: AnalysisSection;
  unavailableSignals: AnalysisSignal[];
  /** Ausente apenas em respostas compatíveis anteriores à Etapa 15. */
  strategicAnalysis?: DraftStrategicAnalysis;
  generatedAt: string;
  algorithmVersion: string;
}

export interface PreGameAnalysisInput {
  draft: DraftState;
  /** Tag do campeão escolhido. Ausente = catálogo não cobre o campeão. */
  selectedChampionTag?: ChampionTag;
  selectedChampionName: string;
  championTags: ChampionTag[];
  championCapabilityProfiles?: ChampionCapabilityProfile[];
  /** Matchup **pessoal** do jogador neste confronto. Nunca global. */
  personalMatchup?: MatchupData;
  enemyLaneChampionName?: string;
  /** Injetado pra a saída ser determinística; a rota passa a hora real. */
  now: string;
}

/**
 * Proveniência das dimensões de composição, montada a partir das tags que
 * de fato entraram no cálculo.
 *
 * `DERIVED` e não `OFFICIAL`: a tabela `ChampionTag` é gerada a partir das
 * classes e notas que a Data Dragon publica (`champion-tags:generate`), com
 * julgamento de design embutido. Vale inclusive para entrada revisada à
 * mão - curadoria é julgamento de design, não publicação da Riot. O texto
 * usa "indica"/"sugere", nunca afirmação categórica.
 *
 * Versão da fonte e do algoritmo só são declaradas quando **todas** as tags
 * usadas concordam. Com perfis de versões diferentes na mesma composição,
 * anunciar uma delas seria atribuir ao conjunto uma origem que ele não tem;
 * o campo fica ausente. Até a Etapa 8 esta proveniência era uma constante
 * que declarava a versão do **pré-game** como se fosse a da derivação —
 * estava errada por construção.
 */
function championTagProvenanceOf(tags: ChampionTag[]): DataProvenance {
  const unique = <T>(values: (T | undefined)[]): T | undefined => {
    const present = values.filter((value): value is T => value !== undefined);
    if (present.length === 0 || present.length !== values.length) return undefined;
    return present.every((value) => value === present[0]) ? present[0] : undefined;
  };

  const sources = tags.map((tag) => tag.provenance?.source);
  return {
    sourceType: "DERIVED",
    sourceId: CHAMPION_TAG_SOURCE_ID,
    resource: "ChampionTag",
    patch: unique(sources.map((source) => source?.patch)),
    locale: unique(sources.map((source) => source?.locale)),
    algorithmVersion: unique(sources.map((source) => source?.algorithmVersion))
  };
}

/** O draft veio da sessão do cliente ou da escolha do usuário. */
function draftProvenance(draft: DraftState): DataProvenance {
  return {
    sourceType: draft.playerRoleSource === "USER" ? "USER_PROVIDED" : "OBSERVED",
    sourceId: draft.playerRoleSource === "USER" ? "usuario" : "lcu",
    resource: "champ-select-session",
    algorithmVersion: PRE_GAME_ANALYSIS_VERSION
  };
}

const DIMENSIONS = [
  "frontline",
  "engage",
  "peel",
  "waveclear",
  "pickoff",
  "scaling",
  "earlyPressure"
] as const;
export type CompositionDimension = (typeof DIMENSIONS)[number];

const DIMENSION_LABELS: Record<CompositionDimension, string> = {
  frontline: "linha de frente",
  engage: "iniciação",
  peel: "proteção aos carregadores",
  waveclear: "wave clear",
  pickoff: "capacidade de pegar alvos isolados",
  scaling: "escalamento",
  earlyPressure: "pressão inicial"
};

interface KnownComposition {
  /** Média 0-100 por dimensão. Vazio quando nenhum campeão tem tag. */
  dimensions: Partial<Record<CompositionDimension, number>>;
  /** Tags que sustentam os números - fonte da proveniência declarada. */
  tags: ChampionTag[];
  provenance: DataProvenance;
  /** Campeões com tag encontrada. */
  taggedCount: number;
  /** Campeões revelados (com ou sem tag). */
  knownCount: number;
  damageProfile?: "AD_HEAVY" | "AP_HEAVY" | "BALANCED" | "LOW_DAMAGE";
}

/**
 * Perfil da composição a partir **só** dos campeões conhecidos.
 *
 * Diferente de `analyzeTeamComposition` (motor de draft), que devolve `0`
 * pra toda dimensão quando não há nenhuma tag - ali o zero alimenta um
 * score e nunca é exibido; aqui ele viraria a frase "o time não tem linha de
 * frente" sem nenhum campeão conhecido. Sem tag, a dimensão fica **ausente**.
 */
function summarizeKnownComposition(names: string[], championTags: ChampionTag[]): KnownComposition {
  const tags = names
    .map((name) => championTags.find((tag) => tag.championName === name))
    .filter((tag): tag is ChampionTag => tag !== undefined);

  if (tags.length === 0) {
    return {
      dimensions: {},
      tags,
      provenance: championTagProvenanceOf(tags),
      taggedCount: 0,
      knownCount: names.length
    };
  }

  const dimensions: Partial<Record<CompositionDimension, number>> = {};
  for (const dimension of DIMENSIONS) {
    const values = tags
      .map((tag) => tag[dimension])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (values.length === 0) continue;
    dimensions[dimension] = (values.reduce((sum, value) => sum + value, 0) / values.length) * 100;
  }

  const ad = tags.filter((tag) => tag.damageProfile === "AD").length;
  const ap = tags.filter((tag) => tag.damageProfile === "AP").length;
  // Só classifica o balanço quando há campeões suficientes pra isso
  // significar alguma coisa - com 1 campeão conhecido, "AD_HEAVY" seria só
  // uma descrição dele mesmo.
  const damageProfile =
    tags.length < 3
      ? undefined
      : ad >= 4
        ? "AD_HEAVY"
        : ap >= 4
          ? "AP_HEAVY"
          : ad + ap <= 1
            ? "LOW_DAMAGE"
            : "BALANCED";

  return {
    dimensions,
    tags,
    provenance: championTagProvenanceOf(tags),
    taggedCount: tags.length,
    knownCount: names.length,
    damageProfile
  };
}

/** "3 dos 5" — usado pra qualificar toda afirmação sobre composição. */
function coverageWording(known: number, expected: number): string {
  if (known >= expected) return `todos os ${expected} campeões`;
  if (known === 1) return `1 dos ${expected} campeões`;
  return `${known} dos ${expected} campeões`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Converte as dimensões conhecidas em sinais. Cada frase carrega quantos
 * campeões a sustentam: com o draft incompleto, "ainda não foi identificado"
 * em vez de "o time não tem".
 */
function compositionSignals(
  composition: KnownComposition,
  expected: number,
  perspective: "ally" | "enemy"
): AnalysisSignal[] {
  const complete = composition.knownCount >= expected;
  const scope = coverageWording(composition.knownCount, expected);
  const signals: AnalysisSignal[] = [];

  for (const dimension of DIMENSIONS) {
    const value = composition.dimensions[dimension];
    if (value === undefined) continue;

    const label = DIMENSION_LABELS[dimension];
    const present = value >= DIMENSION_PRESENT;
    const absent = value <= DIMENSION_ABSENT;
    if (!present && !absent) continue;

    const description = present
      ? perspective === "ally"
        ? `Entre ${scope} conhecidos, a composição já apresenta ${label}.`
        : `Entre ${scope} inimigos revelados, o perfil indica ${label}.`
      : complete
        ? perspective === "ally"
          ? `A composição apresenta pouca ${label}.`
          : `O time inimigo apresenta pouca ${label}.`
        : perspective === "ally"
          ? `${label[0].toUpperCase()}${label.slice(1)} ainda não foi identificada entre ${scope} conhecidos.`
          : `${label[0].toUpperCase()}${label.slice(1)} ainda não foi identificada entre ${scope} inimigos revelados.`;

    signals.push({
      key: `${perspective}_${dimension}`,
      title: DIMENSION_LABELS[dimension],
      description,
      // Parcial enquanto o draft não fechou: a leitura vale, mas sobre um
      // subconjunto.
      status: complete ? "AVAILABLE" : "PARTIAL",
      tone: present
        ? perspective === "ally"
          ? "POSITIVE"
          : "WARNING"
        : perspective === "ally"
          ? "WARNING"
          : "NEUTRAL",
      strength: round(value),
      confidence: null,
      provenance: composition.provenance,
      // A contagem só vira evidência quando **difere** dos campeões
      // revelados: repeti-la idêntica em cada dimensão só ocupa a tela (visto
      // no app real, 7 sinais com a mesma linha embaixo). Quando algum
      // campeão revelado não tem perfil, aí sim a diferença importa.
      evidence:
        composition.taggedCount === composition.knownCount
          ? undefined
          : [
              `${composition.taggedCount} de ${composition.knownCount} campeões revelados têm perfil conhecido`
            ]
    });
  }

  if (composition.damageProfile && composition.damageProfile !== "BALANCED") {
    const rotulo =
      composition.damageProfile === "AD_HEAVY"
        ? "concentrada em dano físico"
        : composition.damageProfile === "AP_HEAVY"
          ? "concentrada em dano mágico"
          : "com pouco dano identificado";
    signals.push({
      key: `${perspective}_damage_profile`,
      title: "Perfil de dano",
      description:
        perspective === "ally"
          ? `Entre ${scope} conhecidos, a distribuição de dano está ${rotulo}.`
          : `Entre ${scope} inimigos revelados, a distribuição de dano está ${rotulo}.`,
      status: complete ? "AVAILABLE" : "PARTIAL",
      tone: "NEUTRAL",
      strength: null,
      confidence: null,
      provenance: composition.provenance
    });
  }

  return signals;
}

function unavailableSection(key: string, title: string, reason: string): AnalysisSection {
  return { key, title, status: "UNAVAILABLE", signals: [], unavailableReason: reason };
}

/**
 * Contexto do confronto direto. Só existe quando o adversário da posição foi
 * identificado - nenhum inimigo é escolhido arbitrariamente como oponente
 * de rota.
 */
function buildLaneContext(input: PreGameAnalysisInput): AnalysisSection {
  const { enemyLaneChampionName, personalMatchup, draft, selectedChampionName } = input;

  if (!enemyLaneChampionName) {
    return unavailableSection(
      "lane_context",
      "Confronto direto",
      "O oponente da sua posição ainda não foi revelado no draft."
    );
  }

  const signals: AnalysisSignal[] = [
    {
      key: "lane_opponent",
      title: "Oponente da rota",
      description: `${selectedChampionName} enfrenta ${enemyLaneChampionName} na sua posição.`,
      status: "AVAILABLE",
      tone: "NEUTRAL",
      strength: null,
      confidence: null,
      provenance: draftProvenance(draft)
    }
  ];

  if (personalMatchup) {
    const sample = personalMatchup.sampleSize;
    signals.push({
      key: "personal_matchup",
      title: "Seu histórico neste confronto",
      // "Você" de propósito: é desempenho pessoal, não tendência do meta.
      description: `Nas suas partidas com ${selectedChampionName} contra ${enemyLaneChampionName}, seu desempenho ficou em ${round(
        personalMatchup.score
      )} de 100.`,
      status: "AVAILABLE",
      tone:
        personalMatchup.score >= 55
          ? "POSITIVE"
          : personalMatchup.score <= 45
            ? "WARNING"
            : "NEUTRAL",
      strength: round(personalMatchup.score),
      confidence: toConfidenceScore(personalMatchup.confidence),
      provenance: {
        sourceType: "CALCULATED",
        sourceId: "sparta",
        resource: "MatchParticipant",
        sampleSize: sample,
        algorithmVersion: PRE_GAME_ANALYSIS_VERSION
      },
      evidence: sample !== undefined ? [`${sample} partida(s) suas neste confronto`] : undefined
    });
  } else {
    signals.push({
      key: "personal_matchup",
      title: "Seu histórico neste confronto",
      description:
        "Você ainda não tem partidas registradas com este campeão contra este adversário.",
      status: "UNAVAILABLE",
      unavailableReason: "Nenhuma partida sua neste confronto, nesta posição.",
      strength: null,
      confidence: null
    });
  }

  return {
    key: "lane_context",
    title: "Confronto direto",
    status: personalMatchup ? "AVAILABLE" : "PARTIAL",
    signals
  };
}

/**
 * O que o campeão escolhido acrescenta ao time conhecido, e o que continua
 * faltando. Usa as dimensões individuais, não o score agregado do motor de
 * recomendação - "score 62" não explica nada ao jogador.
 */
function buildFit(
  input: PreGameAnalysisInput,
  allies: KnownComposition,
  alliesWithoutPlayer: KnownComposition
): AnalysisSection {
  const tag = input.selectedChampionTag;
  if (!tag) {
    return unavailableSection(
      "selected_fit",
      "O que sua escolha adiciona",
      "O campeão escolhido ainda não tem perfil no catálogo do Sparta."
    );
  }

  const signals: AnalysisSignal[] = [];
  // Estes sinais falam do campeão escolhido, então a origem declarada é a
  // da tag dele - não a média das tags do time.
  const ownProvenance = championTagProvenanceOf([tag]);
  const adiciona: string[] = [];

  for (const dimension of DIMENSIONS) {
    const own = tag[dimension];
    if (typeof own !== "number" || !Number.isFinite(own)) continue;
    if (own * 100 >= DIMENSION_PRESENT) adiciona.push(DIMENSION_LABELS[dimension]);
  }

  if (adiciona.length > 0) {
    signals.push({
      key: "fit_adds",
      title: "Recursos que sua escolha traz",
      // "Indica"/"apresenta perfil de": a tag é derivada, não medida.
      description: `${input.selectedChampionName} apresenta perfil de ${listar(adiciona)}.`,
      status: "AVAILABLE",
      tone: "POSITIVE",
      strength: null,
      confidence: null,
      provenance: ownProvenance
    });
  }

  // Lacunas que continuam abertas DEPOIS de entrar o campeão do jogador.
  //
  // Uma dimensão que o próprio campeão apresenta **não** entra aqui, mesmo
  // que a média do time siga baixa: medido na API real, Viego com Ahri e
  // Jinx produzia "sua escolha não cobre linha de frente" e "linha de frente
  // passa a existir com a sua escolha" ao mesmo tempo. Quem cobre a dimensão
  // não deixa de cobri-la porque os aliados diluem a média.
  const lacunas = DIMENSIONS.filter((dimension) => {
    const value = allies.dimensions[dimension];
    if (value === undefined || value > DIMENSION_ABSENT) return false;
    const proprio = tag[dimension];
    if (
      typeof proprio === "number" &&
      Number.isFinite(proprio) &&
      proprio * 100 >= DIMENSION_PRESENT
    )
      return false;
    return true;
  }).map((dimension) => DIMENSION_LABELS[dimension]);

  if (lacunas.length > 0) {
    const completo = allies.knownCount >= TEAM_SIZE;
    signals.push({
      key: "fit_gaps",
      title: "O que continua em aberto",
      description: completo
        ? `Mesmo com sua escolha, a composição segue com pouca ${listar(lacunas)}.`
        : `Sua escolha não cobre ${listar(lacunas)} - e ainda faltam campeões aliados para revelar.`,
      status: completo ? "AVAILABLE" : "PARTIAL",
      tone: "WARNING",
      strength: null,
      confidence: null,
      provenance: ownProvenance
    });
  }

  // Dimensão que o time conhecido não tinha e que o campeão escolhido traz.
  //
  // A comparação é entre a **média sem o jogador** e o valor **do próprio
  // campeão** - não entre as duas médias. Uma média com o jogador dentro
  // nunca cruzaria o limiar: com um aliado em 0 e o jogador em 100 o
  // resultado é 50, então "necessidade atendida" jamais apareceria por essa
  // via, por mais que a escolha resolvesse a lacuna.
  const trouxe = DIMENSIONS.filter((dimension) => {
    const semJogador = alliesWithoutPlayer.dimensions[dimension];
    const proprio = tag[dimension];
    if (semJogador === undefined || typeof proprio !== "number" || !Number.isFinite(proprio))
      return false;
    return semJogador <= DIMENSION_ABSENT && proprio * 100 >= DIMENSION_PRESENT;
  }).map((dimension) => DIMENSION_LABELS[dimension]);

  if (trouxe.length > 0) {
    signals.push({
      key: "fit_fills_gap",
      title: "Necessidade atendida",
      description: `Entre os aliados conhecidos, ${listar(trouxe)} passa a existir com a sua escolha.`,
      status: allies.knownCount >= TEAM_SIZE ? "AVAILABLE" : "PARTIAL",
      tone: "POSITIVE",
      strength: null,
      confidence: null,
      provenance: ownProvenance
    });
  }

  return {
    key: "selected_fit",
    title: "O que sua escolha adiciona",
    status:
      signals.length === 0
        ? "UNAVAILABLE"
        : allies.knownCount >= TEAM_SIZE
          ? "AVAILABLE"
          : "PARTIAL",
    signals,
    unavailableReason:
      signals.length === 0
        ? "O perfil do campeão não destaca nem deixa em aberto nenhuma dimensão."
        : undefined
  };
}

function listar(itens: string[]): string {
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * Riscos que as dimensões atuais sustentam: o time inimigo revelado tem algo
 * alto onde o time do jogador tem algo baixo. Nada de interação específica
 * entre campeões - isso exigiria um modelo de habilidades.
 */
function buildKnownRisks(
  allies: KnownComposition,
  alliesWithoutPlayer: KnownComposition,
  enemies: KnownComposition
): AnalysisSection {
  if (enemies.taggedCount === 0) {
    return unavailableSection(
      "known_risks",
      "Riscos conhecidos",
      "Nenhum campeão inimigo com perfil conhecido foi revelado até agora."
    );
  }

  // As frases falam do time ("a composição conhecida tem pouca proteção").
  // Sem nenhum companheiro revelado isso descreveria o jogador sozinho.
  if (alliesWithoutPlayer.taggedCount === 0) {
    return unavailableSection(
      "known_risks",
      "Riscos conhecidos",
      "Comparar os dois times exige pelo menos um companheiro de time revelado."
    );
  }

  const signals: AnalysisSignal[] = [];
  // O risco compara os dois times: a origem declarada cobre os dois lados.
  const riskProvenance = championTagProvenanceOf([...allies.tags, ...enemies.tags]);
  const draftCompleto = enemies.knownCount >= TEAM_SIZE && allies.knownCount >= TEAM_SIZE;

  const pares: { enemy: CompositionDimension; ally: CompositionDimension; texto: string }[] = [
    {
      enemy: "engage",
      ally: "peel",
      texto:
        "o time inimigo revelado indica iniciação forte e a composição conhecida tem pouca proteção aos carregadores"
    },
    {
      enemy: "pickoff",
      ally: "peel",
      texto:
        "o time inimigo revelado indica capacidade de pegar alvos isolados e a composição conhecida tem pouca proteção"
    },
    {
      enemy: "earlyPressure",
      ally: "earlyPressure",
      texto: "o time inimigo revelado indica mais pressão inicial que a composição conhecida"
    }
  ];

  for (const par of pares) {
    const inimigo = enemies.dimensions[par.enemy];
    const aliado = allies.dimensions[par.ally];
    if (inimigo === undefined || aliado === undefined) continue;
    if (inimigo < DIMENSION_PRESENT || aliado > DIMENSION_ABSENT) continue;

    signals.push({
      key: `risk_${par.enemy}_vs_${par.ally}`,
      title: "Assimetria no draft revelado",
      description: `Pelos campeões já conhecidos, ${par.texto}.`,
      status: draftCompleto ? "AVAILABLE" : "PARTIAL",
      tone: "WARNING",
      strength: round(inimigo - aliado),
      confidence: null,
      provenance: riskProvenance,
      evidence: [
        `${enemies.taggedCount} inimigo(s) e ${allies.taggedCount} aliado(s) com perfil conhecido`
      ]
    });
  }

  if (signals.length === 0) {
    return {
      key: "known_risks",
      title: "Riscos conhecidos",
      status: draftCompleto ? "AVAILABLE" : "PARTIAL",
      signals: [
        {
          key: "risk_none",
          title: "Sem assimetria evidente",
          description: draftCompleto
            ? "As dimensões analisadas não apontam assimetria clara entre os dois times."
            : "As dimensões analisadas ainda não apontam assimetria clara no draft revelado até agora.",
          status: draftCompleto ? "AVAILABLE" : "PARTIAL",
          tone: "NEUTRAL",
          strength: null,
          confidence: null,
          provenance: riskProvenance
        }
      ]
    };
  }

  return {
    key: "known_risks",
    title: "Riscos conhecidos",
    status: draftCompleto ? "AVAILABLE" : "PARTIAL",
    signals
  };
}

/**
 * Sinais que o Sparta reconhece mas ainda não produz. Ficam numa lista
 * separada de propósito: repetir "indisponível" dentro de cada bloco
 * poluiria a leitura antes da partida.
 */
function buildUnavailableSignals(): AnalysisSignal[] {
  return [
    {
      key: "GLOBAL_MATCHUP",
      title: "Confronto no meta",
      description: "Como este confronto se comporta entre jogadores em geral.",
      status: "UNAVAILABLE",
      unavailableReason: "O Sparta não tem fonte global de matchup.",
      strength: null,
      confidence: null
    },
    {
      key: "META_STRENGTH",
      title: "Força no meta",
      description: "Quão forte o campeão está no patch atual.",
      status: "UNAVAILABLE",
      unavailableReason: "Não há Meta Intelligence observada para o patch.",
      strength: null,
      confidence: null
    },
    {
      key: "CHAMPION_INTERACTIONS",
      title: "Interações específicas entre campeões",
      description: "Como habilidades concretas dos dois times se anulam ou se somam.",
      status: "UNAVAILABLE",
      unavailableReason:
        "O Sparta ainda não modela habilidades, tipos de controle nem interações campeão a campeão.",
      strength: null,
      confidence: null
    }
  ];
}

/**
 * Cobertura: fração dos sinais esperados que existem de fato.
 *
 * Pesos escolhidos pelo que muda mais a análise: o campeão e a posição são a
 * pré-condição (e sempre presentes quando a análise roda), os dois times
 * pesam igual, e o adversário direto pesa mais que o matchup pessoal porque
 * habilita a seção inteira de confronto.
 *
 * **Não é confiança estatística nem probabilidade de vitória.**
 */
function computeCoverage(
  input: PreGameAnalysisInput,
  allies: KnownComposition,
  enemies: KnownComposition
) {
  const breakdown: PreGameCoverageBreakdown = {
    campeaoSelecionado: { weight: 0.1, available: true },
    posicao: { weight: 0.1, available: true },
    perfilDoCampeao: { weight: 0.1, available: input.selectedChampionTag !== undefined },
    aliadosRevelados: { weight: 0.2, available: false },
    inimigosRevelados: { weight: 0.2, available: false },
    adversarioDireto: { weight: 0.2, available: input.enemyLaneChampionName !== undefined },
    matchupPessoal: { weight: 0.1, available: input.personalMatchup !== undefined }
  };

  // Times entram proporcionalmente: 2 de 4 aliados revelados vale metade do
  // peso, em vez de tudo ou nada.
  const alliesExpected = TEAM_SIZE - 1;
  const alliesRatio = Math.min(
    1,
    allies.knownCount > 0 ? (allies.knownCount - 1) / alliesExpected : 0
  );
  const enemiesRatio = Math.min(1, enemies.knownCount / TEAM_SIZE);

  const total =
    breakdown.campeaoSelecionado.weight +
    breakdown.posicao.weight +
    (breakdown.perfilDoCampeao.available ? breakdown.perfilDoCampeao.weight : 0) +
    breakdown.aliadosRevelados.weight * alliesRatio +
    breakdown.inimigosRevelados.weight * enemiesRatio +
    (breakdown.adversarioDireto.available ? breakdown.adversarioDireto.weight : 0) +
    (breakdown.matchupPessoal.available ? breakdown.matchupPessoal.weight : 0);

  breakdown.aliadosRevelados.available = alliesRatio > 0;
  breakdown.inimigosRevelados.available = enemiesRatio > 0;

  return { dataCoverage: Math.round(total * 100) / 100, breakdown };
}

export type PreGameUnavailableReason = "SELECTED_CHAMPION_UNAVAILABLE" | "PLAYER_ROLE_UNAVAILABLE";

function strategicTeamSection(
  key: string,
  title: string,
  team: TeamCapabilityAnalysis
): AnalysisSection {
  if (team.knownChampions.length === 0) {
    return unavailableSection(key, title, "Nenhum campeão conhecido para esta leitura.");
  }
  const signals = team.dimensions.flatMap((dimension) => {
    if (dimension.championsWithEvidence.length === 0) return [];
    const names = dimension.championsWithEvidence
      .map((champion) => champion.championName)
      .join(", ");
    return [
      {
        key: `${key}_${dimension.dimension}`,
        title: STRATEGIC_CAPABILITY_LABELS[dimension.dimension],
        description: `Entre ${team.knownChampions.length} campeão(ões) conhecido(s), ${dimension.championsWithEvidence.length} possui(em) evidência de ${STRATEGIC_CAPABILITY_LABELS[dimension.dimension]}.`,
        status: dimension.status,
        tone: "NEUTRAL",
        strength: null,
        confidence: null,
        provenance: dimension.evidence[0]?.provenance,
        evidence: [
          `${names}`,
          `${dimension.evidenceCount} evidência(s)`,
          `${team.unknownPicks} pick(s) ainda desconhecido(s)`
        ]
      } satisfies AnalysisSignal
    ];
  });
  return {
    key,
    title,
    status: team.status,
    signals,
    knownCount: team.knownChampions.length,
    expectedCount: team.expectedPicks,
    ...(signals.length === 0
      ? {
          unavailableReason:
            "Os perfis conhecidos ainda não sustentam capacidades utilizáveis para esta seção."
        }
      : {})
  };
}

function strategicFitSection(analysis: DraftStrategicAnalysis): AnalysisSection {
  const signals = [
    ...analysis.strengths.map(toAnalysisSignal),
    ...analysis.gaps.map(toAnalysisSignal)
  ];
  if (signals.length === 0) {
    return unavailableSection(
      "selected_champion_fit",
      "O que sua escolha adiciona",
      analysis.teamCompositionScore.unavailableReason ??
        "As capacidades disponíveis não sustentam uma contribuição estratégica."
    );
  }
  return {
    key: "selected_champion_fit",
    title: "O que sua escolha adiciona",
    status: analysis.status,
    signals
  };
}

function strategicRiskSection(analysis: DraftStrategicAnalysis): AnalysisSection {
  const responseSignals = analysis.threatResponses.map((response) => ({
    key: `threat_${response.key}`,
    title: STRATEGIC_CAPABILITY_LABELS[response.threat],
    description: response.description,
    status: response.status,
    tone: response.responseChampions.length > 0 ? ("POSITIVE" as const) : ("WARNING" as const),
    strength: response.score,
    confidence: null,
    provenance: response.evidence[0]?.provenance,
    evidence: [response.rationale, `Cobertura ${Math.round(response.coverage * 100)}%`],
    ...(response.unavailableReason ? { unavailableReason: response.unavailableReason } : {})
  }));
  const signals = [...responseSignals, ...analysis.risks.map(toAnalysisSignal)];
  if (signals.length === 0) {
    return unavailableSection(
      "known_risks",
      "Respostas e lacunas",
      "Nenhuma relação ameaça–resposta pôde ser avaliada com os campeões revelados."
    );
  }
  return {
    key: "known_risks",
    title: "Respostas e lacunas",
    status: analysis.status,
    signals
  };
}

function toAnalysisSignal(signal: StrategicSignal): AnalysisSignal {
  return {
    key: signal.key,
    title: STRATEGIC_CAPABILITY_LABELS[signal.dimension],
    description: signal.description,
    status: signal.status,
    tone:
      signal.status === "UNAVAILABLE"
        ? "NEUTRAL"
        : signal.key.startsWith("remaining_") ||
            signal.key.startsWith("unanswered_") ||
            signal.key.startsWith("conflict_")
          ? "WARNING"
          : "POSITIVE",
    strength: null,
    confidence: null,
    provenance: signal.provenance[0],
    evidence: signal.evidence.map(
      (entry) =>
        `${entry.champion.championName}: ${STRATEGIC_CAPABILITY_LABELS[entry.capability]} (${entry.source === "CAPABILITY_PROFILE" ? "perfil específico" : "ChampionTag"})`
    ),
    ...(signal.unavailableReason ? { unavailableReason: signal.unavailableReason } : {})
  };
}

/**
 * Gera a análise. Devolve o motivo estruturado quando os pré-requisitos não
 * existem - a rota converte isso em `422`.
 */
export function generatePreGameAnalysis(
  input: PreGameAnalysisInput
): { ok: true; analysis: PreGameAnalysis } | { ok: false; reason: PreGameUnavailableReason } {
  const { draft } = input;

  if (!draft.playerRole) return { ok: false, reason: "PLAYER_ROLE_UNAVAILABLE" };
  if (draft.selectedChampionId === undefined)
    return { ok: false, reason: "SELECTED_CHAMPION_UNAVAILABLE" };
  // Compatibilidade de chamada: consumidores anteriores não enviavam o
  // catálogo da Etapa 14. Eles preservam a análise estruturada antiga sem
  // receber `50` novo nem fingir que o motor 5×5 foi executado.
  if (input.championCapabilityProfiles === undefined) {
    return generateLegacyPreGameAnalysis(input);
  }

  const strategicAnalysis = analyzeDraftStrategy({
    draft,
    candidate: {
      championId: draft.selectedChampionId,
      championName: input.selectedChampionName
    },
    capabilityProfiles: input.championCapabilityProfiles ?? [],
    championTags: input.championTags
  });
  const alliedComposition = strategicTeamSection(
    "allied_composition",
    "Recursos conhecidos da equipe",
    strategicAnalysis.alliedProfile
  );
  const enemyComposition = strategicTeamSection(
    "enemy_composition",
    "Ameaças inimigas conhecidas",
    strategicAnalysis.enemyProfile
  );
  const selectedChampionFit = strategicFitSection(strategicAnalysis);
  const knownRisks = strategicRiskSection(strategicAnalysis);
  const laneContext = buildLaneContext(input);
  const totalConhecidos =
    strategicAnalysis.alliedProfile.knownChampions.length +
    strategicAnalysis.enemyProfile.knownChampions.length;
  const draftCompleto = totalConhecidos >= TEAM_SIZE * 2;

  const summary: AnalysisSignal = {
    key: "summary",
    title: "Resumo da escolha",
    description: draftCompleto
      ? `Análise de ${input.selectedChampionName} com o draft completo revelado.`
      : `Análise de ${input.selectedChampionName} com ${totalConhecidos} dos ${TEAM_SIZE * 2} campeões da partida já conhecidos.`,
    status: draftCompleto ? "AVAILABLE" : "PARTIAL",
    tone: "NEUTRAL",
    strength: null,
    confidence: null,
    provenance: draftProvenance(draft),
    evidence: [
      `${strategicAnalysis.alliedProfile.knownChampions.length} de ${TEAM_SIZE} aliados (incluindo você)`,
      `${strategicAnalysis.enemyProfile.knownChampions.length} de ${TEAM_SIZE} inimigos revelados`,
      `Cobertura estratégica ${Math.round(strategicAnalysis.coverage * 100)}%`
    ]
  };

  return {
    ok: true,
    analysis: {
      status: strategicAnalysis.status,
      dataCoverage: strategicAnalysis.coverage,
      coverageBreakdown: {
        analiseEstrategica: {
          weight: 1,
          available: strategicAnalysis.status !== "UNAVAILABLE"
        }
      },
      selectedChampion: {
        championId: draft.selectedChampionId,
        championName: input.selectedChampionName,
        role: draft.playerRole,
        profileProvenance: input.selectedChampionTag?.provenance
      },
      summary,
      laneContext,
      alliedComposition,
      enemyComposition,
      selectedChampionFit,
      knownRisks,
      unavailableSignals: [
        ...strategicAnalysis.unavailableSignals.map(toAnalysisSignal),
        ...buildUnavailableSignals()
      ],
      strategicAnalysis,
      generatedAt: input.now,
      algorithmVersion: PRE_GAME_ANALYSIS_VERSION
    }
  };
}

function generateLegacyPreGameAnalysis(input: PreGameAnalysisInput): {
  ok: true;
  analysis: PreGameAnalysis;
} {
  const draft = input.draft as DraftState & {
    playerRole: Role;
    selectedChampionId: number;
  };
  const allyNames = draft.allies.map((pick) => pick.championName);
  const allies = summarizeKnownComposition(
    [...allyNames, input.selectedChampionName],
    input.championTags
  );
  const alliesWithoutPlayer = summarizeKnownComposition(allyNames, input.championTags);
  const enemies = summarizeKnownComposition(
    draft.enemies.map((pick) => pick.championName),
    input.championTags
  );
  const { dataCoverage, breakdown } = computeCoverage(input, allies, enemies);
  const alliedSignals = compositionSignals(allies, TEAM_SIZE, "ally");
  const enemySignals = compositionSignals(enemies, TEAM_SIZE, "enemy");
  const alliedComposition: AnalysisSection =
    alliesWithoutPlayer.taggedCount === 0
      ? unavailableSection(
          "allied_composition",
          "Composição aliada",
          "Nenhum companheiro de time com perfil conhecido foi revelado até agora - o que dá pra ler do seu campeão está em “O que sua escolha adiciona”."
        )
      : {
          key: "allied_composition",
          title: "Composição aliada",
          status: allies.knownCount >= TEAM_SIZE ? "AVAILABLE" : "PARTIAL",
          signals: alliedSignals,
          knownCount: allies.knownCount,
          expectedCount: TEAM_SIZE
        };
  const enemyComposition: AnalysisSection =
    enemies.taggedCount === 0
      ? unavailableSection(
          "enemy_composition",
          "Composição inimiga",
          "Nenhum campeão inimigo foi revelado até agora."
        )
      : {
          key: "enemy_composition",
          title: "Composição inimiga",
          status: enemies.knownCount >= TEAM_SIZE ? "AVAILABLE" : "PARTIAL",
          signals: enemySignals,
          knownCount: enemies.knownCount,
          expectedCount: TEAM_SIZE
        };
  const laneContext = buildLaneContext(input);
  const selectedChampionFit = buildFit(input, allies, alliesWithoutPlayer);
  const knownRisks = buildKnownRisks(allies, alliesWithoutPlayer, enemies);
  const totalKnown = allies.knownCount + enemies.knownCount;
  const complete = totalKnown >= TEAM_SIZE * 2;
  return {
    ok: true,
    analysis: {
      status: complete ? "AVAILABLE" : "PARTIAL",
      dataCoverage,
      coverageBreakdown: breakdown,
      selectedChampion: {
        championId: draft.selectedChampionId,
        championName: input.selectedChampionName,
        role: draft.playerRole,
        profileProvenance: input.selectedChampionTag?.provenance
      },
      summary: {
        key: "summary",
        title: "Resumo da escolha",
        description: complete
          ? `Análise de ${input.selectedChampionName} com o draft completo revelado.`
          : `Análise de ${input.selectedChampionName} com ${totalKnown} dos ${TEAM_SIZE * 2} campeões da partida já conhecidos.`,
        status: complete ? "AVAILABLE" : "PARTIAL",
        tone: "NEUTRAL",
        strength: null,
        confidence: null,
        provenance: draftProvenance(draft),
        evidence: [
          `${allies.knownCount} de ${TEAM_SIZE} aliados (incluindo você)`,
          `${enemies.knownCount} de ${TEAM_SIZE} inimigos revelados`
        ]
      },
      laneContext,
      alliedComposition,
      enemyComposition,
      selectedChampionFit,
      knownRisks,
      unavailableSignals: buildUnavailableSignals(),
      generatedAt: input.now,
      algorithmVersion: PRE_GAME_ANALYSIS_VERSION
    }
  };
}
