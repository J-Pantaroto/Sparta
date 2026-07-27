import { describe, expect, it } from "vitest";
import { ExternalServiceError, externalErrorPayload } from "@sparta/riot";
import { safeExternalErrorLog, statusForExternalError } from "./external-error-response.js";

describe("external error response", () => {
  it.each([
    ["RIOT_CREDENTIAL_INVALID", 503],
    ["RIOT_RATE_LIMITED", 429],
    ["UPSTREAM_NOT_FOUND", 404],
    ["REQUEST_TIMEOUT", 504],
    ["NETWORK_UNAVAILABLE", 502]
  ] as const)("mapeia %s para HTTP %s", (code, status) => {
    const error = new ExternalServiceError({
      code,
      integration: "RIOT_API",
      message: "controlada",
      temporary: true,
      retryable: false
    });
    expect(statusForExternalError(error)).toBe(status);
  });

  it("payload e log nao vazam URL, token, payload nem stack da causa", () => {
    const cause = Object.assign(new Error("https://secret.invalid?token=abc payload=user"), { code: "ECONNRESET" });
    const error = new ExternalServiceError({
      code: "NETWORK_UNAVAILABLE",
      integration: "RIOT_API",
      message: "controlada",
      temporary: true,
      retryable: true,
      cause
    });
    const serialized = JSON.stringify({ payload: externalErrorPayload(error), log: safeExternalErrorLog(error) });
    expect(serialized).not.toContain("secret.invalid");
    expect(serialized).not.toContain("token=abc");
    expect(serialized).not.toContain("payload=user");
    expect(serialized).not.toContain("stack");
    expect(serialized).toContain("ECONNRESET");
  });
});
