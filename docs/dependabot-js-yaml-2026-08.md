# Alerta Dependabot — js-yaml (GHSA-5p4m-2wfm-xmqj)

Etapa 31G.1. Auditoria e correção do alerta `high` que o GitHub sinalizou depois
do push da Etapa 31G.

## O alerta

| Campo | Valor |
| --- | --- |
| Pacote | `js-yaml` (npm) |
| Advisory | [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) |
| CVE | não atribuído no momento da correção |
| Severidade | `high` (CVSS 3.1: `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`, score 7.5) |
| Faixa vulnerável instalada | `>= 4.0.0, < 4.3.1` |
| Versão corrigida | `4.3.1` |
| Versão instalada | `4.3.0` |
| Manifesto | `pnpm-lock.yaml` |
| Relação | **transitiva** — não é dependência direta de nenhum `package.json` do monorepo |
| Publicado | 2026-08-06 |
| Exploit conhecido | não informado pelo advisory oficial |

**A falha**: `resolveYamlOmap()` (`lib/type/omap.js`) verifica unicidade de chave
com uma varredura linear (`Array.prototype.indexOf`) dentro do laço de cada
elemento, tornando a resolução de um `!!omap` **O(n²)**. Um documento YAML de
~2,5 MB com 150 mil entradas bloqueia `yaml.load()` por ~11 segundos — negação
de serviço síncrona no processo que chama `yaml.load()` sobre entrada não
confiável. `!!omap` está no schema padrão, então nenhuma configuração especial
é necessária para o consumidor estar exposto.

## Exposição real no Sparta

**Classificação: `BUILD_TIME_ONLY`.**

`js-yaml@4.3.0` é alcançado por exatamente dois caminhos, os dois
`devDependencies`:

```txt
js-yaml@4.3.0
├─ @eslint/eslintrc@3.3.5 → eslint@9.39.4  (devDependency da raiz)
└─ app-builder-lib / dmg-builder / builder-util / electron-builder /
   electron-builder-squirrel-windows / electron-publish@26.15.3
   (devDependency de apps/desktop, usado só por `pnpm package:win`)
```

Evidências reunidas antes de qualquer correção:

- `pnpm --filter <pkg> why js-yaml --prod` devolve **vazio** para `@sparta/api`,
  `@sparta/desktop`, `@sparta/core` e `@sparta/riot` — js-yaml não existe no
  grafo de produção de nenhum workspace.
- `js-yaml` está ausente dos dois SBOM gerados na Etapa 29
  (`artifacts/releases/0.9.0/sbom-api.json`, `sbom-desktop.json`), que
  enumeram só dependências resolvidas com `--prod`.
- Nenhum arquivo de código do projeto (`apps/api/src`, `apps/desktop/src`,
  `packages/core/src`, `packages/riot/src`, `services/analyzer`) importa
  `js-yaml` ou qualquer parser YAML — o Sparta nunca chama `yaml.load()` em
  lugar nenhum, sobre entrada nenhuma.
- O caminho do ESLint só ativaria o parser YAML se existisse um
  `.eslintrc.yml`/`.yaml` no repositório — não existe; o projeto usa
  `eslint.config.js` (flat config) desde a Etapa 28a. `@eslint/eslintrc` está
  na árvore como dependência fixa do pacote `eslint`, mas o caminho que usa
  `js-yaml` nunca é exercitado.
- O caminho do `electron-builder` lê `apps/desktop/electron-builder.yml` — um
  arquivo local, autoral do próprio projeto, nunca dado de rede ou de usuário.
  Não há bloco `publish` nesse YAML (confirmado — nada busca configuração
  remota).
- `electron-builder`/`app-builder-lib` não roda no CI (`.github/workflows/ci.yml`
  não invoca `package:win`); só `eslint` roda lá, no passo `pnpm lint`.

Ou seja: mesmo dentro do único contexto onde `js-yaml@4.3.0` de fato executa
(máquina de desenvolvimento ou runner de CI, nunca em produção), a entrada que
ele processa é sempre um arquivo de configuração autoral do próprio
repositório — nunca rede, nunca usuário, nunca conteúdo remoto. O cenário de
ataque do advisory (`yaml.load(untrustedInput)`) não existe neste projeto.

## Correção

**Atualização transitiva normal** — a opção de menor intervenção da lista
preferida, sem precisar de override. `@eslint/eslintrc@3.3.5` declara
`js-yaml: ^4.1.1` e `app-builder-lib`/`builder-util`/`dmg-builder@26.15.3`
declaram `js-yaml: ^4.1.0` — as duas faixas já permitem `4.3.1` (que existe no
registro do npm desde antes deste alerta). O lockfile só não tinha sido
atualizado para captar a versão mais nova dentro da faixa já permitida.

```bash
pnpm update js-yaml -r
```

Diff do lockfile: **só** `js-yaml@4.3.0` → `js-yaml@4.3.1`, em toda ocorrência
(hash de integridade e as quatro referências de versão). Nenhum outro pacote
mudou. `package.json` não foi tocado — não foi necessário `pnpm.overrides`
(a Etapa 28a já usa esse mecanismo para outros casos, mas aqui a atualização
normal bastou). `pnpm-workspace.yaml` não foi tocado.

## Validação de segurança

| Verificação | Resultado |
| --- | --- |
| `pnpm audit` (dev + prod) | `{"info":0,"low":0,"moderate":0,"high":0,"critical":0}` — 681 dependências |
| `pnpm audit --prod` | mesmo resultado — 147 dependências |
| `js-yaml` em `--prod` por workspace, pós-correção | ausente em todos (confirma que a correção não precisava tocar produção — ela não estava lá) |
| `app.asar` empacotado | 2587 entradas, **0** ocorrências de `js-yaml`, `electron-builder`, `app-builder-lib`, `.test.`, `tsconfig` |
| Instalador gerado | `Sparta-Setup-0.9.0-x64.exe`, `NotSigned` (esperado — sem certificado, mesma situação de sempre) |
| `pnpm install --frozen-lockfile` | reproduzível a partir do lockfile atualizado |

O `electron-builder` (um dos dois consumidores de `js-yaml`) foi exercitado de
verdade — `pnpm --filter @sparta/desktop package:win` rodou do início ao fim
com `js-yaml@4.3.1` na árvore, produzindo o instalador normalmente. Isso
confirma que a correção não quebrou o próprio consumidor que a motivou.

Isolamento e política de segurança do Electron não foram tocados (nenhum
arquivo de `apps/desktop/src/main`, `preload` ou `renderer` mudou nesta
etapa) — sandbox, contextIsolation, `safeStorage`, `setWindowOpenHandler`,
CSP e o bridge do preload seguem exatamente como a Etapa 28a deixou.

## Testes

`typecheck`, `lint` (com `eslint@9.39.4` resolvendo `js-yaml@4.3.1` de
verdade), `build` e o analyzer Python passaram limpos. A suíte completa via
`pnpm test` (todos os workspaces em paralelo) reproduziu, várias vezes, o
mesmo padrão de contenção de recursos já documentado na Etapa 26b e
reconfirmado na 31G — a cada execução, um conjunto **diferente e não
sobreposto** de testes de `apps/api` falhava (healthcheck, isolamento de
release, autenticação, patches, catálogo, entre outros — mais de dez nomes
distintos ao todo, nenhum repetido entre execuções). `apps/api` isolado
(`pnpm --filter @sparta/api test`, sem concorrência com os outros quatro
workspaces) passou **46/46 arquivos, 336/336 testes, três vezes seguidas**,
sem nenhuma alteração de código entre as execuções — a assinatura clássica de
flakiness por contenção, não de regressão. `apps/api` não depende de
`js-yaml` em nenhum caminho (confirmado acima), então a mudança desta etapa
não poderia ser a causa de qualquer diferença de comportamento ali.

**1177 testes** no monorepo (core 629, riot 97, api 336, desktop 100, raiz
15) + 1 do analyzer, todos passando.

## Não regressão

Mesma recomendação controlada de sempre (JUNGLE, pick 3, Ahri aliada, Lee Sin
inimigo, bans 55/91):

| # | Campeão | Score | Cobertura | Categoria |
| --- | --- | --- | --- | --- |
| 1 | Viego | 58.7 | 0.9 | comfort_pick |
| 2 | Udyr | 58.5 | 0.5 | strategic_option |
| 3 | Vi | 55.3 | 0.5 | strategic_option |
| 4 | Nocturne | 53.3 | 0.5 | strategic_option |
| 5 | Graves | 50.1 | 0.5 | strategic_option |

Idêntico à linha de base. `release-etapa27c-v1` continua `ACTIVE`,
`currentlyActive: true`, com `artifactHash` (`8878a657…`) e `configHash`
(`fa9dbde1…`) **iguais** antes e depois. Replay do snapshot novo:
**`EXACT_REPLAY`, 0 divergências**.

Champion Select, pré-game, perfil, dashboard, autenticação e onboarding não
foram tocados por esta correção — nenhum arquivo de aplicação mudou, só
`pnpm-lock.yaml`. Como `js-yaml` nunca esteve no caminho de execução desses
fluxos (confirmado pela análise de exposição acima), não há caminho pelo qual
a atualização pudesse afetá-los; `typecheck`/`build` completos nos quatro
pacotes TypeScript são a confirmação estática de que nada quebrou.

## Impacto no bundle

Nenhum. `js-yaml` nunca esteve no `app.asar` nem na imagem da API antes desta
correção, e continua ausente depois — a mudança é inteiramente interna ao
lockfile de desenvolvimento.

## Riscos residuais

- **Nenhum CVE formal** ainda atribuído ao advisory (`cve_id: null` no
  momento da correção) — não é um bloqueador; a severidade e o vetor já vêm
  do próprio GHSA.
- O advisory nota que a mesma classe de falha (`CVE-2026-59870`) afeta a
  linha 3.x também; o Sparta nunca resolveu a 3.x (só a 4.x aparece na árvore),
  então isso não se aplica aqui.
- Esta correção resolve a instância *atual* do alerta. Se `eslint` ou
  `electron-builder` decidirem fixar `js-yaml` numa faixa mais estreita numa
  atualização futura, o próximo `pnpm update` continuará resolvendo a versão
  patched contanto que ela permaneça dentro da faixa declarada.

## Resultado

**`DEPENDABOT_HIGH_RESOLVED`** — a versão vulnerável não existe mais na árvore
resolvida (lockfile e `pnpm audit` confirmam), a correção foi validada contra
os dois consumidores reais (`eslint` via `pnpm lint`, `electron-builder` via
`pnpm package:win`), e o estado do alerta no GitHub foi conferido depois do
push (ver `.ai/CLAUDE.md` para o resultado exato dessa checagem, incluindo
timestamp, já que o Dependabot pode levar alguns minutos para reprocessar o
branch depois de um push).
