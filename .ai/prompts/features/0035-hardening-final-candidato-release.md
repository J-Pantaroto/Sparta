---
status: IMPLEMENTADA
solicitado_em: 2026-08-04 14:10
implementado_em: 2026-08-04 16:55
---

# Etapa 28b — Hardening final e candidato de release

## Pedido original

> Fechar os riscos que a 28a deixou abertos e produzir um candidato de release **local**:
> atualização isolada do Electron 37 → 39 com revalidação do empacotado; Dockerfile multi-stage com
> imagem-base fixada por digest; redação de logs tirando o PUUID do log de acesso; índices de banco
> só com evidência de plano; política de migrations documentada, incluindo o que fazer com a
> migration marcada como revertida; configuração do empacotamento Windows com metadados
> consistentes; SBOM, checksums e inventário do candidato sem segredo nenhum; validação completa do
> candidato (API do zero e Electron empacotado); auditoria final com classificação de cada alerta e
> prova de não regressão comparando uma recomendação controlada antes e depois.
>
> Restrições explícitas: não alterar pesos, artefato da release, `configHash`, `artifactHash`,
> motor, ranking nem o estado da release ativa. Não publicar artefatos, não criar GitHub Release,
> não iniciar distribuição externa, não configurar publicação automática. Sem certificado, declarar
> o instalador como não assinado e documentar as limitações do SmartScreen — sem simular assinatura.
> Não apagar histórico do banco nem reescrever migration já aplicada. Não declarar vulnerabilidade
> resolvida só por estar em dependência transitiva. Não desabilitar controle de segurança para
> contornar incompatibilidade. Não criar índice duplicado ou especulativo. Não estabelecer redução
> fictícia — reportar o resultado real.

## Notas de implementação

Relatório completo em `docs/security-audit.md` §11–18 (espelhado em `.ai/specs/`). Inventário do
candidato em `docs/release-candidate.md`, gerado por `scripts/release-inventory.mjs`. Política de
migrations em `docs/database-migrations.md`.

### Electron 37 → 39.8.10

Feito isolado, antes de qualquer outra mudança. Zera os 17 advisories que a 28a tinha classificado
como `ACCEPTED_RISK`. A revalidação foi feita no **app empacotado**, não no dev server: `window.open`
externo devolve `null`, `ipcRenderer`/`require`/`process`/`Buffer`/`global`/`module` todos
`undefined`, CSP aplicada, 0 erro de console. Nenhum controle de segurança foi afrouxado para a
atualização passar.

### Dockerfile multi-stage — 1,58 GB → 513 MB, boot 3444 ms → 836 ms

Três estágios (`deps` → `build` → `runtime`) sobre a mesma imagem-base fixada por digest
(`node:20-slim@sha256:2cf067cf…`). O detalhe que faz a diferença é `rm -rf node_modules` **antes** do
`pnpm install --prod`: sem isso a store virtual do pnpm sobrevive e as devDependencies continuam na
imagem, com o `--prod` mudando só os links. Medido: a redução é real, não estimada.

### Redação de log

`apps/api/src/http/log-redaction.ts`. O PUUID no caminho vira um rótulo opaco derivado de
SHA-256 com sal de processo (`pid_3907b354893f`) — estável dentro da execução, para correlacionar
requisições, e sem nenhuma subsequência do identificador original. O serializador de requisição não
coleta headers, e `redact` do pino cobre `authorization`/`cookie`/`set-cookie` caso algum caminho
futuro passe a emiti-los: as duas camadas se reforçam em vez de uma depender da outra.

### Índices — um criado, três recusados

`MatchParticipant.riotAccountId` ganhou índice com `EXPLAIN ANALYZE` antes e depois: `Seq Scan`
custo 14.75 → `Index Scan` custo 9.53. As outras três FKs sem índice **não** ganharam: nas
cardinalidades reais o planejador escolhe varredura sequencial de qualquer jeito, então seria custo
de escrita sem mudança de plano.

### O achado da 28a sobre a migration revertida estava errado

A 28a registrou `20260727234500_http_cache_states` como possivelmente incompleta. A verificação
direta mostra **duas** linhas em `_prisma_migrations`: uma tentativa que nunca terminou
(`applied_steps_count = 0`, marcada como revertida) e a aplicação bem-sucedida 92 segundos depois
(`= 1`). A coluna `ApiCacheEntry.collectedAt` existe. O schema está consistente e não há nada a
corrigir — a linha revertida é registro honesto e fica onde está.

### Instalador Windows — configurado e exercitado, não publicado

`apps/desktop/electron-builder.yml`: NSIS x64 por usuário, `files` como allowlist mais exclusões
explícitas, `artifactName` previsível, sem bloco `publish`. O `asar` foi conferido entrada a
entrada: 0 `.ts`/`.tsx`/`.map`/`.test.*`/`tsconfig*`/`vitest.config`/`electron.vite.config`/`.env*`
e 0 referência a `src/`.

Exercitado de verdade: instalação silenciosa em `C:\…\Sparta Validação` (caminho com acento e
espaço), `ExitCode 0`, atalhos criados, entrada de desinstalação com `Publisher: J-Pantaroto`. O app
instalado abriu de `file://…/app.asar` (sem Vite) e passou as 10 telas com 0 imagem quebrada, 0
`NaN`/`undefined` e 0 erro de console/main/preload.

**Não assinado**, confirmado contra o binário (`Get-AuthenticodeSignature` → `NotSigned`). Detalhe
que vale registrar: o log do electron-builder imprime "signing with signtool.exe" mesmo sem
certificado — por isso a verificação foi feita no binário e não no log. As limitações do SmartScreen
estão em `docs/release-candidate.md`.

### Dois problemas reais encontrados no caminho

1. **`electron-builder` não subia**: `app-builder-lib` faz `require()` de `@noble/hashes@2`, que é
   ESM-only → `ERR_REQUIRE_ESM`. Resolvido com override **escopado** (`app-builder-lib>@noble/hashes`),
   para o pin não vazar para o resto do grafo. É incompatibilidade de formato de módulo, não
   vulnerabilidade.
2. **O ícone do instalador estava sendo ignorado pelo git**: a regra genérica `build/` no
   `.gitignore` casava com `apps/desktop/build/`. Num clone limpo, `package:win` produziria o
   instalador com o ícone padrão do Electron. Corrigido com negação explícita — o ícone é fonte, não
   artefato.

### Inventário do candidato

`scripts/release-inventory.mjs` gera `docs/release-candidate.md` com commit, versão do app, Electron,
digest da imagem-base e da construída, SHA-256 dos artefatos, resumo das 21 migrations e SBOM de
produção (API 140 pacotes, desktop 28, com licença declarada). O gerador não lê `.env`, não lê
variável de ambiente do projeto e não consulta o banco — verificado que a saída não contém
`AUTH_TOKEN_SECRET`, `RIOT_API_KEY`, `DATABASE_URL`, string de conexão nem chave da Riot.

### Prova de não regressão

Mesma recomendação controlada, contra a API reconstruída do zero: os **5 candidatos idênticos** em
score, cobertura, rank, categoria, códigos de motivo e códigos de alerta (Viego 58.7/0.9, Udyr
58.5/0.5, Vi 55.3/0.5, Nocturne 53.3/0.5, Graves 50.1/0.5). Release ativa intocada —
`release-etapa27c-v1` continua `ACTIVE` com `artifactHash` e `configHash` iguais. Snapshot novo com
bundle `replay-input-bundle/2.0.0` e `verify-replay` em `EXACT_REPLAY`, 0 divergências.

### Comportamento sob falha, medido no container

Reinício preserva a release ativa; cache `MISS` → `HIT` dentro do TTL; Postgres derrubado produz 500
com corpo genérico e o `PrismaClientKnownRequestError` só no log (sem vazar `prisma`, `postgres`,
`5432`, nome de tabela, `DATABASE_URL` ou stack), com a API de pé; `SIGTERM` encerra em 864 ms com
exit code 0.

Ressalva registrada no relatório: derrubar o Postgres inteiro exercita o caminho de erro sanitizado,
**não** o fallback do provider — a rota de leitura consulta o repositório direto. O fallback
(`fallbackUsed: true`, `DB_READ_FAILED_NO_LAST_KNOWN` → baseline) está coberto por teste
automatizado, onde a falha de leitura pode ser isolada.

## Testes

8 testes novos em `apps/api/src/http/log-redaction.test.ts`. Total do monorepo: **1076** (core 620,
riot 96, api 285, desktop 73, raiz 2). `typecheck`, `lint`, `test` e `build` completos nos quatro
pacotes TypeScript.

## O que não foi feito, por instrução

Nenhuma publicação: sem GitHub Release, sem distribuição externa, sem configuração de publicação
automática. Nenhuma alteração de peso, artefato, `configHash`, `artifactHash`, motor, ranking ou
estado da release ativa. Nenhuma migration reescrita e nenhum histórico apagado.
