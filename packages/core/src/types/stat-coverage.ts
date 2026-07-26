import type { StatCoverage } from "./domain.js";

/**
 * Construtores de `StatCoverage`, no mesmo espírito dos construtores de
 * `RecommendationMetric` (Etapa 2): a cobertura é montada por função, não à
 * mão, pra o invariante "indisponível não tem observação válida" não
 * depender de quem escreve o objeto lembrar dele.
 */

/** Todas as partidas do contexto tinham o dado. */
export function availableCoverage(sampleSize: number): StatCoverage {
  return { sampleSize, availableSampleSize: sampleSize, status: "AVAILABLE" };
}

/**
 * Parte das partidas tinha o dado. `availableSampleSize` é o denominador
 * real da média - o total continua exposto pra deixar a lacuna visível.
 */
export function partialCoverage(sampleSize: number, availableSampleSize: number): StatCoverage {
  return {
    sampleSize,
    availableSampleSize,
    status: "PARTIAL",
    reason: `Calculado com ${availableSampleSize} de ${sampleSize} partidas - as demais não trazem esse dado.`
  };
}

/** Nenhuma observação válida. Quem usa isto não deve ter valor pra exibir. */
export function unavailableCoverage(sampleSize: number, reason: string): StatCoverage {
  return { sampleSize, availableSampleSize: 0, status: "UNAVAILABLE", reason };
}

/**
 * Valor conhecido, cobertura não. É o caso das linhas gravadas antes de o
 * Sparta contar a amostra por campo: afirmar `availableSampleSize: 0` ali
 * seria dizer "nenhuma partida tinha o dado", o que contradiz o próprio
 * valor existir.
 */
export function unknownCoverage(sampleSize: number): StatCoverage {
  return {
    sampleSize,
    availableSampleSize: null,
    status: "AVAILABLE",
    reason: "Cobertura desconhecida: agregado gravado antes de o Sparta registrar a amostra por campo."
  };
}
