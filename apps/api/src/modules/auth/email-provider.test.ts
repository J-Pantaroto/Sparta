import { describe, expect, it } from "vitest";
import { loadEnv } from "../../config/env.js";
import {
  assertProductionEmailProvider,
  defaultEmailProviderForEnvironment,
  InMemoryTransactionalEmailProvider,
  unavailableEmailProvider
} from "./email-provider.js";

const baseProductionEnv = {
  NODE_ENV: "production" as const,
  DATABASE_URL: "postgresql://db.internal:5432/sparta",
  PUBLIC_API_URL: "https://api.example.com",
  CORS_ALLOWED_ORIGINS: "https://app.example.com",
  TRUST_PROXY_HOPS: "1",
  AUTH_TOKEN_SECRET: "a-production-secret-with-32-characters-minimum",
  RIOT_API_KEY: "production-key",
  IDENTITY_MODE: "RSO_REQUIRED" as const,
  RSO_ENABLED: "false",
  EMAIL_PROVIDER_MODE: "EXTERNAL" as const,
  EMAIL_PROVIDER_API_KEY: "re_test_key_not_real",
  EMAIL_VERIFICATION_FROM: "access@example.com",
  EMAIL_VERIFICATION_URL_BASE: "https://app.example.com/verify-email",
  PASSWORD_RESET_URL_BASE: "https://app.example.com/reset-password"
};

describe("provider transacional", () => {
  it("falha o boot de producao sem implementacao realmente configurada", () => {
    const env = loadEnv(baseProductionEnv);
    expect(() => assertProductionEmailProvider(env, unavailableEmailProvider)).toThrow(
      /EMAIL_PROVIDER_CONFIGURATION_REQUIRED/
    );
  });

  it("mantem o provider em memoria restrito a testes e desenvolvimento", () => {
    const provider = new InMemoryTransactionalEmailProvider();
    expect(provider.isConfigured()).toBe(true);
  });

  it("recusa boot de producao sem EMAIL_PROVIDER_API_KEY mesmo com modo EXTERNAL declarado", () => {
    const withoutKey = { ...baseProductionEnv, EMAIL_PROVIDER_API_KEY: "" };
    expect(() => loadEnv(withoutKey)).toThrow(/EMAIL_PROVIDER_API_KEY/);
  });

  it("recusa boot de producao sem PASSWORD_RESET_URL_BASE HTTPS explicita", () => {
    const withoutBase = { ...baseProductionEnv, PASSWORD_RESET_URL_BASE: "http://spartagg.com.br/reset-password" };
    expect(() => loadEnv(withoutBase)).toThrow(/PASSWORD_RESET_URL_BASE/);
  });

  it("constroi o provider real (Resend) quando EXTERNAL esta configurado", () => {
    const env = loadEnv(baseProductionEnv);
    const provider = defaultEmailProviderForEnvironment(env);
    expect(provider.name).toBe("RESEND");
    expect(provider.isConfigured()).toBe(true);
  });

  it("cai para indisponivel quando EXTERNAL esta declarado mas sem chave", () => {
    const env = loadEnv({ NODE_ENV: "development", EMAIL_PROVIDER_MODE: "EXTERNAL" });
    const provider = defaultEmailProviderForEnvironment(env);
    expect(provider.name).toBe("UNCONFIGURED");
  });
});
