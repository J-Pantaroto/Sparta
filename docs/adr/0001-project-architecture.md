# ADR 0001: Arquitetura do Monorepo

## Status

Aceita.

## Contexto

Sparta precisa combinar desktop, API, banco, Riot API, lógica de análise e um possível serviço Python futuro.

## Decisão

Usar pnpm workspaces com:

- `apps/desktop` para Electron + React;
- `apps/api` para Fastify + Prisma;
- `packages/core` para domínio puro e algoritmos;
- `packages/riot` para adaptadores externos;
- `packages/ui` para tokens/componentes;
- `services/analyzer` para Python opcional.

## Consequências

A lógica crítica fica testável sem infraestrutura. O desktop não recebe segredos. O analyzer pode evoluir sem bloquear o MVP TypeScript.
