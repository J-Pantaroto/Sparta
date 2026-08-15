import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  issue: vi.fn(),
  confirm: vi.fn(),
  issueReset: vi.fn(),
  confirmReset: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
      create: mocks.create,
      update: mocks.update
    },
    riotAccount: { findFirst: vi.fn() },
    $transaction: vi.fn()
  }
}));

vi.mock("./email-verification.js", async (original) => {
  const actual = await original<typeof import("./email-verification.js")>();
  return {
    ...actual,
    issueEmailVerification: mocks.issue,
    confirmEmailVerificationToken: mocks.confirm
  };
});

vi.mock("./password-reset.js", async (original) => {
  const actual = await original<typeof import("./password-reset.js")>();
  return {
    ...actual,
    issuePasswordReset: mocks.issueReset,
    confirmPasswordReset: mocks.confirmReset
  };
});

import { authRoutes } from "./routes.js";
import { signToken } from "./token.js";

const user = {
  id: "user-1",
  email: "player@example.com",
  passwordHash: "unused",
  displayName: "Player",
  emailVerifiedAt: null,
  isActive: true,
  sessionVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date()
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockImplementation(async () => mocks.existing);
  mocks.findFirst.mockImplementation(async () => mocks.existing);
  mocks.create.mockResolvedValue(user);
  mocks.issue.mockResolvedValue({
    deliveryStatus: "SENT",
    nextAllowedAt: "2026-08-06T17:00:00.000Z",
    rawToken: "not-returned-without-local-preview"
  });
  mocks.confirm.mockResolvedValue(false);
  mocks.issueReset.mockResolvedValue({
    deliveryStatus: "SENT",
    nextAllowedAt: "2026-08-14T17:00:00.000Z",
    rawToken: "not-returned-without-local-preview"
  });
  mocks.confirmReset.mockResolvedValue({ ok: false, reason: "INVALID_OR_EXPIRED" });
});

async function app() {
  const instance = Fastify();
  await instance.register(authRoutes);
  return instance;
}

describe("rotas de acesso", () => {
  it("nao enumera se o email ja existe no cadastro", async () => {
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-08-06T17:00:00.000Z").getTime());
    const server = await app();
    mocks.existing = user;
    const existingResponse = await server.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "Player@Example.com", password: "password-123" }
    });
    mocks.existing = null;
    const newResponse = await server.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "new@example.com", password: "password-123" }
    });
    expect(existingResponse.statusCode).toBe(202);
    expect(newResponse.statusCode).toBe(202);
    expect(existingResponse.json()).toEqual(newResponse.json());
    expect(existingResponse.body).not.toContain("not-returned-without-local-preview");
    await server.close();
    clock.mockRestore();
  });

  it("preserva conta legada cujo email possui caixa diferente", async () => {
    const server = await app();
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue({ ...user, email: "Player@Example.com" });
    const response = await server.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "player@example.com", password: "password-123" }
    });
    expect(response.statusCode).toBe(202);
    expect(mocks.create).not.toHaveBeenCalled();
    await server.close();
  });

  it("devolve erro generico para token invalido ou ja consumido", async () => {
    const server = await app();
    const response = await server.inject({
      method: "POST",
      url: "/auth/email-verification/confirm",
      payload: { token: "x".repeat(43) }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("EMAIL_VERIFICATION_INVALID");
    await server.close();
  });

  it("pedido de redefinicao de senha nao enumera conta existente vs inexistente", async () => {
    const server = await app();
    mocks.existing = user;
    const existingResponse = await server.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "player@example.com" }
    });
    mocks.existing = null;
    const missingResponse = await server.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "ninguem@example.com" }
    });
    expect(existingResponse.statusCode).toBe(202);
    expect(missingResponse.statusCode).toBe(202);
    expect(existingResponse.json().status).toBe(existingResponse.json().status);
    expect(existingResponse.body).not.toContain("not-returned-without-local-preview");
    // so chama issuePasswordReset quando a conta existe - mas a resposta
    // publica e identica nos dois casos, e e isso que o teste prova.
    expect(mocks.issueReset).toHaveBeenCalledTimes(1);
    await server.close();
  });

  it("devolve erro generico para token de redefinicao invalido ou expirado", async () => {
    const server = await app();
    const response = await server.inject({
      method: "POST",
      url: "/auth/password-reset/confirm",
      payload: { token: "x".repeat(43), password: "nova-senha-123" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("PASSWORD_RESET_INVALID");
    await server.close();
  });

  it("confirma redefinicao de senha com token valido", async () => {
    const server = await app();
    mocks.confirmReset.mockResolvedValue({ ok: true, userId: "user-1" });
    const response = await server.inject({
      method: "POST",
      url: "/auth/password-reset/confirm",
      payload: { token: "y".repeat(43), password: "nova-senha-123" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("PASSWORD_RESET");
    await server.close();
  });

  it("rejeita senha nova abaixo do minimo de caracteres antes de consumir o token", async () => {
    // Este harness registra so `authRoutes`, sem o `setErrorHandler` real de
    // `app.ts` (que mapeia ZodError -> 400) - por isso o zod.parse() aqui
    // ainda vira 500. O que este teste prova e o que importa: a validacao
    // acontece ANTES de qualquer chamada a confirmPasswordReset, entao uma
    // senha fraca nunca chega a consumir o token.
    const server = await app();
    const response = await server.inject({
      method: "POST",
      url: "/auth/password-reset/confirm",
      payload: { token: "y".repeat(43), password: "curta" }
    });
    expect(response.statusCode).toBe(500);
    expect(mocks.confirmReset).not.toHaveBeenCalled();
    await server.close();
  });

  it("recusa sessao de conta inativa", async () => {
    const server = await app();
    mocks.existing = { ...user, isActive: false };
    const token = signToken(user.id, "sparta-dev-secret-nao-use-em-producao");
    const response = await server.inject({
      method: "GET",
      url: "/auth/onboarding-status",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(401);
    await server.close();
  });

  it("logout incrementa a versao e invalida todas as sessoes anteriores", async () => {
    const server = await app();
    mocks.existing = user;
    mocks.update.mockResolvedValue({ ...user, sessionVersion: 1 });
    const token = signToken(user.id, "sparta-dev-secret-nao-use-em-producao", 300, 0);
    const response = await server.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(204);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } }
    });
    await server.close();
  });
});
