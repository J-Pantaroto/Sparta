import type { ResolvedEnv } from "../../config/env.js";

export interface EmailVerificationMessage {
  to: string;
  displayName: string | null;
  verificationUrl: string;
  expiresAt: string;
}

export interface TransactionalEmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  sendEmailVerification(input: EmailVerificationMessage): Promise<void>;
}

export const unavailableEmailProvider: TransactionalEmailProvider = {
  name: "UNCONFIGURED",
  isConfigured: () => false,
  async sendEmailVerification() {
    throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  }
};

/** Provider observavel apenas por testes/desenvolvimento explicitamente configurado. */
export class InMemoryTransactionalEmailProvider implements TransactionalEmailProvider {
  readonly name = "IN_MEMORY";
  readonly messages: EmailVerificationMessage[] = [];

  isConfigured(): boolean {
    return true;
  }

  async sendEmailVerification(input: EmailVerificationMessage): Promise<void> {
    this.messages.push(globalThis.structuredClone(input));
  }
}

export function defaultEmailProviderForEnvironment(env: ResolvedEnv): TransactionalEmailProvider {
  if (env.NODE_ENV !== "production" && env.EMAIL_PROVIDER_MODE === "IN_MEMORY") {
    return new InMemoryTransactionalEmailProvider();
  }
  return unavailableEmailProvider;
}

export function assertProductionEmailProvider(
  env: ResolvedEnv,
  provider: TransactionalEmailProvider
): void {
  if (env.NODE_ENV === "production" && !provider.isConfigured()) {
    throw new Error("EMAIL_PROVIDER_CONFIGURATION_REQUIRED");
  }
}
