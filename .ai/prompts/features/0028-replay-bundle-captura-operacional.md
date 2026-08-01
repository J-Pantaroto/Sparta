---
status: IMPLEMENTADA
solicitado_em: 2026-07-31 15:30
implementado_em: 2026-07-31 23:01
---

# Captura e integracao operacional do ReplayInputBundle (Etapa 26b)

## Entregue nesta passada

### Contexto unico de avaliacao

`apps/api/src/modules/drafts/evaluation-context.ts` (novo). `buildEvaluationContext` le as
**seis fontes mutaveis uma unica vez** (conta, `PlayerChampionStats`, `ChampionTag`,
`ChampionCapabilityProfile`, historico de matchup, pool), congela o resultado com
`Object.freeze` e nasce com o `evaluatedAt`. A mesma instancia alimenta motor (`runEngine`),
snapshot (`catalogVersionsOf`) e bundle (`buildReplayBundle`).

Antes, `persistDraftAnalysis` recebia um subconjunto **re-derivado** e `championStats`,
`matchups` e `evaluatedAt` nem chegavam la — uma escrita concorrente entre as duas leituras
produziria snapshot e bundle de momentos diferentes.

### Captura atomica

Migration `20260731160000_replay_input_bundle`, **aplicada ao Postgres real**: tabela nova
`ReplayInputBundleRecord`, um-para-um com `RecommendationSnapshot` (`@unique` em `snapshotId`),
com `contentHash` recalculado no backend, `contentJson` validado, `evaluatedAt`, `capturedAt`,
`contentBytes`, versoes e `lastVerification`.

`persistRecommendationSnapshot` grava snapshot **e** bundle na mesma transacao: qualquer falha
derruba as duas escritas. `UNCHANGED` nao cria bundle novo — o snapshot existente mantem o dele.

### Falha nao derruba a recomendacao

`DraftPersistenceResult` ganhou `historyPreserved` e `reason` sanitizado. A analise ao vivo volta
inteira mesmo quando a preservacao falha, e a falha e **declarada** em vez de silenciosa.

### Preservacao de comportamento

Nenhum peso, threshold, formula ou ordenacao mudou — o modulo so reorganiza de onde os inputs
vem. Os 222 testes da API passam, incluindo os da Etapa 16 que cobrem o ranking e a persistencia.

### Testes

10 novos (`evaluation-context.test.ts`): `evaluatedAt` identico entre motor e bundle; perfis de
aliado/inimigo/adversario direto preservados; campeao com dois papeis aparece uma vez;
`capturedAt` fora do hash e `evaluatedAt` dentro; alteracao posterior de estatistica muda o hash
do bundle novo mas nao invalida o ja construido; bundle valido pelo contrato da 26a; bundle
adulterado reprovado por hash; sem `puuid`/credencial/dado pos-partida; e **replay exato** do
resultado do motor a partir so do bundle.

Suite completa: **915 testes**. `typecheck`, `lint`, `test` e `build` completos.

## Encerramento da 26b (segunda passada)

**Cinco estados de capacidade** — `describeSnapshotReplayCapability`
(`packages/core/src/calibration/replay-verifier.ts`) ganhou `FULL_DERIVATION_REPLAY_INVALID`
(`INVALID_BUNDLE`/`REPLAY_INTEGRITY_FAILED` — bundle reprovado, não apenas ausente) e
`FULL_DERIVATION_REPLAY_UNSUPPORTED_VERSION` (`UNSUPPORTED_ALGORITHM_VERSION`/
`UNSUPPORTED_BUNDLE_SCHEMA`). O relatório ganhou `reweightAvailable` como campo próprio, separado
do `capability` — sem isso, um snapshot inválido ou de versão não suportada esconderia que a
reponderação da Etapa 25 ainda funciona.

**Três rotas novas** (`apps/api/src/modules/drafts/replay-bundle-repository.ts` +
`replay-bundle-routes.ts`), autenticadas e isoladas por conta: `GET .../replay-capability`,
`GET .../replay-bundle-summary`, `POST .../verify-replay`. Nenhuma expõe o `contentJson`
completo. `verify-replay` só lê `RecommendationSnapshot`, `PersistedRecommendation` e
`ReplayInputBundleRecord` — as três tabelas imutáveis da 26a — e persiste o resultado em
`lastVerification`, sem reescrever bundle nem snapshot. `GET` nunca dispara verificação nova: só
lê o que já foi persistido, para ficar barato e sem efeito colateral.

**Interface**: `ReplayCapabilitySummary.tsx` (novo, compartilhado) — a frase da capacidade,
schema/motor/tamanho/captura quando há bundle, botão "Verificar replay". Usado em dois lugares
sem redesenhar nenhuma tela: o detalhe de sessão em "Histórico de drafts" e o caso aberto no
"Laboratório do motor".

**Observabilidade**: captura (`persistDraftAnalysis`) loga `replay_bundle_captured`/
`_capture_failed` com schema, `contentBytes`, duração da canonicalização e da persistência;
verificação loga `replay_bundle_verified` com schema, status, contagem de divergências e duração
— nunca o conteúdo do bundle nem as divergências detalhadas.

**Dois bugs reais encontrados só na validação pela UI real** (não pelo curl inicial): (1) o
cliente do desktop sempre manda `Content-Type: application/json` mesmo em `POST` sem corpo, e o
Fastify recusa isso com `FST_ERR_CTP_EMPTY_JSON_BODY` antes da rota rodar — `verifySnapshotReplay`
passou a mandar `body: "{}"`; as outras duas ocorrências do mesmo padrão
(`generateDraftComparison`, `revealDraftReviewResult`) ficaram fora de escopo, sinalizadas à
parte. (2) o botão "Verificar replay" fica dentro do `<button>` do `InteractiveCard` pai (mesmo
padrão que o botão de revisão humana da Etapa 24 já usava) — sem `event.stopPropagation()`, o
clique também colapsava o card. Os dois corrigidos.

**Validação real** (Docker reconstruído, conta Zekerus#117, API + Postgres reais): nova
recomendação via `POST /drafts/recommendations` gravou snapshot+bundle na mesma transação
(confirmado por query direta: 1 bundle por snapshot, nenhum duplicado); as três rotas responderam
corretas nos dois casos (snapshot novo com bundle, snapshot de antes da 26a sem bundle); `POST
verify-replay` no snapshot novo devolveu `EXACT_REPLAY` com **zero divergências** — o motor
reconstruído offline a partir só do bundle reproduziu exatamente `totalScore`, `dataCoverage`,
`rank`, `group` e cada métrica do resultado operacional; o snapshot anterior à 26a (sessão
`cs-teste-etapa16-aaa`) respondeu `REWEIGHT_ONLY` com o motivo correto ("Os inputs de derivação
não eram preservados nesta versão"), nunca corrompido. A independência de fontes mutáveis está
coberta por teste automatizado (`packages/core`: alteração de `PlayerChampionStats`/`ChampionTag`
depois da captura não muda o replay do bundle original) — não foi repetida contra o Postgres real
para não tocar dado pessoal de verdade. Validado também no app real (Electron dev, CDP): 0 erros
de console vindos do código novo, 0 `NaN`/`Infinity`/`undefined`, ranking/scores/cobertura/grupos
idênticos ao anterior.

38 + 4 testes novos no `packages/core` (replay-verifier), mais rotas e repositório no `apps/api`
(replay-bundle-routes/repository). Suíte completa por pacote: `packages/core` 526, `packages/riot`
96, `apps/desktop` 73, `apps/api` 241 — todos passando isoladamente (a suíte agregada via `pnpm -r
test` mostrou flakiness intermitente e pré-existente sob contenção de recursos rodando os quatro
pacotes em paralelo, não reproduzível isolando cada pacote; não é regressão desta etapa).
`typecheck`, `lint` e `build` completos nos quatro pacotes TypeScript.

Ver `docs/replay-input-bundle.md` para o contrato completo, os cinco estados e as rotas.
