/**
 * Host da API publica que as duas paginas de callback (confirmar-email,
 * redefinir-senha) chamam para consumir o token. `api.spartagg.com.br` e o
 * host reservado desde a Etapa 31K (ver infra/Caddyfile) - o bloco reverso
 * ainda esta desligado enquanto a API publica permanecer bloqueada, entao
 * em producao real esta chamada falha honestamente com um erro de rede ate
 * a infraestrutura ser provisionada, em vez de fingir sucesso.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "https://api.spartagg.com.br";
