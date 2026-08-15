---
status: IMPLEMENTADA
solicitado_em: 2026-08-15 03:00
implementado_em: 2026-08-15 03:35
---

# Correção pontual — propagação de pnpm patches no Dockerfile.site

## Pedido original

> CORREÇÃO PONTUAL — PROPAGAÇÃO DE PNPM PATCHES NO DOCKERFILE.SITE. Aplique as regras permanentes
> registradas em `.ai/`. Contexto: após a introdução do patch versionado
> `patches/extract-zip@2.0.1.patch` registrado em `pnpm.patchedDependencies`, o build de produção
> do site passou a falhar na VPS com `ENOENT: no such file or directory, open
> '/app/patches/extract-zip@2.0.1.patch'`. O `Dockerfile.api` já foi corrigido anteriormente para
> copiar `patches/` antes de executar `pnpm install --frozen-lockfile`. O `Dockerfile.site` ainda
> executa o install sem disponibilizar `patches/` antes. Objetivo: corrigir exclusivamente o build
> Docker do site para que todos os arquivos necessários a `pnpm.patchedDependencies` estejam
> disponíveis antes do `pnpm install`. Direção esperada: `COPY patches ./patches` entre a cópia dos
> manifestos e o install congelado. Verificar `.dockerignore` para confirmar que `patches/` não
> está excluído. Não copiar o diretório de patches para a imagem runtime final se não for
> necessário. Preservar o build multi-stage e a imagem runtime mínima. Não remover
> `patchedDependencies`, não remover o patch de `extract-zip`, não atualizar pnpm, não atualizar
> Electron, não alterar site visualmente, não alterar Caddy, não alterar API, não alterar auth, não
> alterar DNS/infra, não criar workaround só na VPS. Estender ou generalizar o teste de propagação
> criado pra `Dockerfile.api` pra garantir que também `Dockerfile.site` copie os patches antes de
> qualquer `pnpm install` — o teste deve falhar se futuramente algum Dockerfile que consome o
> workspace root executar install congelado sem os patch files registrados. Executar teste
> específico, build real do `Dockerfile.site`, testes/typecheck/lint/build aplicáveis. Confirmar
> que `docker build -f Dockerfile.site ...` passa com checkout limpo. Atualizar
> documentação/changelog/spec mínima necessária. Commit/push em main.

## Notas de implementação

Relatório técnico completo em `docs/dockerfile-site-patch-propagation.md` (espelhado em
`.ai/specs/`). Resumo:

- **Causa confirmada por leitura direta**: `Dockerfile.site`, estágio `build`, copiava
  `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml` e rodava
  `pnpm install --frozen-lockfile --filter "@sparta/site..."` sem `COPY patches ./patches` antes —
  install congelado valida/aplica o lockfile inteiro (inclusive `extract-zip` dentro de `electron`,
  transitivo de `apps/desktop`, presente na árvore do workspace mesmo filtrando só o site), e falha
  com o `ENOENT` relatado. `.dockerignore` não exclui `patches/` — confirmado por leitura; o
  diretório já estava disponível no contexto, só faltava o `COPY` explícito.
- **Correção**: uma linha `COPY patches ./patches` adicionada ao estágio `build`, no mesmo ponto
  relativo que `Dockerfile.api` já usa. Estágio `runtime` (Caddy + `dist/` estático) não roda
  install nenhum e nunca copiou `patches/` — continua sem copiar, confirmado por teste.
- **Teste generalizado**: `scripts/dockerfile-patch-propagation.test.ts` deixou de mencionar
  `Dockerfile.api` por nome — agora escaneia todo `Dockerfile.*` da raiz via `readdirSync`, divide
  por estágio (`FROM ... AS <nome>`, com fallback pra arquivo inteiro quando não há estágio
  nomeado) e exige `COPY patches` antes de todo `pnpm install --frozen-lockfile` (excluindo
  deliberadamente `--frozen-lockfile=false`, usado por `Dockerfile.desktop-dev`). Verificado que o
  teste **falha** sem a correção (revertendo só `Dockerfile.site` via `git stash` e rodando o teste
  isolado) e **passa** com ela — 7 testes no total (1 compartilhado + 2 por Dockerfile × 3
  Dockerfiles).
- **Validado com build Docker real**, duas vezes: `docker build -f Dockerfile.site .` (com cache) e
  `docker build --no-cache -f Dockerfile.site .` (equivalente a checkout limpo) — os dois
  concluíram, com `pnpm install` resolvendo o patch sem erro e o `vite build` do site gerando as 12
  páginas normalmente.
- **Testes**: `pnpm typecheck`/`lint`/`test`/`build` completos nos 5 pacotes TypeScript, todos
  verdes. **1415 testes** no monorepo (raiz 25 — eram 21 —, site 117, core 635, riot 98, api 376,
  desktop 164).
- **Documentação**: `docs/dockerfile-site-patch-propagation.md` (novo) + nota curta adicionada em
  `docs/pre-polish-blocking-fixes.md` §1, registrando que aquela etapa cobriu só o `Dockerfile.api`
  e apontando pra esta correção. Espelhos em `.ai/specs/` sincronizados byte a byte.
- **Nenhum arquivo fora de `Dockerfile.site`, `scripts/dockerfile-patch-propagation.test.ts` e
  documentação foi tocado** — confirmado por `git status`/`git diff --stat` antes do commit: zero
  mudança em `patches/`, `pnpm-lock.yaml`, `package.json`, pnpm/Electron, `apps/site` (visual),
  `infra/Caddyfile`, `apps/api`, auth ou DNS.
