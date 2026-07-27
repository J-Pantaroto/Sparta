import { z } from "zod";

const roleSchema = z.enum(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);

export const draftPickSchema = z.object({
  championId: z.number(),
  championName: z.string(),
  // Aliado/inimigo sem posicao atribuida pela fila e um caso normal.
  role: roleSchema.optional(),
  team: z.enum(["ally", "enemy"]),
  isPlayer: z.boolean().optional()
});

export const draftStateSchema = z.object({
  // Opcional no schema, barrado na rota com PLAYER_ROLE_UNAVAILABLE: o
  // request precisa poder expressar "ainda nao identificada" pra a API
  // responder isso, em vez de o cliente ser obrigado a inventar um valor.
  playerRole: roleSchema.optional(),
  pickOrder: z.number().min(1).max(5),
  allies: z.array(draftPickSchema),
  enemies: z.array(draftPickSchema),
  bannedChampionIds: z.array(z.number()),
  enemyLaneChampionId: z.number().optional(),
  selectedChampionId: z.number().optional(),
  patch: z.string().optional()
});

export const draftRecommendationRequestSchema = z.object({
  draft: draftStateSchema
});

// Mesmo formato do request de recomendacao: a analise pre-game le o mesmo
// DraftState. O que ela exige a mais (campeao confirmado) e barrado na rota
// com SELECTED_CHAMPION_UNAVAILABLE, nao aqui - "ainda nao confirmei campeao"
// precisa poder ser expresso no request pra a API responder isso.
export const preGameAnalysisRequestSchema = z.object({
  draft: draftStateSchema
});
