import { z } from "zod";

const DEV_AUTH_TOKEN_SECRET = "sparta-dev-secret-nao-use-em-producao";

const booleanFromString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}, z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  API_HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("postgresql://sparta:sparta@localhost:5432/sparta"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  RIOT_API_KEY: z.string().optional(),
  RIOT_PLATFORM_REGION: z.string().default("br1"),
  RIOT_REGIONAL_ROUTING: z.string().default("americas"),
  DATA_DRAGON_LOCALE: z.string().default("pt_BR"),
  ANALYZER_URL: z.string().default("http://localhost:8000"),
  PUBLIC_API_URL: z.string().url().optional(),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173,null"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  API_DOCS_ENABLED: booleanFromString.default(false),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  CREDENTIAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
  READINESS_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
  SHUTDOWN_GRACE_PERIOD_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  AUTH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(60 * 60 * 24 * 30)
    .default(60 * 60 * 24 * 30),
  // Segredo usado para assinar os tokens de sessao (HMAC). Troque em producao.
  AUTH_TOKEN_SECRET: z.string().default(DEV_AUTH_TOKEN_SECRET)
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(input = process.env): Env {
  const env = envSchema.parse(input);
  if (env.NODE_ENV === "production") {
    if (
      env.AUTH_TOKEN_SECRET === DEV_AUTH_TOKEN_SECRET ||
      env.AUTH_TOKEN_SECRET === "change_me" ||
      env.AUTH_TOKEN_SECRET.length < 32 ||
      /[<>]/.test(env.AUTH_TOKEN_SECRET)
    ) {
      throw new Error("AUTH_TOKEN_SECRET deve ter ao menos 32 caracteres e ser unico em producao.");
    }
    if (
      !Object.prototype.hasOwnProperty.call(input, "DATABASE_URL") ||
      !/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL) ||
      /[<>]/.test(env.DATABASE_URL)
    ) {
      throw new Error("DATABASE_URL explicita deve usar PostgreSQL em producao.");
    }
    if (!env.PUBLIC_API_URL?.startsWith("https://")) {
      throw new Error("PUBLIC_API_URL deve ser uma URL HTTPS explicita em producao.");
    }
    if (!Object.prototype.hasOwnProperty.call(input, "CORS_ALLOWED_ORIGINS")) {
      throw new Error("CORS_ALLOWED_ORIGINS deve ser declarado explicitamente em producao.");
    }
    const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
    if (allowedOrigins.size === 0 || allowedOrigins.has("*")) {
      throw new Error("CORS_ALLOWED_ORIGINS deve conter uma allowlist sem curinga em producao.");
    }
    if (!Object.prototype.hasOwnProperty.call(input, "TRUST_PROXY_HOPS")) {
      throw new Error("TRUST_PROXY_HOPS deve ser declarado explicitamente em producao.");
    }
    if (env.API_DOCS_ENABLED) {
      throw new Error("API_DOCS_ENABLED deve permanecer false em producao.");
    }
    if (!env.RIOT_API_KEY || env.RIOT_API_KEY === "change_me" || /[<>]/.test(env.RIOT_API_KEY)) {
      throw new Error("RIOT_API_KEY de producao e obrigatoria no ambiente de producao.");
    }
  }
  return env;
}

export function parseAllowedOrigins(value: string): ReadonlySet<string> {
  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}
