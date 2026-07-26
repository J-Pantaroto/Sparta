import type { AvailabilityStatus } from "../types/provenance.js";
import type { DataProvenance } from "../types/provenance.js";

/**
 * Participação do jogador nos objetivos neutros conquistados pelo **próprio
 * time**, calculada a partir do payload Match-V5 já persistido.
 *
 * ## Por que só dragão e barão
 *
 * O Arauto foi **deliberadamente excluído**. `challenges.riftHeraldTakedowns`
 * e `teams[].objectives.riftHerald.kills` não usam a mesma contabilidade:
 * medido nos 220 participantes reais do banco, dragão e barão batem em 100%
 * dos casos, e o Arauto produz uma contradição - existe uma partida
 * (`BR1_3263128214`) em que **nenhum dos dois times** matou Arauto
 * (`riftHerald.kills = 0` nos dois) e mesmo assim um participante tem
 * `riftHeraldTakedowns: 1`; o próprio `challenges.teamRiftHeraldKills` dele
 * é `0`, ou seja, o payload se contradiz internamente.
 *
 * Incluir o Arauto exigiria ou aceitar numerador maior que denominador, ou
 * mascarar a diferença com um clamp - as duas coisas produziriam um
 * percentual que não corresponde a nada de verificável. Dragão e barão
 * sozinhos têm interpretação exata, e é essa a métrica entregue.
 *
 * Ampliar para Arauto, arautos-void (`horde`), Atakhan, torres ou
 * inibidores depende de entender a contabilidade de cada um contra dado
 * real - fora do escopo desta etapa.
 */

/** Versão do algoritmo, registrada na proveniência do resultado. */
export const OBJECTIVE_PARTICIPATION_ALGORITHM_VERSION = "1.0.0";

export type NeutralObjectiveKind = "DRAGON" | "BARON";

/** Os tipos que entram no numerador e no denominador. */
export const CONSIDERED_NEUTRAL_OBJECTIVES: readonly NeutralObjectiveKind[] = ["DRAGON", "BARON"];

/**
 * Contagens do participante, direto de `challenges`. `undefined` significa
 * que o campo não veio no payload - diferente de `0`, que é uma contagem
 * medida.
 */
export interface ParticipantObjectiveTakedowns {
  dragonTakedowns?: number;
  baronTakedowns?: number;
}

/** Objetivos conquistados pelo time, direto de `teams[].objectives`. */
export interface TeamNeutralObjectiveKills {
  dragonKills?: number;
  baronKills?: number;
}

export interface ObjectiveParticipationObservation {
  /** Fração 0-1. `null` sempre que o status não é usável. */
  value: number | null;
  status: AvailabilityStatus;
  /** Objetivos do time em que o jogador participou. Preservado em absoluto. */
  personalTakedowns: number | null;
  /** Objetivos neutros conquistados pelo time do jogador. */
  teamObjectives: number | null;
  consideredObjectives: readonly NeutralObjectiveKind[];
  provenance?: DataProvenance;
  unavailableReason?: string;
  /** Preenchido quando o valor existe mas há uma ressalva sobre ele. */
  partialReason?: string;
}

export interface ObjectiveParticipationInput {
  takedowns: ParticipantObjectiveTakedowns | undefined;
  teamKills: TeamNeutralObjectiveKills | undefined;
  /** Contexto da observação, repassado pra proveniência quando conhecido. */
  patch?: string;
  observedAt?: string;
}

function isCount(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function unavailable(reason: string, consideredValue?: Partial<ObjectiveParticipationObservation>): ObjectiveParticipationObservation {
  return {
    value: null,
    status: "UNAVAILABLE",
    personalTakedowns: null,
    teamObjectives: null,
    consideredObjectives: CONSIDERED_NEUTRAL_OBJECTIVES,
    unavailableReason: reason,
    ...consideredValue
  };
}

/**
 * Calcula a observação de uma partida. Pura, sem I/O.
 *
 * Cada guarda existe por um motivo distinto e todas devolvem
 * indisponibilidade em vez de um número:
 *
 * - **Sem `challenges`**: patch antigo. Não se sabe quantos objetivos o
 *   jogador acompanhou; `0` afirmaria que ele não acompanhou nenhum.
 * - **Um dos dois campos ausente**: a soma seria de um subconjunto
 *   desconhecido, e o denominador continuaria contando os dois tipos - o
 *   percentual sairia sistematicamente subestimado. Não há como interpretar
 *   isso honestamente, então é indisponível, não parcial.
 * - **Sem os objetivos do time**: não há denominador.
 * - **Time com zero objetivos neutros**: a razão não existe. `0%` diria
 *   "não participou de nada", quando não houve nada de que participar.
 */
export function computeObjectiveParticipation(
  input: ObjectiveParticipationInput
): ObjectiveParticipationObservation {
  const { takedowns, teamKills } = input;

  if (!takedowns) {
    return unavailable("A partida não traz o objeto `challenges` (patch anterior ao campo).");
  }

  const dragon = takedowns.dragonTakedowns;
  const baron = takedowns.baronTakedowns;
  if (!isCount(dragon) || !isCount(baron)) {
    return unavailable(
      "A partida traz só parte das participações em objetivos - somar um subconjunto contra o total do time subestimaria o percentual."
    );
  }

  const personalTakedowns = dragon + baron;

  if (!teamKills) {
    return unavailable("A partida não traz os objetivos conquistados pelo time do jogador.", {
      personalTakedowns
    });
  }

  const teamDragon = teamKills.dragonKills;
  const teamBaron = teamKills.baronKills;
  if (!isCount(teamDragon) || !isCount(teamBaron)) {
    return unavailable("Os objetivos do time do jogador vieram incompletos.", { personalTakedowns });
  }

  const teamObjectives = teamDragon + teamBaron;

  if (teamObjectives === 0) {
    return unavailable("O time não conquistou nenhum dragão ou barão - não há denominador para a razão.", {
      personalTakedowns,
      teamObjectives
    });
  }

  const provenance: DataProvenance = {
    // O percentual é conta do Sparta; os dois números que entram nele são
    // oficiais. `resource` registra de onde o dado bruto veio.
    sourceType: "CALCULATED",
    sourceId: "riot",
    resource: "match-v5:challenges+teams.objectives",
    algorithmVersion: OBJECTIVE_PARTICIPATION_ALGORITHM_VERSION,
    patch: input.patch,
    collectedAt: input.observedAt
  };

  const base: ObjectiveParticipationObservation = {
    value: personalTakedowns / teamObjectives,
    status: "AVAILABLE",
    personalTakedowns,
    teamObjectives,
    consideredObjectives: CONSIDERED_NEUTRAL_OBJECTIVES,
    provenance
  };

  /**
   * Não deve acontecer com dragão e barão (0 ocorrências em 220
   * participantes reais), mas se acontecer o valor **não é** truncado: o
   * número sai como está e a observação é marcada, pra a anomalia aparecer
   * em vez de ser escondida por um `Math.min`.
   */
  if (personalTakedowns > teamObjectives) {
    return {
      ...base,
      status: "PARTIAL",
      partialReason: `Participações (${personalTakedowns}) excedem os objetivos do time (${teamObjectives}) - contabilidade divergente no payload.`
    };
  }

  return base;
}
