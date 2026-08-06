import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "./token.js";

describe("auth token", () => {
  it("assina e valida um token corretamente", () => {
    const token = signToken("user-1", "secret");
    const payload = verifyToken(token, "secret");
    expect(payload).toMatchObject({ sub: "user-1", ver: 0 });
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

  it("carrega a versao persistida da sessao", () => {
    const token = signToken("user-1", "secret", 300, 7);
    expect(verifyToken(token, "secret")?.ver).toBe(7);
  });

  it("rejeita segmentos extras anexados a um token valido", () => {
    const token = signToken("user-1", "secret");
    expect(verifyToken(`${token}.extra`, "secret")).toBeNull();
  });
});
