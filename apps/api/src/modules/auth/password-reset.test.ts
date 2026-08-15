import { beforeEach, describe, expect, it, vi } from "vitest";

type TokenRow = {
  id: string;
  userId: string;
  emailSnapshot: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
};

type TokenUpdateWhere = {
  id?: string | { not: string };
  userId?: string;
  consumedAt?: Date | null;
  revokedAt?: Date | null;
  expiresAt?: { gt: Date };
};

const state = vi.hoisted(() => ({
  tokens: [] as TokenRow[],
  user: {
    id: "user-1",
    email: "player@example.com" as string | null,
    displayName: "Player" as string | null,
    isActive: true,
    passwordHash: "salt:hash",
    sessionVersion: 0
  }
}));

const tx = {
  passwordResetToken: {
    findMany: vi.fn(async ({ where }: { where: { userId: string; createdAt: { gte: Date } } }) =>
      state.tokens
        .filter((row) => row.userId === where.userId && row.createdAt >= where.createdAt.gte)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    ),
    create: vi.fn(
      async ({
        data
      }: {
        data: Omit<TokenRow, "id" | "createdAt" | "consumedAt" | "revokedAt">;
      }) => {
        const row: TokenRow = {
          ...data,
          id: `token-${state.tokens.length + 1}`,
          createdAt: new Date(data.expiresAt.getTime() - 30 * 60 * 1_000),
          consumedAt: null,
          revokedAt: null
        };
        state.tokens.push(row);
        return row;
      }
    ),
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const row = state.tokens.find((entry) => entry.tokenHash === where.tokenHash);
      return row ? { ...row, user: state.user } : null;
    }),
    updateMany: vi.fn(
      async ({ where, data }: { where: TokenUpdateWhere; data: Partial<TokenRow> }) => {
        let count = 0;
        for (const row of state.tokens) {
          const idMatches =
            where.id === undefined ||
            (typeof where.id === "string" ? row.id === where.id : row.id !== where.id.not);
          const matches =
            idMatches &&
            (where.userId === undefined || row.userId === where.userId) &&
            (where.consumedAt === undefined || row.consumedAt === where.consumedAt) &&
            (where.revokedAt === undefined || row.revokedAt === where.revokedAt) &&
            (where.expiresAt?.gt === undefined || row.expiresAt > where.expiresAt.gt);
          if (matches) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      }
    )
  },
  user: {
    update: vi.fn(
      async ({
        data
      }: {
        data: { passwordHash?: string; sessionVersion?: { increment: number } };
      }) => {
        if (data.passwordHash) state.user.passwordHash = data.passwordHash;
        if (data.sessionVersion) state.user.sessionVersion += data.sessionVersion.increment;
        return state.user;
      }
    )
  }
};

vi.mock("../../db/prisma.js", () => ({
  prisma: { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) }
}));

import { loadEnv } from "../../config/env.js";
import { InMemoryTransactionalEmailProvider } from "./email-provider.js";
import { verifyPassword } from "./password.js";
import {
  confirmPasswordReset,
  hashPasswordResetToken,
  issuePasswordReset
} from "./password-reset.js";

const env = loadEnv({ NODE_ENV: "test" });

beforeEach(() => {
  state.tokens.length = 0;
  state.user.email = "player@example.com";
  state.user.isActive = true;
  state.user.passwordHash = "salt:hash";
  state.user.sessionVersion = 0;
  vi.clearAllMocks();
});

describe("redefinicao de senha", () => {
  it("persiste somente o hash do token, troca a senha e revoga sessoes ao consumir", async () => {
    const provider = new InMemoryTransactionalEmailProvider();
    const issued = await issuePasswordReset({ user: state.user, provider, env });

    expect(issued.deliveryStatus).toBe("SENT");
    expect(issued.rawToken).toBeTruthy();
    expect(state.tokens[0]?.tokenHash).toBe(hashPasswordResetToken(issued.rawToken!));
    expect(JSON.stringify(state.tokens[0])).not.toContain(issued.rawToken!);
    expect(provider.passwordResetMessages).toHaveLength(1);

    const before = state.user.sessionVersion;
    const result = await confirmPasswordReset(issued.rawToken!, "nova-senha-forte");
    expect(result.ok).toBe(true);
    expect(state.user.sessionVersion).toBe(before + 1);
    expect(verifyPassword("nova-senha-forte", state.user.passwordHash)).toBe(true);
    expect(verifyPassword("senha-antiga-qualquer", state.user.passwordHash)).toBe(false);
  });

  it("recusa reutilizacao do mesmo token", async () => {
    const issued = await issuePasswordReset({
      user: state.user,
      provider: new InMemoryTransactionalEmailProvider(),
      env
    });
    expect((await confirmPasswordReset(issued.rawToken!, "primeira-senha-forte")).ok).toBe(true);
    const second = await confirmPasswordReset(issued.rawToken!, "segunda-senha-forte");
    expect(second.ok).toBe(false);
    // a segunda tentativa nao deve ter trocado a senha de novo
    expect(verifyPassword("primeira-senha-forte", state.user.passwordHash)).toBe(true);
  });

  it("recusa token expirado sem tocar a senha", async () => {
    const issued = await issuePasswordReset({
      user: state.user,
      provider: new InMemoryTransactionalEmailProvider(),
      env,
      now: new Date("2026-08-14T12:00:00.000Z")
    });
    const afterExpiry = new Date("2026-08-14T12:31:00.000Z");
    const result = await confirmPasswordReset(issued.rawToken!, "nova-senha-forte", afterExpiry);
    expect(result.ok).toBe(false);
    expect(state.user.passwordHash).toBe("salt:hash");
  });

  it("recusa token invalido/inexistente", async () => {
    const result = await confirmPasswordReset("token-que-nunca-existiu-0000000000000000000", "x");
    expect(result.ok).toBe(false);
  });

  it("revoga o token anterior ao emitir um novo (resend invalida o antigo)", async () => {
    const provider = new InMemoryTransactionalEmailProvider();
    const first = await issuePasswordReset({
      user: state.user,
      provider,
      env,
      now: new Date("2026-08-14T12:00:00.000Z")
    });
    const second = await issuePasswordReset({
      user: state.user,
      provider,
      env,
      now: new Date("2026-08-14T12:02:00.000Z")
    });
    const confirmationTime = new Date("2026-08-14T12:03:00.000Z");
    expect((await confirmPasswordReset(first.rawToken!, "senha-forte-1", confirmationTime)).ok).toBe(
      false
    );
    expect(
      (await confirmPasswordReset(second.rawToken!, "senha-forte-2", confirmationTime)).ok
    ).toBe(true);
  });

  it("aplica cooldown de reenvio sem criar outro token", async () => {
    const provider = new InMemoryTransactionalEmailProvider();
    await issuePasswordReset({
      user: state.user,
      provider,
      env,
      now: new Date("2026-08-14T12:00:00.000Z")
    });
    const retry = await issuePasswordReset({
      user: state.user,
      provider,
      env,
      now: new Date("2026-08-14T12:00:30.000Z")
    });
    expect(retry.deliveryStatus).toBe("COOLDOWN");
    expect(state.tokens).toHaveLength(1);
    expect(provider.passwordResetMessages).toHaveLength(1);
  });

  it("aplica limite por hora depois do numero maximo de emissoes", async () => {
    const provider = new InMemoryTransactionalEmailProvider();
    const base = new Date("2026-08-14T12:00:00.000Z").getTime();
    const cooldownMs = env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1_000;
    for (let i = 0; i < env.PASSWORD_RESET_MAX_PER_HOUR; i += 1) {
      await issuePasswordReset({ user: state.user, provider, env, now: new Date(base + i * cooldownMs) });
    }
    const overLimit = await issuePasswordReset({
      user: state.user,
      provider,
      env,
      now: new Date(base + env.PASSWORD_RESET_MAX_PER_HOUR * cooldownMs)
    });
    expect(overLimit.deliveryStatus).toBe("RATE_LIMITED");
    expect(state.tokens).toHaveLength(env.PASSWORD_RESET_MAX_PER_HOUR);
  });

  it("conta inexistente/sem senha local nao gera token, mas responde como se tivesse", async () => {
    const provider = new InMemoryTransactionalEmailProvider();
    const issued = await issuePasswordReset({
      user: { id: "user-fantasma", email: null, displayName: null, passwordHash: null },
      provider,
      env
    });
    expect(issued.deliveryStatus).toBe("UNAVAILABLE");
    expect(issued.rawToken).toBeUndefined();
    expect(state.tokens).toHaveLength(0);
    expect(provider.passwordResetMessages).toHaveLength(0);
  });

  it("falha do provider nao gera falso SENT - token ainda existe e pode ser reenviado", async () => {
    const failingProvider = {
      name: "FAILING",
      isConfigured: () => true,
      sendEmailVerification: vi.fn(),
      sendPasswordReset: vi.fn(async () => {
        throw new Error("provider indisponivel");
      })
    };
    const issued = await issuePasswordReset({ user: state.user, provider: failingProvider, env });
    expect(issued.deliveryStatus).toBe("UNAVAILABLE");
    // o token foi criado (o usuario pode confirmar se de algum jeito soube o
    // link), mas o provider nunca confirmou entrega - a UI nao pode dizer
    // "enviado" nesse caso.
    expect(state.tokens).toHaveLength(1);
  });

  it("duas tentativas simultaneas do mesmo token: so uma vence", async () => {
    const issued = await issuePasswordReset({
      user: state.user,
      provider: new InMemoryTransactionalEmailProvider(),
      env
    });
    const [first, second] = await Promise.all([
      confirmPasswordReset(issued.rawToken!, "senha-forte-a"),
      confirmPasswordReset(issued.rawToken!, "senha-forte-b")
    ]);
    const results = [first.ok, second.ok];
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
