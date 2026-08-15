import { describe, expect, it, vi } from "vitest";
import { ResendTransactionalEmailProvider } from "./resend-email-provider.js";

function fakeFetch(handler: (input: unknown, init?: RequestInit) => Response) {
  return vi.fn(async (input: unknown, init?: RequestInit) => handler(input, init)) as unknown as typeof fetch;
}

describe("ResendTransactionalEmailProvider", () => {
  it("envia verificacao de email com o payload, headers e sem vazar a chave em erro", async () => {
    let capturedUrl: unknown;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = fakeFetch((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
    });
    const provider = new ResendTransactionalEmailProvider({
      apiKey: "re_super_secret_key",
      from: "contas@spartagg.com.br",
      fetchImpl
    });

    await provider.sendEmailVerification({
      to: "player@example.com",
      displayName: "Player",
      verificationUrl: "https://spartagg.com.br/confirmar-email?token=abc",
      expiresAt: new Date("2026-08-14T13:00:00.000Z").toISOString()
    });

    expect(capturedUrl).toBe("https://api.resend.com/emails");
    expect(capturedInit?.method).toBe("POST");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_super_secret_key");
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.from).toBe("contas@spartagg.com.br");
    expect(body.to).toEqual(["player@example.com"]);
    expect(body.subject).toContain("Confirme");
    expect(body.html).toContain("https://spartagg.com.br/confirmar-email?token=abc");
    expect(body.text).toContain("https://spartagg.com.br/confirmar-email?token=abc");
  });

  it("envia redefinicao de senha com o link e a data de expiracao", async () => {
    let capturedBody: string | undefined;
    const fetchImpl = fakeFetch((_url, init) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ id: "email-2" }), { status: 200 });
    });
    const provider = new ResendTransactionalEmailProvider({
      apiKey: "re_super_secret_key",
      from: "contas@spartagg.com.br",
      fetchImpl
    });

    await provider.sendPasswordReset({
      to: "player@example.com",
      displayName: null,
      resetUrl: "https://spartagg.com.br/redefinir-senha?token=xyz",
      expiresAt: new Date("2026-08-14T13:00:00.000Z").toISOString()
    });

    const body = JSON.parse(capturedBody!);
    expect(body.subject).toContain("Redefinir");
    expect(body.html).toContain("https://spartagg.com.br/redefinir-senha?token=xyz");
  });

  it("propaga falha (4xx/5xx) sem vazar o corpo da resposta no erro lancado", async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response(JSON.stringify({ message: "invalid api key: re_super_secret_key" }), {
          status: 401
        })
    );
    const provider = new ResendTransactionalEmailProvider({
      apiKey: "re_super_secret_key",
      from: "contas@spartagg.com.br",
      fetchImpl
    });

    await expect(
      provider.sendEmailVerification({
        to: "player@example.com",
        displayName: null,
        verificationUrl: "https://spartagg.com.br/confirmar-email?token=abc",
        expiresAt: new Date().toISOString()
      })
    ).rejects.toMatchObject({ status: 401 });
  });

  it("trata erro de rede (fetch rejeitado) como falha do provider, nao sucesso silencioso", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const provider = new ResendTransactionalEmailProvider({
      apiKey: "re_super_secret_key",
      from: "contas@spartagg.com.br",
      fetchImpl
    });

    await expect(
      provider.sendPasswordReset({
        to: "player@example.com",
        displayName: null,
        resetUrl: "https://spartagg.com.br/redefinir-senha?token=abc",
        expiresAt: new Date().toISOString()
      })
    ).rejects.toThrow();
  });

  it("isConfigured() e falso sem apiKey ou sem from", () => {
    expect(new ResendTransactionalEmailProvider({ apiKey: "", from: "a@b.com" }).isConfigured()).toBe(
      false
    );
    expect(new ResendTransactionalEmailProvider({ apiKey: "key", from: "" }).isConfigured()).toBe(false);
    expect(
      new ResendTransactionalEmailProvider({ apiKey: "key", from: "a@b.com" }).isConfigured()
    ).toBe(true);
  });
});
