/**
 * Templates transacionais minimos. Linguagem factual, sem marketing. Cada
 * mensagem funciona so com o link em texto puro - nenhum CTA depende de
 * imagem, botao renderizado ou script externo, entao continua utilizavel em
 * cliente com imagens bloqueadas.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function baseHtml(bodyHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#07080a;color:#f2f3f5;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;">
      <tr><td style="padding-bottom:16px;font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8f969f;">Sparta GG</td></tr>
      <tr><td>${bodyHtml}</td></tr>
      <tr><td style="padding-top:32px;border-top:1px solid #23262c;margin-top:24px;font-size:12px;color:#7d848d;">
        Duvidas? suporte@spartagg.com.br<br />
        Sparta GG nao e afiliado, endossado nem patrocinado pela Riot Games.
      </td></tr>
    </table>
  </body>
</html>`;
}

export function renderEmailVerificationMessage(input: {
  displayName: string | null;
  verificationUrl: string;
  expiresAt: string;
}): RenderedEmail {
  const greeting = input.displayName ? `Ola, ${input.displayName}.` : "Ola.";
  const expiry = new Date(input.expiresAt);
  const expiryText = Number.isNaN(expiry.getTime())
    ? "em breve"
    : expiry.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const text = [
    `${greeting}`,
    "",
    "Confirme o email da sua conta Sparta GG usando o link abaixo:",
    input.verificationUrl,
    "",
    `Esse link expira em ${expiryText} e so pode ser usado uma vez.`,
    "",
    "Se voce nao criou uma conta no Sparta GG, pode ignorar esta mensagem - nenhuma acao sera tomada.",
    "",
    "Sparta GG - suporte@spartagg.com.br"
  ].join("\n");

  const html = baseHtml(`
    <h1 style="font-size:20px;margin:0 0 16px;">Confirme seu email</h1>
    <p style="font-size:15px;line-height:1.6;color:#c8cbd0;margin:0 0 16px;">${escapeHtml(greeting)} Confirme o email da sua conta Sparta GG para continuar.</p>
    <p style="margin:0 0 20px;">
      <a href="${escapeHtml(input.verificationUrl)}" style="display:inline-block;padding:12px 20px;background:#e21d2e;color:#ffffff;text-decoration:none;font-weight:700;">Confirmar email</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#8f969f;margin:0 0 16px;">Se o botao nao funcionar, copie e cole este link no navegador:<br /><span style="word-break:break-all;color:#c8cbd0;">${escapeHtml(input.verificationUrl)}</span></p>
    <p style="font-size:13px;color:#8f969f;margin:0 0 8px;">Esse link expira em ${escapeHtml(expiryText)} e so pode ser usado uma vez.</p>
    <p style="font-size:13px;color:#8f969f;margin:0;">Se voce nao criou uma conta no Sparta GG, pode ignorar esta mensagem.</p>
  `);

  return { subject: "Confirme seu email - Sparta GG", text, html };
}

export function renderPasswordResetMessage(input: {
  displayName: string | null;
  resetUrl: string;
  expiresAt: string;
}): RenderedEmail {
  const greeting = input.displayName ? `Ola, ${input.displayName}.` : "Ola.";
  const expiry = new Date(input.expiresAt);
  const expiryText = Number.isNaN(expiry.getTime())
    ? "em breve"
    : expiry.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const text = [
    `${greeting}`,
    "",
    "Recebemos um pedido para redefinir a senha da sua conta Sparta GG. Use o link abaixo para definir uma nova senha:",
    input.resetUrl,
    "",
    `Esse link expira em ${expiryText} e so pode ser usado uma vez.`,
    "",
    "Se voce nao pediu essa redefinicao, pode ignorar esta mensagem - sua senha atual continua valida e nenhuma acao sera tomada.",
    "",
    "Sparta GG - suporte@spartagg.com.br"
  ].join("\n");

  const html = baseHtml(`
    <h1 style="font-size:20px;margin:0 0 16px;">Redefinir senha</h1>
    <p style="font-size:15px;line-height:1.6;color:#c8cbd0;margin:0 0 16px;">${escapeHtml(greeting)} Recebemos um pedido para redefinir a senha da sua conta Sparta GG.</p>
    <p style="margin:0 0 20px;">
      <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;padding:12px 20px;background:#e21d2e;color:#ffffff;text-decoration:none;font-weight:700;">Definir nova senha</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#8f969f;margin:0 0 16px;">Se o botao nao funcionar, copie e cole este link no navegador:<br /><span style="word-break:break-all;color:#c8cbd0;">${escapeHtml(input.resetUrl)}</span></p>
    <p style="font-size:13px;color:#8f969f;margin:0 0 8px;">Esse link expira em ${escapeHtml(expiryText)} e so pode ser usado uma vez.</p>
    <p style="font-size:13px;color:#8f969f;margin:0;">Se voce nao pediu essa redefinicao, pode ignorar esta mensagem - sua senha atual continua valida.</p>
  `);

  return { subject: "Redefinir senha - Sparta GG", text, html };
}
