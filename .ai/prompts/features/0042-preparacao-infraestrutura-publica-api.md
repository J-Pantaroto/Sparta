---
status: IMPLEMENTADA
solicitado_em: 2026-08-05 20:33
implementado_em: 2026-08-05 20:52
---

# Etapa 31B — Preparação da infraestrutura pública da API

## Pedido original

> Auditar requisitos reais da API e dependências da Riot, definir uma arquitetura recomendada e
> duas alternativas com custos, preparar configuração de produção, estratégias de banco/imagem,
> ambientes, observabilidade, runbooks, checklists e decisões do proprietário. Não provisionar,
> contratar, registrar domínio, criar registry, fazer deploy, restaurar o instalador ou usar uma
> Development Key como solução pública permanente.

## Notas de implementação

Auditoria e preparação concluídas em `docs/public-api-infrastructure-readiness.md`, com três
arquiteturas, custos oficiais aproximados, bloqueios Riot/segurança, configuração de produção,
estratégias de banco/imagem/ambientes/observabilidade, checklists, decisões do proprietário e
runbooks. A API ganhou validação de produção configurável e readiness real do Postgres.

Estado: combinação de `READY_FOR_INFRASTRUCTURE_APPROVAL`, `BLOCKED_BY_RIOT_APPROVAL` e
`BLOCKED_BY_OWNER_DECISIONS`. Nenhum recurso, registry, domínio, gasto, migration externa, deploy,
imagem ou nova versão do desktop foi criado.
