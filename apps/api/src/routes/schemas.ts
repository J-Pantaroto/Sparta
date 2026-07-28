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

/**
 * Identidade da sessao de draft, opcional no request.
 *
 * `sessionKey` e uma chave tecnica gerada pelo cliente **ao entrar** no
 * champion select e descartada ao sair. Nao deriva de campeao nem de horario,
 * entao duas sessoes diferentes nunca colidem e uma entrada nova nunca
 * reaproveita a anterior. Sem ela a analise roda igual e nada e persistido -
 * a persistencia nunca e pre-requisito da recomendacao.
 */
export const draftSessionIdentitySchema = z.object({
  sessionKey: z.string().min(8).max(128),
  source: z.enum(["LCU", "USER"]),
  queueId: z.number().int().optional(),
  gameVersion: z.string().max(40).optional(),
  /** gameId numérico observado pelo LCU; não é um matchId informado à mão. */
  gameId: z.string().regex(/^\d+$/).max(32).optional()
});

export const draftRecommendationRequestSchemaWithSession = z.object({
  draft: draftStateSchema,
  session: draftSessionIdentitySchema.optional()
});

export const draftSessionLockInSchema = z.object({
  championId: z.number().int().positive()
});

export const draftSessionTransitionSchema = z.object({
  // COMPLETED é reservado ao reconciliador e nunca é aceito do desktop.
  status: z.enum(["IN_GAME", "ABANDONED", "COMPLETED"])
});

export const draftSessionObservedGameSchema = z.object({
  gameId: z.string().regex(/^\d+$/).max(32)
});
