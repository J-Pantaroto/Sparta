import { describe, expect, it } from "vitest";
import { loadEnv } from "../../config/env.js";
import {
  assertProductionEmailProvider,
  InMemoryTransactionalEmailProvider,
  unavailableEmailProvider
} from "./email-provider.js";

describe("provider transacional", () => {
  it("falha o boot de producao sem implementacao realmente configurada", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://db.internal:5432/sparta",
      PUBLIC_API_URL: "https://api.example.com",
      CORS_ALLOWED_ORIGINS: "https://app.example.com",
      TRUST_PROXY_HOPS: "1",
      AUTH_TOKEN_SECRET: "a-production-secret-with-32-characters-minimum",
      RIOT_API_KEY: "production-key",
      IDENTITY_MODE: "RSO_REQUIRED",
      RSO_ENABLED: "false",
      EMAIL_PROVIDER_MODE: "EXTERNAL",
      EMAIL_VERIFICATION_FROM: "access@example.com",
      EMAIL_VERIFICATION_URL_BASE: "https://app.example.com/verify-email"
    });
    expect(() => assertProductionEmailProvider(env, unavailableEmailProvider)).toThrow(
      /EMAIL_PROVIDER_CONFIGURATION_REQUIRED/
    );
  });

  it("mantem o provider em memoria restrito a testes e desenvolvimento", () => {
    const provider = new InMemoryTransactionalEmailProvider();
    expect(provider.isConfigured()).toBe(true);
  });
});
