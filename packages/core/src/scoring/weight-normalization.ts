/**
 * Normalização de pesos quando parte dos sinais não tem dado.
 *
 * Extraído de `normalizeAvailableWeights` (Etapa 3, motor de draft) pra ser
 * o **único** mecanismo do projeto: o scoring de campeão precisa
 * exatamente da mesma regra, e reimplementá-la lá criaria duas versões da
 * mesma decisão, que é justamente o que o contrato de disponibilidade
 * existe pra evitar.
 *
 * A regra: peso de sinal sem dado sai do cálculo e é redistribuído
 * proporcionalmente entre os que têm — a nota continua na escala 0-100 sem
 * que a ausência entre como `0` (que puniria) nem como neutro inventado
 * (que fingiria evidência). Peso que já era zero no cenário continua zero.
 */
export interface NormalizedWeights<K extends string> {
  normalizedWeights: Record<K, number>;
  /**
   * Soma dos pesos **originais** cujos sinais têm dado. Mede quanto do
   * modelo previsto de fato participou — deliberadamente separado de
   * confiança estatística, que é outra coisa.
   */
  dataCoverage: number;
}

export function normalizeWeightsByAvailability<K extends string>(
  weights: Record<K, number>,
  isAvailable: (key: K) => boolean
): NormalizedWeights<K> {
  const keys = Object.keys(weights) as K[];

  const dataCoverage = keys.reduce((sum, key) => sum + (weights[key] > 0 && isAvailable(key) ? weights[key] : 0), 0);

  const normalizedWeights = keys.reduce(
    (result, key) => {
      result[key] = weights[key] > 0 && isAvailable(key) && dataCoverage > 0 ? weights[key] / dataCoverage : 0;
      return result;
    },
    {} as Record<K, number>
  );

  return { normalizedWeights, dataCoverage };
}
