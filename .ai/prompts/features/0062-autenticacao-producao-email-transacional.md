---
status: IMPLEMENTADA
solicitado_em: 2026-08-15 00:30
implementado_em: 2026-08-15 01:35
---

# Etapa 31Q — Autenticação de produção: e-mail transacional e recuperação de senha

## Pedido original

> ETAPA — AUTENTICAÇÃO DE PRODUÇÃO E E-MAIL TRANSACIONAL. Aplique as regras permanentes
> registradas em `.ai/`. Contexto: etapa anterior de correções bloqueantes pré-polish concluída no
> commit aa69aad. Ler docs/desktop-pre-final-audit.md, docs/pre-polish-blocking-fixes.md, .ai/
> CLAUDE.md, .ai/CHANGELOG.md antes de implementar. O Desktop ainda não deve entrar no polish
> visual final. Objetivo: fechar os fluxos de autenticação que ainda impedem uma experiência real
> de produção — configuração real de e-mail transacional, confirmação de e-mail end-to-end,
> recuperação/redefinição de senha end-to-end, estados corretos no Desktop, segurança e
> anti-abuso desses fluxos. Não implementar RSO, não publicar download público, não fazer
> redesign, não criar sistema de tickets. Inventariar a abstração de e-mail existente antes de
> substituir qualquer coisa. Provider real configurável por variáveis de ambiente, sem secrets
> versionados, remetente do domínio spartagg.com.br distinto de suporte@spartagg.com.br. Se DNS
> do provider precisar de ação manual do owner, documentar os registros exatos sem inventar
> valores. Token de confirmação e de reset: criptograficamente seguro, hash em persistência, uso
> único, expiração, invalidação após uso, resend invalida tokens antigos, rate limit,
> anti-enumeration, sem localhost em produção. Redefinição de senha deve invalidar sessões
> existentes salvo razão arquitetural documentada em contrário — não deixar isso implícito.
> Desktop precisa de todos os estados funcionais necessários (email não confirmado, confirmado,
> reenvio, provider indisponível, solicitar recuperação, recuperação concluída, token
> inválido/expirado, senha alterada, sessão invalidada), sem redesign, sem abrir links arbitrários
> na BrowserWindow. Determinar a superfície web mínima necessária (rotas conceituais
> /confirmar-email, /redefinir-senha), sem SPA nem área de conta completa, avaliando deep
> link/protocolo do Desktop antes de criar página pública. Templates transacionais mínimos e
> profissionais, funcionais com imagens bloqueadas. Produção falha o boot sem configuração
> obrigatória de e-mail; dev/test podem usar fake sem enviar e-mail real; nenhum mock operacional
> silencioso em produção. Testes obrigatórios cobrindo confirmação, reset, rate limit e
> concorrência (dois consumos simultâneos do mesmo token). QA end-to-end real depois da
> implementação. Atualizar documentação, `.ai/specs`, changelog, CLAUDE.md e a matriz da auditoria
> pré-final. Classificar EMAIL_PROVIDER, EMAIL_CONFIRMATION, PASSWORD_RECOVERY como READY/
> NEEDS_CONFIGURATION/EXTERNALLY_BLOCKED/NEEDS_IMPLEMENTATION com evidência. Rodar toda a
> validação aplicável (install congelado, testes, typecheck, lint, build, Prisma, analyzer,
> version check, Docker API build, QA Electron). Commit/push na main.

## Notas de implementação

Relatório técnico completo em `docs/password-recovery-and-transactional-email.md` (espelhado em
`.ai/specs/`). Resumo:

- Abstração `TransactionalEmailProvider` já existia (Etapa 31D) com dois provedores (indisponível/
  em memória) mas nenhum adaptador real — completada, não substituída, com
  `ResendTransactionalEmailProvider` (HTTP único via `fetchWithPolicy`, nova `IntegrationId:
  "TRANSACTIONAL_EMAIL"` em `packages/riot/src/http`).
- `PasswordResetToken` (migration nova) espelha exatamente `EmailVerificationToken`: hash SHA-256,
  uso único (`updateMany` como guarda de corrida), expiração, revogação em cascata ao reenviar,
  cooldown + limite por hora numa transação serializável, resposta sempre neutra em
  `POST /auth/password-reset/request`.
- Redefinição de senha invalida **todas** as sessões (`sessionVersion++` na mesma transação que
  troca a senha) — política de segurança aplicada sem exceção, validada contra o Postgres real
  (sessão emitida antes do reset devolve 401 depois).
- Duas páginas públicas novas no site (`/confirmar-email`, `/redefinir-senha`), `noindex`, fora do
  sitemap, sem SPA — decisão deliberada de não usar deep link/protocolo do Desktop (mais frágil:
  exige app instalado e registrado). O Desktop só reconsulta a sessão quando o usuário volta
  (`EmailVerificationScreen` ganhou "Já confirmei, verificar novamente"; `ForgotPasswordScreen` é
  novo, só faz o pedido).
- `.env.production.example` documenta as variáveis novas com nomes reais, sem secrets; `loadEnv`
  ganhou duas checagens de boot (chave do provider e URL de reset HTTPS obrigatórias em produção).
- Testes: 24 novos em `apps/api` (token/rate-limit/concorrência/provider/rotas), 7 novos no
  Desktop, 15 novos no site — **1411 testes** no total (eram 1366 na auditoria da Etapa 31Q
  anterior).
- QA end-to-end real contra Docker: cadastro → confirmação → login → pedido de reset →
  confirmação → senha antiga rejeitada → senha nova aceita → sessão anterior ao reset rejeitada →
  reuso de token rejeitado → sem preview local, nenhum token vaza na resposta neutra mesmo pra
  conta que existe de verdade.
- 4 bugs reais corrigidos no caminho: boot falhava por falta de política de autorização nas rotas
  novas (a trava da Etapa 31C funcionou como desenhado); estilo inline em `confirmar-email.html`
  (seria descartado pela CSP em produção); alias de teste faltando pra `@sparta/riot/http` em
  `apps/api/vitest.config.ts`; `.env` local corrompido por um `echo >>` sem quebra de linha,
  corrigido na hora (arquivo nunca versionado).
- Classificação final: `EMAIL_PROVIDER`, `EMAIL_CONFIRMATION` e `PASSWORD_RECOVERY` todos
  `NEEDS_CONFIGURATION` — implementação completa e validada; falta só a credencial real do
  provider Resend, que é configuração do owner, não código.
