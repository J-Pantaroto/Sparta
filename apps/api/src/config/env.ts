import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(3333),
  API_HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("postgresql://sparta:sparta@localhost:5432/sparta"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  RIOT_API_KEY: z.string().optional(),
  RIOT_PLATFORM_REGION: z.string().default("br1"),
  RIOT_REGIONAL_ROUTING: z.string().default("americas"),
  DATA_DRAGON_LOCALE: z.string().default("pt_BR"),
  ANALYZER_URL: z.string().default("http://localhost:8000")
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(input = process.env): Env {
  return envSchema.parse(input);
}
