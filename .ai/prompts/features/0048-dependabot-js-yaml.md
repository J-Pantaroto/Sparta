---
status: IMPLEMENTADA
solicitado_em: 2026-08-06 23:15
implementado_em: 2026-08-06 23:50
---

# Etapa 31G.1 — Auditoria e correção do alerta Dependabot high

## Pedido original

> Identificar exatamente o alerta Dependabot `high` que apareceu após o push da Etapa 31G,
> determinar sua exposição real no Sparta e aplicar a menor correção segura possível. Classificar
> a exposição com evidências (RUNTIME_EXPLOITABLE / BUILD_TIME_ONLY / TEST_ONLY / NOT_REACHABLE /
> FALSE_POSITIVE_OR_STALE). Preferir, nesta ordem: atualização direta, atualização do pacote pai,
> atualização transitiva normal, override documentado, remoção. Confirmar que a correção não afeta
> isolamento/sandbox/preload/safeStorage do Electron. Lockfile reproduzível, sem configuração
> temporária em `pnpm-workspace.yaml`. Rodar a sequência completa do CI (não só testes
> direcionados). Confirmar não regressão em Champion Select, pré-game, perfil, dashboard,
> autenticação, onboarding, recomendações, ranking, scores, snapshots, release ativa,
> `artifactHash`, `configHash` — com `EXACT_REPLAY` e zero divergências. Finalizar com um destes
> estados: DEPENDABOT_HIGH_RESOLVED / DEPENDABOT_ALERT_NOT_REACHABLE / DEPENDABOT_ALERT_STALE /
> BLOCKED_BY_UPSTREAM_FIX / BLOCKED_BY_BREAKING_UPGRADE. Não declarar resolução enquanto o GitHub
> continuar apresentando o alerta aberto, exceto com evidência de atraso de sincronização.

## Notas de implementação

Relatório completo em `docs/dependabot-js-yaml-2026-08.md`. Resumo:

**Alerta**: `js-yaml` `GHSA-5p4m-2wfm-xmqj` (CVSS 7.5, `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`) —
consumo quadrático de CPU na resolução de `!!omap`, instalado em `4.3.0` (faixa vulnerável `>=
4.0.0 <4.3.1`), corrigido em `4.3.1`. Transitivo, via `eslint`→`@eslint/eslintrc` e
`electron-builder`→`app-builder-lib`/`dmg-builder`/`builder-util` — os dois devDependencies.

**Classificação: `BUILD_TIME_ONLY`**, com evidências: `js-yaml` ausente do grafo `--prod` de todos
os quatro workspaces; ausente dos dois SBOM de produção (Etapa 29); nenhum código do projeto
importa YAML; sem `.eslintrc.yml`/`.yaml` no repo (flat config desde a Etapa 28a, então o caminho
YAML do ESLint nunca ativa); `electron-builder.yml` é arquivo local autoral, sem bloco `publish`
(nenhuma busca de YAML remoto); `electron-builder` nem roda no CI.

**Correção — atualização transitiva normal**: `@eslint/eslintrc@3.3.5` declara `js-yaml: ^4.1.1` e
`app-builder-lib`/`builder-util`/`dmg-builder` declaram `^4.1.0` — as duas faixas já permitiam
`4.3.1`, que existe no registro. `pnpm update js-yaml -r` bastou; nenhum override, nenhuma mudança
em `package.json` ou `pnpm-workspace.yaml`. Diff do lockfile: só `js-yaml@4.3.0` →
`js-yaml@4.3.1`, nada mais.

**Validação**: `pnpm audit` (dev+prod e --prod) → 0 em todas as severidades. `app.asar`
empacotado (via `pnpm --filter @sparta/desktop package:win`, exercitando o próprio
`electron-builder` que motivou o alerta) → 2587 entradas, 0 ocorrências de `js-yaml`. Sequência
completa do CI (version:check, prisma:generate, typecheck, lint, build, testes, analyzer) passou.
`apps/api` isolado passou 46/46 três vezes seguidas; `pnpm -r test` (todos os workspaces em
paralelo) reproduziu a flakiness por contenção já documentada na Etapa 26b/31G — conjunto diferente
e não sobreposto de testes falhando a cada execução, nunca o mesmo, nunca fora de `apps/api`, que
nem depende de `js-yaml`.

**Não regressão**: mesma recomendação controlada de sempre → 5 candidatos idênticos;
`release-etapa27c-v1` `ACTIVE` com `artifactHash`/`configHash` iguais antes e depois; replay
`EXACT_REPLAY`, 0 divergências. Nenhum arquivo de Champion Select, pré-game, perfil, dashboard,
autenticação ou onboarding foi tocado — só `pnpm-lock.yaml` mudou.

**Resultado: `DEPENDABOT_HIGH_RESOLVED`.**
