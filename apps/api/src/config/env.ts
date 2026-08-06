import { z } from "zod";

const DEV_AUTH_TOKEN_SECRET = "sparta-dev-secret-nao-use-em-producao";

const booleanFromString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}, z.boolean());

const optionalEmail = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().email().optional()
);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  API_HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("postgresql://sparta:sparta@localhost:5432/sparta"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  RIOT_API_KEY: z.string().optional(),
  IDENTITY_MODE: z.enum(["LOCAL_CONTROLLED", "TEST", "RSO_REQUIRED"]).optional(),
  RSO_ENABLED: booleanFromString.default(false),
  RSO_CLIENT_ID: z.string().optional(),
  RSO_REDIRECT_URI: z.string().url().optional(),
  LOCAL_RIOT_LINK_ENABLED: booleanFromString.default(false),
  EMAIL_PROVIDER_MODE: z.enum(["UNCONFIGURED", "IN_MEMORY", "EXTERNAL"]).optional(),
  EMAIL_VERIFICATION_FROM: optionalEmail,
  EMAIL_VERIFICATION_URL_BASE: z.string().url().default("http://localhost:5173/verify-email"),
  EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1_440).default(30),
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3_600)
    .default(60),
  EMAIL_VERIFICATION_MAX_PER_HOUR: z.coerce.number().int().min(1).max(20).default(5),
  LOCAL_EMAIL_PREVIEW_ENABLED: booleanFromString.default(false),
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
export type ResolvedEnv = Omit<Env, "IDENTITY_MODE" | "EMAIL_PROVIDER_MODE"> & {
  IDENTITY_MODE: "LOCAL_CONTROLLED" | "TEST" | "RSO_REQUIRED";
  EMAIL_PROVIDER_MODE: "UNCONFIGURED" | "IN_MEMORY" | "EXTERNAL";
};

export function loadEnv(input = process.env): ResolvedEnv {
  const parsed = envSchema.parse(input);
  const env = {
    ...parsed,
    IDENTITY_MODE:
      parsed.IDENTITY_MODE ??
      (parsed.NODE_ENV === "production"
        ? "RSO_REQUIRED"
        : parsed.NODE_ENV === "test"
          ? "TEST"
          : "LOCAL_CONTROLLED"),
    EMAIL_PROVIDER_MODE:
      parsed.EMAIL_PROVIDER_MODE ?? (parsed.NODE_ENV === "test" ? "IN_MEMORY" : "UNCONFIGURED")
  } as ResolvedEnv;
  if (env.NODE_ENV === "production") {
    if (env.IDENTITY_MODE !== "RSO_REQUIRED") {
      throw new Error("IDENTITY_MODE deve ser RSO_REQUIRED em producao.");
    }
    if (
      env.RSO_ENABLED &&
      (!env.RSO_CLIENT_ID ||
        /[<>]/.test(env.RSO_CLIENT_ID) ||
        !env.RSO_REDIRECT_URI?.startsWith("https://") ||
        /[<>]/.test(env.RSO_REDIRECT_URI))
    ) {
      throw new Error(
        "RSO_CLIENT_ID e RSO_REDIRECT_URI HTTPS sao obrigatorios quando RSO esta habilitado."
      );
    }
    if (env.LOCAL_RIOT_LINK_ENABLED || env.LOCAL_EMAIL_PREVIEW_ENABLED) {
      throw new Error("Modos locais de identidade e email nao podem ser habilitados em producao.");
    }
    if (
      !Object.prototype.hasOwnProperty.call(input, "EMAIL_PROVIDER_MODE") ||
      env.EMAIL_PROVIDER_MODE !== "EXTERNAL" ||
      !env.EMAIL_VERIFICATION_FROM ||
      /[<>]/.test(env.EMAIL_VERIFICATION_FROM) ||
      !Object.prototype.hasOwnProperty.call(input, "EMAIL_VERIFICATION_URL_BASE") ||
      !env.EMAIL_VERIFICATION_URL_BASE.startsWith("https://") ||
      /[<>]/.test(env.EMAIL_VERIFICATION_URL_BASE)
    ) {
      throw new Error(
        "Provider, remetente e URL HTTPS de verificacao de email sao obrigatorios em producao."
      );
    }
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
