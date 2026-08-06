# Auditoria de segurança e prontidão para release (Etapa 28a)

Etapa 31D: sessão persistida usa `safeStorage`, logout/mudança de email revogam versões, conta
inativa não autentica, tokens de email ficam somente por hash e rotas pessoais exigem onboarding
`READY`. Produção falha fechada sem provider transacional e RSO.

Etapa 31C: matriz executável por rota, ownership server-side, 404 cruzado, callback RSO one-time e
bloqueio de legado em produção. Ver `docs/route-authorization-audit.md`.

Auditoria executada com a `release-etapa27c-v1` **operacionalmente ativa**. Nenhum peso, artefato,
configuração ou release foi alterado; a comparação funcional antes/depois está no fim do
documento.

Severidades: `CRITICAL` · `HIGH` · `MEDIUM` · `LOW` · `INFORMATIONAL` · `FALSE_POSITIVE` ·
`ACCEPTED_RISK`.

---

## 1. Dependências

`pnpm audit` no workspace inteiro: **29 advisories** (0 crítico, 14 high, 11 moderate, 4 low).

### Corrigidos por `overrides` (patch/minor, nenhum major)

| Pacote            | Caminho transitivo                                              | Superfície alcançável                                                            | Sev.     | Correção   | Risco de regressão |
| ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------- | ---------- | ------------------ |
| `fast-uri`        | `apps/api > @fastify/swagger > json-schema-resolver > fast-uri` | Resolução de `$ref` de schema no Swagger. Não participa do parsing de requisição | HIGH     | `>=3.1.5`  | Baixo — patch      |
| `find-my-way`     | `apps/api > fastify > find-my-way`                              | DoS via HTTP/2. **A API não habilita HTTP/2**                                    | HIGH     | `>=9.7.0`  | Baixo — minor      |
| `@fastify/static` | `apps/api > @fastify/swagger-ui > @fastify/static`              | Path traversal / bypass de guarda. Alcançável **enquanto `/docs` existir**       | HIGH     | `>=10.1.2` | Baixo — patch      |
| `brace-expansion` | `eslint > minimatch`, `@typescript-eslint > … > minimatch`      | Só ferramenta de build. Não vai a runtime                                        | HIGH     | `>=5.0.9`  | Baixo              |
| `postcss`         | `vitest > vite > postcss`                                       | Só ferramenta de teste                                                           | HIGH/MOD | `>=8.5.23` | Baixo              |

Resultado: **14 high → 4 high**, e as 4 restantes são todas do Electron.

### Adiado com justificativa

| Achado                                                         | Sev.            | Decisão                                                                                                                 |
| -------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `electron@37.10.3` — 17 advisories (4 high, 9 moderate, 4 low) | `ACCEPTED_RISK` | Correção exige **major** 37 → 39.8.5, que o escopo desta etapa proíbe sem decisão específica. Análise de alcance abaixo |

**Alcance real das 17 do Electron.** Cada uma exige (a) uma API que o Sparta não chama, ou (b)
conteúdo web hostil dentro de um renderer. O Sparta carrega **apenas** o próprio bundle
(`file://`) ou o dev server local, sob CSP com `default-src 'self'`, e agora com navegação externa
bloqueada. Nenhuma das APIs citadas é usada: `moveToApplicationsFolder`, `setAsDefaultProtocolClient`,
`setLoginItemSettings`, `clipboard.readImage`, offscreen rendering, WebUSB, service workers,
`executeJavaScript`, `webRequest`, protocolo customizado, `PowerMonitor`. As de `window.open`
deixaram de ter caminho com o `setWindowOpenHandler` desta etapa.

**Recomendação registrada**: subir para Electron 39.8.5+ numa etapa própria, com validação do
build empacotado — o salto de major muda o Chromium e o comportamento de sandbox/preload, que já
causou um bug real neste projeto.

### Outros itens de dependência

| Achado                                                                                | Sev.          | Situação                                                                                                                                             |
| ------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imagem da API instalava com `--frozen-lockfile=false` **sem copiar o lockfile**       | HIGH          | **Corrigido**: lockfile copiado + `--frozen-lockfile`. Antes, cada build resolvia do zero e a imagem podia divergir em silêncio do conjunto auditado |
| devDependencies (eslint, vitest, typescript, prettier) presentes na imagem de runtime | MEDIUM        | **Adiado** — ver §6                                                                                                                                  |
| `node:20-slim` sem digest fixo                                                        | LOW           | `ACCEPTED_RISK`. Fixar digest exige processo de atualização que ainda não existe                                                                     |
| Licenças                                                                              | INFORMATIONAL | Nenhuma copyleft forte (GPL/AGPL) nas dependências de runtime                                                                                        |

---

## 2. POSTs sem corpo — corrigido de forma central

`generateDraftComparison` e `revealDraftReviewResult` mandavam `POST` sem corpo com
`Content-Type: application/json`; o Fastify recusa com `FST_ERR_CTP_EMPTY_JSON_BODY` (400)
**antes de a rota rodar**.

A causa não estava nas duas funções: `request()` injetava o header em **toda** requisição. A
correção é no ponto central — o header só é enviado quando há corpo. Isso eliminou a classe
inteira e permitiu remover os dois contornos `body: "{}"` que as Etapas 26b e 27c tinham
adicionado (`verifySnapshotReplay`, `validateRelease`). Requisições que enviam JSON de verdade não
mudaram: as 25 restantes seguem com o header.

Severidade: MEDIUM (funcional — os botões afetados nunca funcionaram). Testes em
`app.security.test.ts`.

---

## 3. API

| #    | Achado                                                                                                                                                                                    | Sev.   | Situação                                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | **`setErrorHandler` registrado depois dos `register`** — no Fastify, cada contexto encapsulado herda o handler existente no momento em que é criado, então ele **nunca chegava às rotas** | HIGH   | **Corrigido** (movido para antes). Achado só porque o teste de segurança reprovou a primeira versão da correção                                                                  |
| 3.2  | Erro de schema (zod) devolvia **500** com o dump completo do erro, incluindo schema interno e valores recebidos                                                                           | MEDIUM | **Corrigido**: 400 `invalid_payload` com apenas os nomes dos campos                                                                                                              |
| 3.3  | Erro não classificado devolvia `error.message` cru — um erro de Prisma vazaria tabela/coluna/conexão                                                                                      | MEDIUM | **Corrigido**: 5xx devolve mensagem genérica; o detalhe vai para o log                                                                                                           |
| 3.4  | Nenhum cabeçalho de endurecimento                                                                                                                                                         | MEDIUM | **Corrigido**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`, CSP, e remoção de `X-Powered-By`                                  |
| 3.5  | `/docs` (Swagger UI) exposto incondicionalmente, arrastando `@fastify/static`                                                                                                             | MEDIUM | **Corrigido**: publicado só com `NODE_ENV === "development"` (opt-in — ambiente sem `NODE_ENV` não ganha docs por omissão)                                                       |
| 3.6  | Stack traces na resposta                                                                                                                                                                  | —      | `FALSE_POSITIVE`: nunca vazaram, verificado antes e depois                                                                                                                       |
| 3.7  | Tokens ou conteúdo de bundle em log                                                                                                                                                       | —      | `FALSE_POSITIVE`: nenhuma ocorrência                                                                                                                                             |
| 3.8  | **PUUID aparece em log** via `req.url` das rotas `/players/:puuid/...`                                                                                                                    | LOW    | `ACCEPTED_RISK` documentado. Remover exigiria trocar o contrato público dessas rotas, o que o escopo proíbe. O PUUID é um identificador da Riot, não um segredo, e o log é local |
| 3.9  | Isolamento por conta                                                                                                                                                                      | —      | **Verificado**: toda rota de release/calibração resolve `riotAccountId` do token e filtra por ele; nenhuma aceita id de conta do cliente. Coberto por teste                      |
| 3.10 | Autorização de ativação/rollback                                                                                                                                                          | —      | **Verificado**: exigem autenticação + conta Riot; corpo aceita só `reason`, e peso enviado no corpo é ignorado por construção (teste existente da 27b)                           |
| 3.11 | CORS                                                                                                                                                                                      | —      | **Verificado**: allowlist explícita. Origem ausente é aceita de propósito (app empacotado envia `null`)                                                                          |
| 3.12 | Rate limit                                                                                                                                                                                | LOW    | Global 100/min; login/registro 5/min. Rotas de release não têm limite próprio — `ACCEPTED_RISK`: são autenticadas, isoladas por conta e idempotentes por status                  |
| 3.13 | Prisma a partir de entrada                                                                                                                                                                | —      | **Verificado**: nenhuma query construída por concatenação; tudo via API tipada                                                                                                   |

---

## 4. Electron

| #    | Achado                                                                                                  | Sev.   | Situação                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | `contextIsolation: true`, `nodeIntegration: false`                                                      | —      | **Verificado**                                                                                                                                                         |
| 4.2  | `sandbox` não declarado explicitamente                                                                  | LOW    | **Corrigido**: declarado `true`. Já era o padrão efetivo — é por causa dele que o preload precisa ser CommonJS                                                         |
| 4.3  | **Sem `setWindowOpenHandler`** — `window.open` criaria janela nova com preferências padrão, fora da CSP | MEDIUM | **Corrigido**: nega por padrão                                                                                                                                         |
| 4.4  | **Sem guarda de `will-navigate`** — navegação induzida substituiria o app mantendo preload e bridge     | MEDIUM | **Corrigido**: só o próprio bundle e o dev server declarado                                                                                                            |
| 4.5  | Bridge do preload                                                                                       | —      | **Verificado**: allowlist explícita de 9 métodos nomeados. Sem `invoke` genérico, sem `ipcRenderer`, `require` ou `process` no renderer (confirmado no app empacotado) |
| 4.6  | `download-skin` recebe URL do renderer                                                                  | —      | **`FALSE_POSITIVE`**: exige `https:`, host em allowlist (Data Dragon / Community Dragon), `content-type: image/*`, e usa `basename()` — sem SSRF nem path traversal    |
| 4.7  | CSP do renderer                                                                                         | —      | **Verificado**: `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`. `style-src 'unsafe-inline'` é exigido pelo tema dinâmico (tokens em runtime)             |
| 4.8  | `connect-src` permite `http://localhost:*` (qualquer porta)                                             | LOW    | `ACCEPTED_RISK`: a porta da API é configurável por `VITE_API_URL`                                                                                                      |
| 4.9  | DevTools no build final                                                                                 | —      | **Verificado**: 0 ocorrências de `openDevTools`/`remote-debugging` no bundle                                                                                           |
| 4.10 | Credenciais no renderer                                                                                 | —      | **Verificado**: nenhuma chave da Riot; só o token de sessão em `localStorage`, que é do próprio usuário                                                                |

---

## 5. Banco e dados

| #   | Achado                                                                                                                                                                                      | Sev.          | Situação                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Unicidade e FKs das tabelas de release                                                                                                                                                      | —             | **Verificado**: ponteiro com PK por conta (garante "uma ativa" estruturalmente), `@@unique(riotAccountId, artifactHash)`, FK da release para a **revisão exata** da candidata                                               |
| 5.2 | Índices das consultas principais                                                                                                                                                            | —             | **Verificado**: todos os caminhos quentes cobertos                                                                                                                                                                          |
| 5.3 | 4 FKs sem índice no lado filho (`MatchParticipant.riotAccountId`, `RiotAccount.userId`, `DraftPostGameComparisonRevision.riotAccountId`, `RecommendationEngineRelease.candidateRevisionId`) | LOW           | `ACCEPTED_RISK`: volume atual é pequeno; é questão de desempenho, não de segurança                                                                                                                                          |
| 5.4 | Transações                                                                                                                                                                                  | —             | **Verificado**: ativação e rollback em transação **serializável** com reivindicação atômica; snapshot + bundle na mesma transação                                                                                           |
| 5.5 | Migration `20260727234500_http_cache_states` marcada como revertida, com o arquivo ainda presente                                                                                           | INFORMATIONAL | `migrate status` reporta "up to date". Numa base **nova** ela seria aplicada — registrado como item de plano de recuperação, não corrigido (mexer em histórico de migration é arriscado e o escopo proíbe apagar histórico) |
| 5.6 | Campos sensíveis                                                                                                                                                                            | —             | `User.passwordHash` (scrypt) e `puuid` em 3 tabelas. Nenhum token persistido                                                                                                                                                |
| 5.7 | Backfill acidental                                                                                                                                                                          | —             | **Verificado**: canonicalização do bundle é versionada; os 16 bundles v1 seguem intactos e sem configuração embutida                                                                                                        |

---

## 6. Containers e produção

| #   | Achado                                                                                                                                                   | Sev.          | Situação                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | **Processo rodava como root**                                                                                                                            | HIGH          | **Corrigido**: `USER node` (uid 1000). Confirmado no container em execução                                                                                                                                                                                                                              |
| 6.2 | **Build sem lockfile + `--frozen-lockfile=false`**                                                                                                       | HIGH          | **Corrigido** (ver §1)                                                                                                                                                                                                                                                                                  |
| 6.3 | Sem healthcheck                                                                                                                                          | MEDIUM        | **Corrigido**: `HEALTHCHECK` batendo em `/health`; container reporta `healthy`                                                                                                                                                                                                                          |
| 6.4 | Sem política de reinício nem período de graça                                                                                                            | MEDIUM        | **Corrigido**: `restart: unless-stopped`, `stop_grace_period: 15s`                                                                                                                                                                                                                                      |
| 6.5 | **Sem encerramento controlado** — SIGTERM matava o processo na hora, cortando requisição em curso e deixando transação aberta para o timeout do Postgres | MEDIUM        | **Corrigido**: `SIGTERM`/`SIGINT` chamam `app.close()`                                                                                                                                                                                                                                                  |
| 6.6 | devDependencies na imagem de runtime; imagem passou de 1,06 GB para **1,58 GB**                                                                          | MEDIUM        | **Adiado**. Exige reestruturar para multi-stage com `pnpm deploy`, o que tem risco real de regressão (caminhos do Prisma client, linkagem de workspace) e não é mudança de baixo risco. O crescimento veio do `--frozen-lockfile` resolver o conjunto completo. **Item explícito para a próxima etapa** |
| 6.7 | Secrets em build args ou na imagem                                                                                                                       | —             | **`FALSE_POSITIVE`**: nenhum `ARG` de secret; `.env` entra por `env_file` em runtime                                                                                                                                                                                                                    |
| 6.8 | `NODE_ENV=development` vindo do `.env` sobrescreve o da imagem                                                                                           | MEDIUM        | Registrado. O ambiente local **deve** ser `development`. Para deploy real: `NODE_ENV=production` **e** `AUTH_TOKEN_SECRET` forte (a guarda em `env.ts` recusa subir com o default). O gating de `/docs` foi feito opt-in justamente para não depender disso                                             |
| 6.9 | Comportamento sem Redis                                                                                                                                  | INFORMATIONAL | Redis é provisionado mas **nenhum código o consome** hoje; a API sobe sem ele                                                                                                                                                                                                                           |

---

## 7. Impacto sobre a release ativa

Nenhuma correção tocou motor, pesos, artefato, provider ou conteúdo funcional de bundle.
Comparação com o mesmo contexto controlado (JUNGLE, `pickOrder` 3, Ahri aliada, Lee Sin adversário
direto):

```
ANTES : Viego:58.7:0.9:1 | Udyr:58.5:0.5:2 | Vi:55.3:0.5:3 | Nocturne:53.3:0.5:4 | Graves:50.1:0.5:5
DEPOIS: Viego:58.7:0.9:1 | Udyr:58.5:0.5:2 | Vi:55.3:0.5:3 | Nocturne:53.3:0.5:4 | Graves:50.1:0.5:5
```

- `artifactHash` e `configHash` da release ativa: **idênticos**
- Release ativa: `release-etapa27c-v1`, `ACTIVE`, ponteiro inalterado
- Replay do snapshot novo: `EXACT_REPLAY`, 0 divergências
- Replay do snapshot da linha de base: `EXACT_REPLAY`, 0 divergências (histórico preservado)

---

## 8. Build empacotado

Executado a partir de `apps/desktop/out`, **sem** o dev server, num caminho com espaço e acento
(`.../OneDrive/Área de Trabalho/...`):

- Carrega de `file:///…/%C3%81rea%20de%20Trabalho/…` — acentuação tratada corretamente
- `window.sparta` com exatamente os 9 métodos da allowlist
- `ipcRenderer`, `require`, `process` e canal genérico: **todos ausentes**
- 9 telas de navegação renderizam; Laboratório mostra "Release ativa" e `release-etapa27c-v1`,
  sem "Fallback para baseline em uso"
- 0 erro de console, 0 imagem quebrada, 0 `NaN`/`undefined`
- 0 referência ao dev server no bundle; 0 DevTools

Instalador **não** foi publicado, conforme o escopo. Não existe configuração de electron-builder
no repositório — segue como item aberto.

---

## 9. Riscos restantes

| Item                                     | Sev.            | Por que ficou                                                                                     |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| Electron 37 → 39.8.5 (17 advisories)     | `ACCEPTED_RISK` | Major; nenhuma alcançável pelo uso atual (§1). Merece etapa própria com revalidação do empacotado |
| devDependencies na imagem (1,58 GB)      | MEDIUM          | Multi-stage não é mudança de baixo risco                                                          |
| PUUID em log de acesso                   | LOW             | Remover mudaria contrato público de rota                                                          |
| FKs sem índice                           | LOW             | Desempenho, não segurança                                                                         |
| Migration revertida com arquivo presente | INFORMATIONAL   | Mexer em histórico de migration é arriscado                                                       |
| `node:20-slim` sem digest                | LOW             | Exige processo de atualização inexistente                                                         |
| Sem configuração de instalador           | —               | Fora do escopo desta subetapa                                                                     |

---

## 10. Verificação

`typecheck`, `lint`, `test` e `build` aprovados nos quatro pacotes TypeScript após todas as
correções: **core 620, riot 96, api 277, desktop 73** — 1066 testes.

Os testes novos (`apps/api/src/app.security.test.ts`, 14 casos) cobrem cabeçalhos, 400 sanitizado,
erro interno sem vazamento, POST sem corpo, `/docs` fechado fora de desenvolvimento e exigência de
autenticação nas rotas de release. Dois testes pré-existentes que **afirmavam** o comportamento
defeituoso (zod → 500) foram atualizados para o comportamento correto.

---

# Hardening final e candidato de release (Etapa 28b)

Esta parte fecha os riscos que a 28a deixou registrados como abertos. Cada linha da tabela de
"Riscos restantes" acima é reendereçada abaixo com o resultado **medido**, não com a intenção.

## 11. Situação de cada risco herdado da 28a

| Item da 28a                              | Situação agora                      | Evidência                                                                                                                                                                                                                                            |
| ---------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron 37 → 39 (17 advisories)         | **Corrigido**                       | Electron **39.8.10**; `pnpm audit` volta 0 em todas as severidades. App empacotado revalidado: `window.open` externo devolve `null`, `ipcRenderer`/`require`/`process`/`Buffer`/`global`/`module` todos `undefined`, CSP aplicada, 0 erro de console |
| devDependencies na imagem (1,58 GB)      | **Corrigido**                       | Dockerfile multi-stage: **1,58 GB → 513 MB**, boot **3444 ms → 836 ms**                                                                                                                                                                              |
| PUUID em log de acesso                   | **Corrigido**                       | `apps/api/src/http/log-redaction.ts`; medido no container: `"url":"/players/pid_3907b354893f/recent-matches?limit=3"`                                                                                                                                |
| FKs sem índice                           | **Corrigido no caso com evidência** | Um índice criado (`MatchParticipant.riotAccountId`), com plano antes/depois. Os outros três **não** foram criados — ver §13                                                                                                                          |
| Migration revertida com arquivo presente | **O achado da 28a estava errado**   | Há duas linhas: tentativa que nunca terminou (`applied_steps_count = 0`) **e** aplicação bem-sucedida 92 s depois (`= 1`). `ApiCacheEntry.collectedAt` existe. Schema consistente; nada a corrigir. Ver `docs/database-migrations.md`                |
| `node:20-slim` sem digest                | **Corrigido**                       | `ARG NODE_IMAGE=node:20-slim@sha256:2cf067cf…`                                                                                                                                                                                                       |
| Sem configuração de instalador           | **Corrigido**                       | `apps/desktop/electron-builder.yml`; instalador gerado e exercitado — ver §14                                                                                                                                                                        |

## 12. Dependências — classificação final

`pnpm audit` e `pnpm audit --prod`, com o Electron 39 e o `electron-builder` já no grafo:

```txt
{"info":0,"low":0,"moderate":0,"high":0,"critical":0}
```

Nenhum alerta remanescente. Os 29 advisories que a 28a encontrou ficam classificados assim:

| Grupo                                                                | Classificação | Como                                                                                                                                                                             |
| -------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fast-uri`, `find-my-way`, `@fastify/static` (produção, via Fastify) | **corrigido** | `overrides` de faixa mínima, sem salto de major                                                                                                                                  |
| `brace-expansion`, `postcss` (só ferramenta de desenvolvimento)      | **corrigido** | `overrides`; nunca alcançavam produção, corrigidos por higiene                                                                                                                   |
| 17 advisories do Electron 37                                         | **corrigido** | Atualização para 39.8.10, com revalidação do empacotado                                                                                                                          |
| `@noble/hashes` v2 exigido como CJS pelo `electron-builder`          | **corrigido** | Override **escopado** (`app-builder-lib>@noble/hashes`): a incompatibilidade é de formato de módulo, não vulnerabilidade, e o escopo impede que o pin vaze para o resto do grafo |

**Não coberto**: pacotes do sistema operacional dentro de `node:20-slim`. `pnpm audit` só enxerga o
grafo npm. Fixar a imagem por digest torna a base **reproduzível e auditável**, não isenta — subir o
digest continua sendo uma decisão manual, e este repositório não tem scanner de imagem.

## 13. Índices — o que entrou e o que ficou de fora

Regra aplicada: índice só entra com plano medido antes e depois. O `EXPLAIN ANALYZE` da consulta
real (`MatchParticipant` filtrado por `riotAccountId`) mostrou `Seq Scan` com custo **14.75**;
depois do índice, `Index Scan using "MatchParticipant_riotAccountId_idx"` com custo **9.53**.

As outras três FKs sem índice **não** ganharam índice: nas cardinalidades reais desta base o
planejador escolhe varredura sequencial de qualquer forma, então o índice custaria escrita e espaço
sem mudar plano nenhum. Criá-los seria especulação, e a instrução era explícita contra isso.

## 14. Instalador — o que existe e o que ele não é

`pnpm --filter @sparta/desktop package:win` gera `Sparta-Setup-0.1.0-x64.exe` (NSIS, x64, por
usuário). Exercitado de verdade: instalação silenciosa em `C:\…\Sparta Validação` — caminho **com
acento e espaço** —, `ExitCode 0`, atalhos de área de trabalho e menu iniciar criados, entrada de
desinstalação com `Publisher: J-Pantaroto`. O app instalado abriu a partir de `file://…/app.asar`,
sem Vite, e passou as 10 telas com 0 imagem quebrada, 0 `NaN`/`undefined` e 0 erro de console.

O conteúdo do `asar` foi verificado entrada a entrada: **0** arquivos `.ts`/`.tsx`, `.map`,
`.test.*`, `tsconfig*`, `vitest.config`, `electron.vite.config`, `.env*` e **0** referências a
`src/`. Só `out/` compilado, `package.json` e as dependências de produção.

**O instalador é não assinado.** `Get-AuthenticodeSignature` devolve `NotSigned`. O log do
electron-builder imprime "signing with signtool.exe" mesmo sem certificado — a linha é enganosa, e
por isso a verificação foi feita contra o binário, não contra o log. Nada no empacotamento simula
assinatura. O efeito no SmartScreen está descrito em `docs/release-candidate.md`.

**Nada foi publicado**: sem bloco `publish` no `electron-builder.yml`, todos os comandos passam
`--publish never`, e não há GitHub Release nem distribuição externa.

## 15. Prova de não regressão

Mesma recomendação controlada (JUNGLE, pick 3, Ahri aliada, Lee Sin inimigo, bans 55/91), contra a
API **reconstruída do zero**, comparada com a captura feita antes de qualquer mudança desta etapa:

| #   | Campeão  | Score | Cobertura | Resultado |
| --- | -------- | ----- | --------- | --------- |
| 1   | Viego    | 58.7  | 0.9       | idêntico  |
| 2   | Udyr     | 58.5  | 0.5       | idêntico  |
| 3   | Vi       | 55.3  | 0.5       | idêntico  |
| 4   | Nocturne | 53.3  | 0.5       | idêntico  |
| 5   | Graves   | 50.1  | 0.5       | idêntico  |

Idênticos também categoria, códigos de motivo e códigos de alerta em todos os cinco.

A release ativa não foi tocada: `release-etapa27c-v1` continua `ACTIVE`, com `artifactHash`
`8878a657…` e `configHash` `fa9dbde1…` **iguais** antes e depois. O snapshot novo saiu com
`configurationSource = RELEASE`, bundle `replay-input-bundle/2.0.0` (121 387 bytes) com a
configuração embutida, e `verify-replay` devolveu **`EXACT_REPLAY` com 0 divergências**.

## 16. Comportamento sob falha, medido no container

| Cenário                             | Resultado                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reinício da API                     | Release ativa continua resolvida corretamente; ponteiro preservado                                                                                                                                                   |
| Duas resoluções dentro do TTL       | `cacheState` `MISS` → `HIT`                                                                                                                                                                                          |
| Postgres derrubado, rota de leitura | HTTP 500 com corpo genérico ("Não foi possível concluir a operação."); `PrismaClientKnownRequestError` fica **só no log**. Nenhum vazamento de `prisma`, `postgres`, `5432`, nome de tabela, `DATABASE_URL` ou stack |
| Postgres derrubado, processo        | API continua de pé (`/health` 200)                                                                                                                                                                                   |
| `SIGTERM`                           | Encerramento gracioso em **864 ms**, `exit code 0` (não SIGKILL), com `shutdown_requested` registrado                                                                                                                |

Ressalva honesta: derrubar o Postgres inteiro exercita o **caminho de erro sanitizado**, não o
fallback do provider — a rota `/recommendation-engine/active-release` lê o repositório direto e
legitimamente não tem o que responder sem banco. O fallback do provider (`fallbackUsed: true`,
`DB_READ_FAILED_NO_LAST_KNOWN` → baseline) está coberto por teste automatizado, onde a falha de
leitura pode ser isolada do resto da avaliação.

## 17. O que continua em aberto

| Item                                 | Por quê                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| Instalador sem assinatura de código  | Exige certificado OV/EV de autoridade reconhecida — decisão de negócio, não técnica |
| Sem scanner de imagem de container   | `pnpm audit` não vê pacote de sistema operacional; adotar scanner é etapa própria   |
| Atualização do digest da imagem-base | Fixar por digest congela; subir exige processo manual deliberado                    |
| Publicação e distribuição            | Fora do escopo por instrução explícita                                              |

## 18. Verificação

`typecheck`, `lint`, `test` e `build` aprovados nos quatro pacotes TypeScript: **core 620, riot 96,
api 285, desktop 73** e 2 na raiz — **1076 testes**. Os 8 testes novos desta etapa cobrem a redação
de log (`apps/api/src/http/log-redaction.test.ts`): substituição do PUUID por rótulo opaco,
preservação de query string, caminhos aninhados, rotas sem identificador, estabilidade e distinção
do rótulo, ausência de qualquer subsequência do identificador original, e o serializador não emitir
headers.
