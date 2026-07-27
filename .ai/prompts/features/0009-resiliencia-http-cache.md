---
status: IMPLEMENTADA
solicitado_em: 2026-07-27 19:44
implementado_em: 2026-07-27 20:04
---

# Resiliência HTTP, erros externos e estados de cache

## Pedido original

> Auditar todas as chamadas HTTP ativas e tornar as integrações atuais resilientes e observáveis, com timeout e cancelamento explícitos, taxonomia central de erros, retry limitado apenas quando seguro, tratamento específico de credencial e rate limit da Riot, estados `MISS`/`FRESH`/`STALE`/`EXPIRED`, stale fallback por recurso, erros sanitizados e integração mínima com proveniência. Não adicionar novas fontes nem integrações e executar somente a Etapa 9.

## Notas de implementação

- Inventário completo em `docs/http-resilience.md`.
- Política central com timeout/cancelamento, retry idempotente limitado, jitter injetável,
  `Retry-After`, validação de payload e erros sanitizados.
- Riot, Data Dragon backend/renderer, Community Dragon, assets, API local e LCU migrados.
- Cache com `MISS/FRESH/STALE/EXPIRED`, datas reais e stale por recurso; autenticação e LCU
  continuam sem stale.
- LCU limpa draft imediatamente ao perder a observação e expõe estados específicos.
- 27 testes novos; suíte completa com 472 testes, typecheck, lint e build do Electron aprovados.
