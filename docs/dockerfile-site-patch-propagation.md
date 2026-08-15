# Correção pontual — propagação de pnpm patches no `Dockerfile.site`

**Data:** 2026-08-15

**Escopo:** exclusivamente o build Docker do site (`Dockerfile.site`) e o teste estrutural que
protege todo `Dockerfile.*` do repositório contra a mesma classe de erro. Nenhum código de
produto, DNS, Caddy, API, auth ou infraestrutura foi tocado.

## Causa

A Etapa 0061 (`docs/pre-polish-blocking-fixes.md`, seção 1) corrigiu a propagação de
`patches/extract-zip@2.0.1.patch` (registrado em `pnpm.patchedDependencies` desde a Etapa 31P) só
no `Dockerfile.api` — os estágios `deps`/`build` passaram a copiar `patches/` antes de qualquer
`pnpm install --frozen-lockfile`. O `Dockerfile.site` consome o **mesmo** `pnpm-lock.yaml` raiz
(único lockfile do monorepo) mas nunca tinha sido revisado naquela etapa, porque não estava entre
os cinco bloqueios auditados. Seu estágio `build` copiava `package.json`/`pnpm-lock.yaml`/
`pnpm-workspace.yaml` e rodava `pnpm install --frozen-lockfile --filter "@sparta/site..."` sem
`patches/` no contexto — install congelado valida o lockfile inteiro, inclusive a entrada de
`extract-zip` dentro de `electron` (dependência transitiva de `apps/desktop`, presente na árvore
mesmo instalando só o filtro do site, porque `--frozen-lockfile` resolve o grafo completo do
workspace antes de filtrar), e falhava com:

```txt
ENOENT: no such file or directory, open '/app/patches/extract-zip@2.0.1.patch'
```

Reproduzido na VPS ao buildar o site depois do patch existir — não em nenhum ambiente anterior,
porque o build do site nunca tinha sido exercitado contra um lockfile com `patchedDependencies`
até a Etapa 31P.

## Correção

Uma linha adicionada ao estágio `build` do `Dockerfile.site`, no mesmo lugar relativo que o
`Dockerfile.api` já usa:

```dockerfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/site/package.json ./apps/site/
RUN pnpm install --frozen-lockfile --filter "@sparta/site..."
```

O estágio `runtime` (Caddy + `dist/` estático) nunca copiava `patches/` e continua sem copiar —
não roda nenhum install, só serve os arquivos já buildados no estágio anterior. `.dockerignore`
não exclui `patches/` (confirmado por leitura direta do arquivo), então o diretório já estava
disponível no contexto de build; faltava só o `COPY` explícito no Dockerfile.

## Teste de regressão generalizado

`scripts/dockerfile-patch-propagation.test.ts` deixou de ser específico do `Dockerfile.api` e
passou a escanear **todo** arquivo `Dockerfile.*` do repositório (via `readdirSync` na raiz, não
uma lista fixa de nomes — um `Dockerfile.*` novo entra automaticamente na proteção). Para cada
Dockerfile encontrado:

1. Divide o conteúdo em estágios por `FROM ... AS <nome>` (um Dockerfile sem estágio nomeado, como
   `Dockerfile.desktop-dev`, vira um único bloco cobrindo o arquivo inteiro).
2. Para todo estágio que contém `pnpm install --frozen-lockfile` (a regex exclui
   `--frozen-lockfile=false`, que é o que `Dockerfile.desktop-dev` usa deliberadamente — imagem de
   dev sem lockfile copiado, fora do escopo desta proteção), exige que `COPY patches` apareça
   **antes** desse install na mesma região do arquivo.
3. Se existir um estágio chamado `runtime`, exige que ele **não** contenha `COPY patches`.

Confirmado que o teste falha sem a correção: revertendo só `Dockerfile.site` (via `git stash`) e
rodando o teste isoladamente, a assertiva `copia patches/ antes de todo install congelado...` falha
exatamente no estágio `build` do `Dockerfile.site` com a mensagem apontando a causa raiz. Restaurada
a correção, os 7 testes (1 de patches versionados + 2 por Dockerfile × 3 Dockerfiles) passam.

## Validação

- `npx vitest run scripts` (raiz): **25/25** testes, incluindo os 7 de
  `dockerfile-patch-propagation.test.ts`.
- `docker build -f Dockerfile.site .` com cache: build completo, `pnpm install` resolveu o patch
  sem erro.
- `docker build --no-cache -f Dockerfile.site .`: build completo do zero (equivalente a um checkout
  limpo na VPS), mesmo resultado — confirma que o problema não era um artefato de cache local.
- `pnpm typecheck`/`lint`/`test`/`build` completos nos 5 pacotes TypeScript: todos verdes (raiz 25,
  site 117, core 635, riot 98, api 376, desktop 164 — **1415 testes** no monorepo, eram 1411).

## Fora de escopo, conforme instrução explícita

`pnpm.patchedDependencies`/o patch de `extract-zip` não foram alterados; pnpm não foi atualizado;
Electron não foi atualizado; nenhuma mudança visual no site; `infra/Caddyfile` intocado; API/auth
intocados; nenhum DNS ou infraestrutura tocados; nenhum workaround aplicado só na VPS — a correção
é no Dockerfile versionado, a mesma imagem que a VPS builda.
