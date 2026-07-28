import type { DataProvenance } from "./provenance.js";

/**
 * Fato de catálogo separado do `ChampionTag.difficulty`.
 *
 * `ChampionTag.difficulty` pertence ao perfil estratégico derivável e pode
 * receber curadoria. Este contrato preserva especificamente o
 * `info.difficulty` publicado pela Data Dragon, sem misturar os conceitos.
 */
export interface ChampionDifficultyEvidence {
  /** Valor original da Data Dragon, na escala 0-10. */
  originalValue: number;
  originalScale: {
    min: 0;
    max: 10;
  };
  /** Valor 0-100 obtido pela normalização versionada do Sparta. */
  normalizedValue: number;
  normalizationAlgorithmVersion: string;
  /** Proveniência do valor original, não da interpretação do Sparta. */
  provenance: DataProvenance;
}
