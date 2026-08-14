---
status: IMPLEMENTADA
solicitado_em: 2026-08-14
implementado_em: 2026-08-14 20:55
---

# Correções bloqueantes pré-polish do Desktop

## Pedido original

> Resolver exclusivamente cinco bloqueios confirmados pela auditoria pré-final: propagação do
> patch local no build Docker da API; preservação de sessão em falhas offline; isolamento do draft
> LCU stale entre sessões; corrida de respostas entre partidas no pós-game; hardening de navegação
> e origem dos IPCs Electron. Não implementar autenticação/e-mail, redesign ou features novas.

## Notas de implementação

Etapa concluída sobre `baa12c2c91cb55ba2f6784b31cb82d1c859b8bf3`, sem redesign ou feature
nova. Relatório completo em `docs/pre-polish-blocking-fixes.md`, com espelho em
`.ai/specs/pre-polish-blocking-fixes.md`.

O Docker passa a copiar os patches somente nos estágios de instalação/build; sessão offline é
preservada e só 401 autoritativo remove o token; draft LCU usa `gameId` + revisão monotônica e limpa
todo estado observado ao perder confirmação; pós-game usa cancelamento/identidade latest-only; e
todos os IPCs privilegiados exigem frame principal, URL exata e payload permitido.

Validação: install congelado, version check, Prisma generate/validate/migrations, typecheck, lint,
build, 1.366 testes TypeScript, analyzer 1/1, build/health/inspeção Docker e QA Electron/CDP real.
Na QA, API offline preservou `safeStorage`; duas sessões LCU separadas por desconexão não
compartilharam picks; troca rápida do pós-game terminou na partida mais recente; navegação externa
e `window.open` foram bloqueados; houve zero erro de runtime/HTTP inesperado. Toda instrumentação,
conta, certificado e arquivo temporário foram removidos.

Confirmação de e-mail, provider transacional e recuperação de senha continuam pendentes. Esta etapa
não autoriza automaticamente o polish visual.
