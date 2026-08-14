# Alerta Dependabot — extract-zip (GHSA-jmr9-qjv8-65gv)

Etapa 31P. Triagem e correção do alerta `high` #44, identificado depois do push da Etapa 31O.

## O alerta

| Campo | Valor |
| --- | --- |
| Pacote | `extract-zip` (npm) |
| Advisory | [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) |
| CVE | `CVE-2026-56876` |
| Severidade | `high` (CVSS 3.1: `AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N`, score 8.1) |
| Faixa vulnerável | `<= 2.0.1` |
| Versão instalada | `2.0.1` (última publicada — sem nenhuma versão corrigida disponível, `first_patched_version: null` no advisory) |
| Manifesto | `pnpm-lock.yaml` |
| Relação | **transitiva** — não é dependência direta de nenhum `package.json` do monorepo |
| Publicado | 2026-06-26 |

**A falha**: `extract-zip` valida o diretório de destino de cada entrada do
zip (`destDir` precisa resolver dentro do diretório de extração — ver
`extract()` em `index.js`), mas nunca validava o **alvo** de uma entrada do
tipo symlink. Um zip malicioso pode conter um symlink cujo conteúdo (o que
`fs.symlink(link, dest)` recebe como alvo) é um caminho absoluto ou relativo
como `../../../../etc/passwd`. A checagem existente só garante que o
**link em si** (`dest`) fica dentro do diretório de extração; o **destino do
link** nunca era conferido, permitindo que o symlink resultante aponte pra
fora da árvore extraída — leitura/escrita arbitrária dependendo de como quem
chama `extract-zip` usa o arquivo depois.

## Exposição real no Sparta

**Classificação: `BUILD_TIME_ONLY` / instalação de dependências, nunca
runtime do produto.**

```txt
extract-zip@2.0.1
└─ electron@39.8.10 (devDependency de apps/desktop)
   └─ usado por `@electron/get`, no postinstall do próprio pacote `electron`,
      pra descompactar o binário oficial do Electron baixado do GitHub
      Releases da própria Electron
```

Evidências reunidas antes de qualquer correção:

- `electron` é `devDependency` de `apps/desktop` (nunca `dependency`) —
  confirmado em `apps/desktop/package.json`. O `extract-zip` que ele carrega
  não é código do produto: roda uma única vez, no `pnpm install`, pra
  descompactar o `.zip` do binário do Electron pra dentro de
  `node_modules/electron/dist`.
- O `app.asar` empacotado pelo `electron-builder` não inclui
  `devDependencies` (confirmado desde a Etapa 30A: allowlist estrita, zero
  fixture/teste/TypeScript no artefato final) — `extract-zip` nunca chega ao
  instalador distribuído.
- O zip que `extract-zip` de fato processa nesse caminho é o **release
  oficial do próprio Electron**, baixado por `@electron/get` de
  `github.com/electron/electron/releases` — não é um arquivo enviado por
  usuário, nem baixado de origem controlada por terceiro, nem contém input
  de rede não confiável no sentido do advisório. O cenário de ataque descrito
  (zip malicioso processado pela aplicação) não corresponde a como o Sparta
  usa esse caminho.
- `pnpm --filter @sparta/desktop why extract-zip --prod` devolve vazio —
  ausente da árvore de produção de todo workspace.

Ou seja: a exposição real é **instalação/build**, numa máquina de
desenvolvedor ou runner de CI, processando um artefato que já é
implicitamente confiado (o próprio binário do Electron, sem o qual o projeto
não roda de jeito nenhum) — não o cenário de "zip arbitrário enviado por
alguém" que o advisory descreve. Ainda assim, corrigido: build/dev-time não é
motivo pra deixar uma falha de path traversal sem correção quando existe
correção viável.

## Por que não foi uma atualização de versão

`first_patched_version: null` no advisory, e confirmado direto no registro do
npm (`npm view extract-zip versions`): a última versão publicada é `2.0.1`,
de **2026-06-10** — o pacote está sem release desde então, e não existe (na
data desta correção) nenhuma versão que resolva o CVE. Não há "menor versão
corrigida" pra apontar, porque nenhuma existe.

## Correção aplicada

**Patch local via `pnpm patch`**, a menor mudança possível dado que não há
upgrade disponível: `patches/extract-zip@2.0.1.patch` (registrado em
`package.json` → `pnpm.patchedDependencies` e em `pnpm-lock.yaml`) modifica
só o trecho vulnerável de `index.js`, dentro do bloco que cria o symlink:

```js
if (symlink) {
  const link = await getStream(readStream)

  // GHSA-jmr9-qjv8-65gv / CVE-2026-56876: ...
  const resolvedTarget = path.resolve(path.dirname(dest), link)
  const relativeTarget = path.relative(this.opts.dir, resolvedTarget)
  if (path.isAbsolute(link) || relativeTarget.split(path.sep).includes('..')) {
    throw new Error(`Out of bound symlink target "${link}" found while processing file ${entry.fileName}`)
  }

  debug('creating symlink', link, dest)
  await fs.symlink(link, dest)
} else {
  ...
```

A checagem espelha, de propósito, a mesma lógica que o próprio pacote já usa
pra validar `destDir` alguns milímetros acima no arquivo (`relativeDestDir.
split(path.sep).includes('..')`) — mesmo padrão, agora aplicado ao alvo
resolvido do symlink em vez de só à sua localização. Caminho absoluto e
caminho relativo que escapa do diretório de extração são rejeitados com
`throw`, antes de `fs.symlink` ser chamado; nenhum arquivo é criado nesse
caso.

Nenhum outro arquivo de `extract-zip` foi tocado, nenhuma outra dependência
mudou. O diff do lockfile é só o registro do patch e o sufixo
`(patch_hash=...)` nas duas entradas de `electron@39.8.10` que referenciam
`extract-zip`.

## Testes

Novo `scripts/extract-zip-patch.test.ts` (3 testes, suíte raiz — `vitest run
scripts`), sem depender de nenhuma lib de escrita de zip (nenhuma estava no
projeto; não valia adicionar uma só pra isto). Monta um `.zip` mínimo cru
(formato ZIP local + diretório central + EOCD escritos a mão, CRC-32 sem
tabela) com uma única entrada symlink:

1. **alvo relativo que escapa** (`../../../../etc/passwd`) → `extractZip`
   rejeita com `/Out of bound symlink/`, e nada é criado no diretório de
   destino.
2. **alvo absoluto** (`C:\Windows\System32\evil` no Windows,
   `/etc/passwd` nos demais) → rejeitado do mesmo jeito.
3. **alvo relativo legítimo, dentro do diretório de extração** → continua
   funcionando normalmente (o patch não quebra o uso real do recurso).

**Erro cometido e corrigido no caminho**: a primeira versão declarou
`extract-zip` como `devDependency` direta da raiz só pra esse teste
conseguir `import extract-zip from "extract-zip"`. Isso criou um **segundo
alerta Dependabot duplicado** (#45) pro mesmo pacote/versão, só que com
`manifest_path: "package.json"` e `relationship: "direct"` em vez de
`pnpm-lock.yaml`/`transitive` — o GitHub passou a rastrear a mesma
vulnerabilidade sob dois números por causa da nova declaração direta.
Corrigido removendo a `devDependency` e trocando o `import` estático por
resolução manual via `node:module` `createRequire`, subindo até o
`package.json` real do `electron` (`apps/desktop`'s devDependency) e criando
um `require` ancorado ali — o mesmo caminho de resolução que o próprio
`electron` usa em produção pra achar seu `extract-zip` nested, sem declarar
nada novo em lugar nenhum do monorepo:

```ts
const desktopPackageJson = join(dirname(fileURLToPath(import.meta.url)), "../apps/desktop/package.json");
const desktopRequire = createRequire(desktopPackageJson);
const electronRequire = createRequire(desktopRequire.resolve("electron/package.json"));
const extractZip = electronRequire("extract-zip");
```

Validado:

| Verificação | Resultado |
| --- | --- |
| `pnpm install` (aplica o patch) | limpo — inclui o postinstall real do `electron`, que de fato exercita `extract-zip` patchado descompactando o binário oficial, sem erro |
| `grep` no arquivo instalado (`.pnpm/extract-zip@2.0.1_patch_has_.../index.js`) | confirma o trecho do patch presente na árvore resolvida |
| `vitest run scripts` | 3/3 novos + 15 pré-existentes = 18/18 |
| `pnpm typecheck` | limpo nos 5 pacotes |
| `pnpm lint` | limpo nos 5 pacotes (arquivo novo também limpo isolado: `eslint scripts/extract-zip-patch.test.ts`) |
| `pnpm build` | limpo nos 5 pacotes, incluindo `electron-vite build` do desktop |
| `pnpm test` (suíte completa) | **1343 testes** (raiz 18 — eram 15 —, site 102, core 635, riot 97, api 353, desktop 138), todos verdes |
| `pnpm audit` | ainda reporta `extract-zip` como `high` — **esperado**: audit/Dependabot leem a versão declarada no lockfile (`2.0.1`), não o conteúdo patchado; não existe hoje um mecanismo de auditoria que entenda `pnpm.patchedDependencies` como remediação. Ver seção seguinte. |

## Por que `pnpm audit` continua acusando, e o que isso significa pro Dependabot

`pnpm patch` corrige o **código** que roda, não a **string de versão**
declarada — `extract-zip` continua resolvido como `2.0.1` no lockfile
(com o sufixo interno `patch_hash=...` que só o pnpm entende). Ferramentas de
auditoria por advisory (`pnpm audit`, e possivelmente o próprio Dependabot)
comparam a versão declarada contra a faixa vulnerável do advisory — sem saber
que o conteúdo real foi alterado, `<= 2.0.1` continua batendo.

Isso é esperado e não é uma limitação da correção: é a natureza de corrigir
uma dependência sem release upstream disponível. O risco real (o código que
de fato executa na máquina) está fechado; o que pode continuar sinalizado é
só a leitura automatizada da versão.

## Estado final no GitHub

Confirmado via `gh api repos/.../dependabot/alerts/44` depois do push: o
alerta **continuou `open`** mesmo após o GitHub reprocessar o lockfile (o
`updated_at` não mudou de imediato, e mesmo quando reprocessou o
`vulnerable_version_range` `<= 2.0.1` seguiu batendo com `2.0.1
(patch_hash=...)`, que ainda é `2.0.1` do ponto de vista do scanner). Como
não existe versão corrigida pra fazer o alerta fechar sozinho, **dispensado
manualmente** via API com `dismissed_reason: "tolerable_risk"` e um
comentário resumindo a mitigação real (build-time-only, patch local, testes
de regressão) — a alternativa seria deixar o alerta aberto pra sempre sem
nenhuma indicação de que já foi tratado, o que é pior para quem olhar o
repositório depois.

O erro do `devDependency` direto (ver §"Testes" acima) criou um **segundo**
alerta, #45, com `manifest_path: "package.json"`. Corrigido na raiz (removida
a declaração direta, teste reescrito pra resolver via `electron`) antes do
commit final — confirmado via API que #45 foi pro estado **`fixed`**
automaticamente, sem dispensa manual, porque a declaração que o gerou de
fato deixou de existir do manifesto.

**Confirmado via `gh api repos/.../dependabot/alerts` depois dos dois
pushes (commits `7e0ec0c` e `d6e7085`)**: `#44` → `dismissed`
(`tolerable_risk`); `#45` → `fixed` (automático); **0 alertas abertos** no
repositório.

## Não regressão

Nenhum arquivo de `apps/`, `packages/` ou lógica de produto foi tocado —
confirmado por `git diff --stat` antes do commit: só `package.json`,
`pnpm-lock.yaml`, o novo `patches/extract-zip@2.0.1.patch` e o novo teste em
`scripts/`. Como nenhum desses toca `packages/core`/`apps/api`, não há
caminho pelo qual a recomendação controlada, hashes de release ou replay
pudessem ter sido afetados — `typecheck`/`build` limpos nos 5 pacotes já são
a confirmação estática disso.

## Resultado

Vulnerabilidade real (path traversal via symlink não validado) **fechada no
código que de fato executa**, via patch local rastreado em `patches/` e
registrado no lockfile. Nenhuma versão corrigida existe upstream pra apontar
em seu lugar. **`DEPENDABOT_HIGH_RESOLVED`**: #44 dispensado com
justificativa (`tolerable_risk`), #45 (o duplicado que a primeira tentativa
introduziu por engano) corrigido pela raiz e fechado automaticamente pelo
GitHub — **0 alertas abertos** no repositório, confirmado via API.
