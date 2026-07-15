import { z } from "zod";

const DEV_AUTH_TOKEN_SECRET = "sparta-dev-secret-nao-use-em-producao";

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
  ANALYZER_URL: z.string().default("http://localhost:8000"),
  // Segredo usado para assinar os tokens de sessao (HMAC). Troque em producao.
  AUTH_TOKEN_SECRET: z.string().default(DEV_AUTH_TOKEN_SECRET)
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(input = process.env): Env {
  const env = envSchema.parse(input);
  if (env.NODE_ENV === "production" && env.AUTH_TOKEN_SECRET === DEV_AUTH_TOKEN_SECRET) {
    throw new Error(
      "AUTH_TOKEN_SECRET nao pode usar o valor padrao de desenvolvimento em producao. " +
        "Defina um segredo forte e unico na variavel de ambiente AUTH_TOKEN_SECRET."
    );
  }
  return env;
}
