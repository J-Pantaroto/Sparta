---
status: PARCIAL
solicitado_em: 2026-07-31 15:30
implementado_em: 2026-07-31 17:05
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

## NAO entregue — falta para encerrar a 26b

1. **Rotas**: `GET /draft-sessions/:sessionId/replay-capability`,
   `GET /recommendation-snapshots/:snapshotId/replay-bundle-summary` e
   `POST /recommendation-snapshots/:snapshotId/verify-replay`.
2. **Laboratorio**: distinguir os cinco estados (`FULL_DERIVATION_REPLAY_INVALID` e
   `FULL_DERIVATION_REPLAY_UNSUPPORTED_VERSION` ainda nao existem no relatorio da 25).
3. **Interface**: as cinco frases no detalhe do snapshot e no Laboratorio do motor.
4. **Observabilidade**: duracao da canonicalizacao e da persistencia, tamanho em bytes no log.
5. **Validacao real**: reconstruir a API, gerar recomendacao pelo fluxo real, confirmar
   atomicidade, rodar o verificador, alterar fonte mutavel em transacao reversivel e confirmar
   que o replay nao muda, conferir snapshot antigo como `REWEIGHT_ONLY`, e checar console/HTTP/
   NaN/Infinity/undefined.

O nucleo de risco (refatorar o caminho ao vivo sem mudar comportamento) esta fechado e verificado;
o que falta e superficie de leitura, que nao altera o motor nem a captura.
