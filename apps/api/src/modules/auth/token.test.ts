import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "./token";

describe("auth token", () => {
  it("assina e valida um token corretamente", () => {
    const token = signToken("user-1", "secret");
    const payload = verifyToken(token, "secret");
    expect(payload?.sub).toBe("user-1");
  });

  it("rejeita token assinado com segredo diferente", () => {
    const token = signToken("user-1", "secret-a");
    expect(verifyToken(token, "secret-b")).toBeNull();
  });

  it("rejeita token expirado", () => {
    const token = signToken("user-1", "secret", -10);
    expect(verifyToken(token, "secret")).toBeNull();
  });

  it("rejeita token malformado", () => {
    expect(verifyToken("token-invalido", "secret")).toBeNull();
  });
});
