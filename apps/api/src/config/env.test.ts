import { describe, expect, it } from "vitest";
import { loadEnv, parseAllowedOrigins } from "./env.js";

const validProduction = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://db.internal:5432/sparta?sslmode=require",
  PUBLIC_API_URL: "https://api.example.com",
  CORS_ALLOWED_ORIGINS: "null,https://app.example.com",
  TRUST_PROXY_HOPS: "1",
  AUTH_TOKEN_SECRET: "a-production-secret-with-32-characters-minimum",
  RIOT_API_KEY: "test-production-key"
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

  it("normaliza a allowlist CORS sem abrir origem curinga", () => {
    expect([...parseAllowedOrigins("null, https://app.example.com, ")]).toEqual([
      "null",
      "https://app.example.com"
    ]);
  });
});
