import { API_BASE_URL } from "./api-base";

/**
 * Pagina de callback de redefinicao de senha. So consome o token (define a
 * nova senha) - o PEDIDO de redefinicao (digitar o email) acontece no
 * Desktop, que e onde o usuario esta quando percebe que esqueceu a senha.
 * Sem sessao, sem SPA: um formulario, uma chamada, um resultado.
 */

const MIN_PASSWORD_LENGTH = 8;

function elementOrThrow<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} ausente`);
  return el as T;
}

function renderStatus(box: HTMLElement, variant: "error" | "success" | "info", message: string) {
  box.hidden = false;
  box.className = `sp-form-status${variant === "error" ? " sp-form-status--error" : variant === "success" ? " sp-form-status--success" : ""}`;
  box.textContent = message;
}

async function confirmReset(
  token: string,
  password: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    if (response.ok) return { ok: true };
    if (response.status === 400) {
      return {
        ok: false,
        message:
          "O link de redefinição é inválido, expirou ou já foi utilizado. Peça um novo link no Sparta GG."
      };
    }
    return { ok: false, message: "Não foi possível redefinir agora. Tente novamente em instantes." };
  } catch {
    return {
      ok: false,
      message: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
    };
  }
}

function run(): void {
  const token = new URLSearchParams(location.search).get("token");
  const form = elementOrThrow<HTMLFormElement>("sp-reset-form");
  const passwordInput = elementOrThrow<HTMLInputElement>("sp-reset-password");
  const confirmInput = elementOrThrow<HTMLInputElement>("sp-reset-password-confirm");
  const submitButton = elementOrThrow<HTMLButtonElement>("sp-reset-submit");
  const status = elementOrThrow("sp-reset-status");

  if (!token) {
    form.hidden = true;
    renderStatus(status, "error", "Link incompleto: nenhum token de redefinição foi encontrado nesta URL.");
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      if (passwordInput.value.length < MIN_PASSWORD_LENGTH) {
        renderStatus(status, "error", `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
        return;
      }
      if (passwordInput.value !== confirmInput.value) {
        renderStatus(status, "error", "As duas senhas informadas não são iguais.");
        return;
      }

      submitButton.disabled = true;
      renderStatus(status, "info", "Redefinindo…");
      const result = await confirmReset(token, passwordInput.value);
      submitButton.disabled = false;

      if (result.ok) {
        form.hidden = true;
        renderStatus(
          status,
          "success",
          "Senha redefinida. Todas as sessões anteriores foram encerradas — entre novamente no Sparta GG com a nova senha."
        );
      } else {
        renderStatus(status, "error", result.message);
      }
    })();
  });
}

run();
