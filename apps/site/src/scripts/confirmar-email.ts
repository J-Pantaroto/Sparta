import { API_BASE_URL } from "./api-base";

/**
 * Pagina de callback do email de confirmacao. Le o token da query string,
 * consome no backend e mostra o resultado - sem sessao, sem SPA, sem estado
 * alem do necessario pra essa unica chamada. O usuario volta ao Desktop
 * manualmente depois (o botao "Ja confirmei" de la re-consulta a sessao).
 */

function elementOrThrow(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} ausente`);
  return el;
}

function renderStatus(box: HTMLElement, variant: "loading" | "error" | "success", message: string) {
  box.className = `sp-form-status${variant === "error" ? " sp-form-status--error" : variant === "success" ? " sp-form-status--success" : ""}`;
  box.textContent = message;
}

async function confirmToken(token: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/email-verification/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    if (response.ok) return { ok: true };
    if (response.status === 400) {
      return {
        ok: false,
        message: "O link de confirmação é inválido, expirou ou já foi utilizado. Peça um novo link no Sparta GG."
      };
    }
    return { ok: false, message: "Não foi possível confirmar agora. Tente novamente em instantes." };
  } catch {
    return {
      ok: false,
      message: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
    };
  }
}

async function run(): Promise<void> {
  const box = elementOrThrow("sp-confirm-status");
  const token = new URLSearchParams(location.search).get("token");
  if (!token) {
    renderStatus(box, "error", "Link incompleto: nenhum token de confirmação foi encontrado nesta URL.");
    return;
  }

  renderStatus(box, "loading", "Confirmando seu email…");
  const result = await confirmToken(token);
  if (result.ok) {
    renderStatus(
      box,
      "success",
      "Email confirmado. Volte ao Sparta GG — o acesso aos seus dados pessoais já está liberado."
    );
  } else {
    renderStatus(box, "error", result.message);
  }
}

void run();
