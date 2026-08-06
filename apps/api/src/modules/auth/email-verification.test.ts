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
    emailVerifiedAt: null as Date | null
  }
}));

const tx = {
  emailVerificationToken: {
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
    update: vi.fn(async ({ data }: { data: { emailVerifiedAt: Date } }) => {
      state.user.emailVerifiedAt = data.emailVerifiedAt;
      return state.user;
    })
  }
};

vi.mock("../../db/prisma.js", () => ({
  prisma: { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) }
}));

import { loadEnv } from "../../config/env.js";
import { InMemoryTransactionalEmailProvider } from "./email-provider.js";
import {
  confirmEmailVerificationToken,
  hashEmailVerificationToken,
  issueEmailVerification
} from "./email-verification.js";

const env = loadEnv({ NODE_ENV: "test" });

beforeEach(() => {
  state.tokens.length = 0;
  state.user.email = "player@example.com";
  state.user.isActive = true;
  state.user.emailVerifiedAt = null;
  vi.clearAllMocks();
});

describe("confirmacao de email", () => {
  it("persiste somente o hash e consome o token uma unica vez", async () => {
    const provider = new InMemoryTransactionalEmailProvider();
    const issued = await issueEmailVerification({ user: state.user, provider, env });

    expect(issued.deliveryStatus).toBe("SENT");
    expect(issued.rawToken).toBeTruthy();
    expect(state.tokens[0]?.tokenHash).toBe(hashEmailVerificationToken(issued.rawToken!));
    expect(JSON.stringify(state.tokens[0])).not.toContain(issued.rawToken!);
    expect(provider.messages).toHaveLength(1);

    expect(await confirmEmailVerificationToken(issued.rawToken!)).toBe(true);
    expect(await confirmEmailVerificationToken(issued.rawToken!)).toBe(false);
    expect(state.user.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("recusa token expirado sem verificar a conta", async () => {
    const issued = await issueEmailVerification({
      user: state.user,
      provider: new InMemoryTransactionalEmailProvider(),
      env,
      now: new Date("2026-08-06T12:00:00.000Z")
    });
    const afterExpiry = new Date("2026-08-06T12:31:00.000Z");
    expect(await confirmEmailVerificationToken(issued.rawToken!, afterExpiry)).toBe(false);
    expect(state.user.emailVerifiedAt).toBeNull();
  });

  it("revoga o token anterior ao emitir um novo", async () => {
    const provider = new InMemoryTransactionalEmailProvider();
    const first = await issueEmailVerification({
      user: state.user,
      provider,
      env,
      now: new Date("2026-08-06T12:00:00.000Z")
    });
    const second = await issueEmailVerification({
      user: state.user,
      provider,
      env,
      now: new Date("2026-08-06T12:02:00.000Z")
    });
    expect(state.tokens[0]?.revokedAt).toEqual(new Date("2026-08-06T12:02:00.000Z"));
    const confirmationTime = new Date("2026-08-06T12:03:00.000Z");
    expect(await confirmEmailVerificationToken(first.rawToken!, confirmationTime)).toBe(false);
    expect(await confirmEmailVerificationToken(second.rawToken!, confirmationTime)).toBe(true);
  });

  it("aplica cooldown de reenvio sem criar outro token", async () => {
    const provider = new InMemoryTransactionalEmailProvider();
    await issueEmailVerification({
      user: state.user,
      provider,
      env,
      now: new Date("2026-08-06T12:00:00.000Z")
    });
    const retry = await issueEmailVerification({
      user: state.user,
      provider,
      env,
      now: new Date("2026-08-06T12:00:30.000Z")
    });
    expect(retry.deliveryStatus).toBe("COOLDOWN");
    expect(state.tokens).toHaveLength(1);
    expect(provider.messages).toHaveLength(1);
  });
});
