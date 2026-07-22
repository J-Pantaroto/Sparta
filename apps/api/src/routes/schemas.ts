import { z } from "zod";

const roleSchema = z.enum(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);

export const draftPickSchema = z.object({
  championId: z.number(),
  championName: z.string(),
  role: roleSchema,
  team: z.enum(["ally", "enemy"]),
  isPlayer: z.boolean().optional()
});

export const draftStateSchema = z.object({
  playerRole: roleSchema,
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
