import { ExternalServiceError, HTTP_TIMEOUTS, fetchWithPolicy } from "@sparta/riot/http";
import {
  renderEmailVerificationMessage,
  renderPasswordResetMessage
} from "./email-templates.js";
import type {
  EmailVerificationMessage,
  PasswordResetMessage,
  TransactionalEmailProvider
} from "./email-provider.js";

const RESEND_API_URL = "https://api.resend.com/emails";

export interface ResendProviderOptions {
  apiKey: string;
  from: string;
  replyTo?: string;
  /** Somente para teste - nunca usado em producao. */
  fetchImpl?: typeof fetch;
}

/**
 * Adaptador HTTP para a API transacional da Resend (https://resend.com).
 * Escolhida por ser uma API HTTP unica e simples (1 POST, sem SDK
 * obrigatorio) - trocar de provider no futuro significa escrever outra
 * classe que implemente `TransactionalEmailProvider`, sem tocar o resto do
 * sistema. Nenhum segredo (apiKey) ou corpo de resposta entra em log; a
 * unica coisa que sobrevive de um erro e o codigo/status sanitizado que
 * `ExternalServiceError` ja preserva.
 */
export class ResendTransactionalEmailProvider implements TransactionalEmailProvider {
  readonly name = "RESEND";
  private readonly apiKey: string;
  private readonly from: string;
  private readonly replyTo: string | undefined;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: ResendProviderOptions) {
    this.apiKey = options.apiKey;
    this.from = options.from;
    this.replyTo = options.replyTo;
    this.fetchImpl = options.fetchImpl;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.from);
  }

  async sendEmailVerification(input: EmailVerificationMessage): Promise<void> {
    const rendered = renderEmailVerificationMessage(input);
    await this.dispatch(input.to, rendered);
  }

  async sendPasswordReset(input: PasswordResetMessage): Promise<void> {
    const rendered = renderPasswordResetMessage(input);
    await this.dispatch(input.to, rendered);
  }

  private async dispatch(
    to: string,
    rendered: { subject: string; text: string; html: string }
  ): Promise<void> {
    const response = await fetchWithPolicy(RESEND_API_URL, {
      integration: "TRANSACTIONAL_EMAIL",
      timeoutMs: HTTP_TIMEOUTS.transactionalEmailMs,
      idempotent: false,
      throwOnHttpError: false,
      fetchImpl: this.fetchImpl,
      request: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: this.from,
          to: [to],
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          ...(this.replyTo ? { reply_to: this.replyTo } : {})
        })
      }
    });

    if (!response.ok) {
      // O corpo do erro da Resend pode ecoar o payload enviado (inclusive o
      // destinatario) - nunca repassado adiante, so o status sobrevive.
      throw new ExternalServiceError({
        code: response.status === 429 ? "UPSTREAM_UNAVAILABLE" : "UPSTREAM_UNAVAILABLE",
        integration: "TRANSACTIONAL_EMAIL",
        message: "Falha ao enviar email transacional.",
        status: response.status,
        temporary: response.status === 429 || response.status >= 500,
        retryable: false
      });
    }
  }
}
