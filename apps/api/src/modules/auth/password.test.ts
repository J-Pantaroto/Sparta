import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("auth password", () => {
  it("verifica a senha correta apos o hash", () => {
    const hash = hashPassword("super-secreta-123");
    expect(verifyPassword("super-secreta-123", hash)).toBe(true);
  });

  it("rejeita senha incorreta", () => {
    const hash = hashPassword("super-secreta-123");
    expect(verifyPassword("outra-senha", hash)).toBe(false);
  });

  it("gera hashes diferentes para a mesma senha (salt aleatorio)", () => {
    expect(hashPassword("repita-comigo")).not.toBe(hashPassword("repita-comigo"));
  });
});
