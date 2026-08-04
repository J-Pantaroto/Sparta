---
status: IMPLEMENTADA
solicitado_em: 2026-08-04 11:50
implementado_em: 2026-08-04 12:40
---

# Etapa 28a — Auditoria de segurança e prontidão para release

## Pedido original

> Auditar o produto completo e corrigir apenas problemas comprovados de segurança, isolamento
> entre contas, dependências, configuração de produção, Electron, API, banco, logs, containers,
> fluxos HTTP conhecidos e preparação de build distribuível. Primeiro produzir a auditoria, depois
> implementar correções de baixo risco e claramente justificadas. Não recalibrar o motor, não
> alterar a release ativa, não fazer major em lote, não publicar instalador.

## Notas de implementação

Relatório completo em `docs/security-audit.md` (espelhado em `.ai/specs/`). Resumo do que mudou:

**Dependências**: 14 high → 4 high, via `pnpm.overrides` só com patch/minor
(`fast-uri`, `find-my-way`, `@fastify/static`, `brace-expansion`, `postcss`). As 4 restantes são
todas do Electron e exigem major 37 → 39 — adiadas com análise de alcance: cada uma depende de
uma API que o Sparta não chama ou de conteúdo web hostil, que a CSP e as novas guardas de
navegação impedem.

**Dois bugs reais encontrados durante a própria auditoria**, ambos meus:

1. **`setErrorHandler` registrado depois dos `register`.** No Fastify, cada contexto encapsulado
   herda o handler existente no momento em que é criado — registrado no fim de `buildApp`, ele
   **nunca chegava às rotas**. A primeira versão da correção de sanitização de erro era portanto
   ilusória: passava no meu raciocínio e falhava no teste. Só apareceu porque escrevi o teste de
   segurança antes de dar o item por resolvido.
2. **`request()` injetava `Content-Type: application/json` em toda requisição**, inclusive nas sem
   corpo. Era a causa comum das três ocorrências de `FST_ERR_CTP_EMPTY_JSON_BODY` (26b, 27c e as
   duas pendentes). Corrigido no ponto central; os dois contornos `body: "{}"` anteriores foram
   removidos.

**API**: erro de schema virou 400 sanitizado (era 500 com o dump do zod); erro interno devolve
mensagem genérica e o detalhe vai pro log; cabeçalhos de endurecimento em toda resposta; `/docs`
publicado só em `NODE_ENV === "development"` (opt-in — ambiente sem `NODE_ENV` não ganha docs por
omissão).

**Electron**: `sandbox: true` explícito, `setWindowOpenHandler` negando por padrão e guarda de
`will-navigate`. Verificado como já seguro: bridge com allowlist de 9 métodos, sem `ipcRenderer`/
`require`/`process` no renderer, e `download-skin` com https + allowlist de host + `basename()`.

**Containers**: processo deixou de rodar como root (`USER node`), lockfile copiado com
`--frozen-lockfile` (o build resolvia dependências do zero e podia divergir do que foi auditado),
`HEALTHCHECK`, `restart: unless-stopped`, `stop_grace_period` e encerramento controlado em
`SIGTERM`/`SIGINT`.

**Release ativa intocada**: recomendação com o mesmo contexto controlado antes e depois produziu
ranking **idêntico** (Viego 58.7 / Udyr 58.5 / Vi 55.3 / Nocturne 53.3 / Graves 50.1);
`artifactHash` e `configHash` inalterados; replay do snapshot novo e do snapshot da linha de base
ambos `EXACT_REPLAY` com 0 divergências.

**Build empacotado exercitado** a partir de `out/`, sem dev server, em caminho com espaço e acento.

## Adiado, com motivo

- Electron 37 → 39.8.5 (major; merece etapa própria com revalidação do empacotado).
- devDependencies na imagem de runtime — a imagem passou de 1,06 GB para 1,58 GB com o
  `--frozen-lockfile`. Resolver exige multi-stage com `pnpm deploy`, que tem risco real de
  regressão e não é mudança de baixo risco.
- PUUID em log de acesso (mudaria contrato público de rota), FKs sem índice (desempenho),
  migration revertida com arquivo presente, imagem-base sem digest, ausência de configuração de
  instalador.

## Verificação

`typecheck`, `lint`, `test` e `build` aprovados: core 620, riot 96, api 277, desktop 73 — 1066
testes. 14 casos novos em `apps/api/src/app.security.test.ts`; dois testes pré-existentes que
afirmavam o comportamento defeituoso (zod → 500) foram atualizados.
