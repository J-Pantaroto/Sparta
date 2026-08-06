import { describe, expect, it } from "vitest";
import { loadEnv, parseAllowedOrigins } from "./env.js";

const validProduction = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://db.internal:5432/sparta?sslmode=require",
  PUBLIC_API_URL: "https://api.example.com",
  CORS_ALLOWED_ORIGINS: "null,https://app.example.com",
  TRUST_PROXY_HOPS: "1",
  AUTH_TOKEN_SECRET: "a-production-secret-with-32-characters-minimum",
  RIOT_API_KEY: "test-production-key",
  IDENTITY_MODE: "RSO_REQUIRED",
  RSO_ENABLED: "true",
  RSO_CLIENT_ID: "approved-client-id",
  RSO_REDIRECT_URI: "https://api.example.com/auth/riot/rso/callback",
  EMAIL_PROVIDER_MODE: "EXTERNAL",
  EMAIL_VERIFICATION_FROM: "access@example.com",
  EMAIL_VERIFICATION_URL_BASE: "https://app.example.com/verify-email"
};

describe("configuração de produção", () => {
  it("aceita um conjunto explícito sem valores padrão inseguros", () => {
    const env = loadEnv(validProduction);
    expect(env.NODE_ENV).toBe("production");
    expect(env.API_DOCS_ENABLED).toBe(false);
  });

  it.each([
    ["segredo curto", { AUTH_TOKEN_SECRET: "short" }],
    ["URL pública sem HTTPS", { PUBLIC_API_URL: "http://api.example.com" }],
    ["banco que não é PostgreSQL", { DATABASE_URL: "mysql://db/sparta" }],
    ["documentação pública", { API_DOCS_ENABLED: "true" }],
    ["CORS curinga", { CORS_ALLOWED_ORIGINS: "*" }],
    ["placeholder de chave Riot", { RIOT_API_KEY: "<RIOT_API_KEY>" }]
  ])("recusa %s", (_label, override) => {
    expect(() => loadEnv({ ...validProduction, ...override })).toThrow();
  });

  it("exige origem CORS declarada no ambiente de produção", () => {
    const withoutCors = Object.fromEntries(
      Object.entries(validProduction).filter(([key]) => key !== "CORS_ALLOWED_ORIGINS")
    );
    expect(() => loadEnv(withoutCors)).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it("exige chave Riot no ambiente de produção", () => {
    const withoutRiotKey = Object.fromEntries(
      Object.entries(validProduction).filter(([key]) => key !== "RIOT_API_KEY")
    );
    expect(() => loadEnv(withoutRiotKey)).toThrow(/RIOT_API_KEY/);
  });

  it("exige decisão explícita sobre proxy confiável", () => {
    const withoutTrustProxy = Object.fromEntries(
      Object.entries(validProduction).filter(([key]) => key !== "TRUST_PROXY_HOPS")
    );
    expect(() => loadEnv(withoutTrustProxy)).toThrow(/TRUST_PROXY_HOPS/);
  });

  it("impede producao com identidade local", () => {
    expect(() => loadEnv({ ...validProduction, IDENTITY_MODE: "LOCAL_CONTROLLED" })).toThrow(
      /IDENTITY_MODE/
    );
  });

  it("permite RSO ainda indisponivel sem habilitar fallback local", () => {
    const env = loadEnv({ ...validProduction, RSO_ENABLED: "false" });
    expect(env.RSO_ENABLED).toBe(false);
    expect(env.IDENTITY_MODE).toBe("RSO_REQUIRED");
    expect(env.LOCAL_RIOT_LINK_ENABLED).toBe(false);
  });

  it("exige provider transacional real e bloqueia previews locais", () => {
    expect(() => loadEnv({ ...validProduction, EMAIL_PROVIDER_MODE: "IN_MEMORY" })).toThrow(
      /Provider/
    );
    expect(() => loadEnv({ ...validProduction, LOCAL_EMAIL_PREVIEW_ENABLED: "true" })).toThrow(
      /Modos locais/
    );
  });

  it("normaliza a allowlist CORS sem abrir origem curinga", () => {
    expect([...parseAllowedOrigins("null, https://app.example.com, ")]).toEqual([
      "null",
      "https://app.example.com"
    ]);
  });
});

describe("configuração local de email", () => {
  it("aceita remetente vazio quando o provider e somente em memoria", () => {
    const env = loadEnv({
      NODE_ENV: "development",
      EMAIL_PROVIDER_MODE: "IN_MEMORY",
      EMAIL_VERIFICATION_FROM: ""
    });
    expect(env.EMAIL_VERIFICATION_FROM).toBeUndefined();
  });
});
