---
status: IMPLEMENTADA
solicitado_em: 2026-08-04 03:50
implementado_em: 2026-08-04 03:58
---

# Ativação controlada da release real `release-etapa27c-v1`

## Pedido original

> Ative explicitamente a release real `release-etapa27c-v1`. Antes da ativação, registre: baseline
> atualmente ativa, status `READY_FOR_ACTIVATION`, `artifactHash`, `configHash`, equivalência
> `MATCH`, ausência de outra release ativa. Após a ativação, valide imediatamente os 11 pontos
> (unicidade, ponteiro, hashes inalterados, cache invalidado, origem `RELEASE`, recomendação real,
> eco em snapshot e bundle, schema v2, replay `EXACT_REPLAY`, independência de fontes externas,
> ausência de anomalias em API/Electron/logs). Não altere pesos, artefato ou configuração. Se
> qualquer validação crítica falhar, rollback imediato, preservar evidências, registrar a causa e
> **não** corrigir e reativar na mesma operação.

## Resultado: ativada e mantida ativa — 11/11 validações aprovadas

Esta é a primeira release operacional do Sparta a ficar ativa de forma sustentada. A tentativa
anterior (`release-etapa27b-v2`) foi revertida por falha de integridade do replay; a Etapa 27c
corrigiu a causa (bundle autossuficiente), e esta ativação é a confirmação em produção real.

### Estado pré-ativação registrado

| Item | Valor |
| --- | --- |
| Configuração operacional | `BUILT_IN_BASELINE` (3 cenários: blind, lane revelada, meio do draft) |
| Status | `READY_FOR_ACTIVATION` |
| `artifactHash` | `8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90` |
| `configHash` | `fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38` |
| `validatedArtifactHash == artifactHash` | `t` |
| Validação | `VALID` |
| Equivalência laboratório × motor | `MATCH` |
| Releases ativas / ponteiros | 0 / 0 |

### As 11 validações pós-ativação

1. **Uma release `ACTIVE`** — `releases_ACTIVE=1`.
2. **Ponteiro correto** — 1 ponteiro, apontando para `release-etapa27c-v1`, id conferido.
3. **Artefato e hashes inalterados** — `artifactHash` e `configHash` idênticos aos de antes;
   `validatedArtifactHash == artifactHash`; os hashes internos do `artifactJson` também batem.
4. **Cache invalidado** — `release_activated` com `cacheInvalidated: true`; resolução seguinte
   veio `MISS` e depois `HIT`, nunca `HIT` de valor velho.
5. **Origem `RELEASE`** — `GET /recommendation-engine/active-release` devolve `RELEASE` com os
   pesos reais e **sem** as tabelas de baseline (elas só aparecem quando há fallback).
6. **Recomendação real** — `SAVED`, 5 principais, todos os scores finitos.
7. **Eco idêntico em snapshot e bundle** — 9 conferências cruzadas, todas `t`: origem, `releaseId`,
   versão, `configHash`, `algorithmVersions`, e a **configuração efetiva byte a byte igual** entre
   `RecommendationSnapshot.effectiveConfigurationJson` e
   `ReplayInputBundleRecord.contentJson.effectiveRecommendationConfiguration`.
8. **Schema v2** — `replay-input-bundle/2.0.0`.
9. **Replay offline** — `EXACT_REPLAY`, **0 divergências**. É exatamente o cenário que deu
   `REPLAY_INTEGRITY_FAILED` com 10 divergências na ativação da 27b.
10. **Independência de fontes externas**, provada por três vias:
    - a API foi **reiniciada** (cache em memória zerado) e o replay seguiu `EXACT_REPLAY`;
    - o snapshot da 27b tem `configHash` `2cefcade…`, e a release dona desse hash **ainda existe
      no banco** (1 linha, `ROLLED_BACK`). Se o verificador resolvesse configuração por hash, ele
      a encontraria — ele devolve `MISSING_EFFECTIVE_CONFIGURATION`;
    - estruturalmente, `verifySnapshotReplay` só consulta `recommendationSnapshot`,
      `draftSession` e `replayInputBundleRecord`; nenhuma tabela de release, ponteiro ou provider.
11. **Sem anomalias** — 0 fallback, 0 `hash_mismatch`, 0 `resolve_failed`, 0 `capture_failed`, 0
    log de erro, 0 HTTP 4xx/5xx (10/10 em 200), 0 `NaN`/`Infinity`/`undefined` na API. No Electron
    (renderer real): "Release ativa" exibida, "Fallback para baseline em uso" **ausente**, hash
    visível, 0 erro de console, 0 imagem quebrada, 0 `NaN`/`undefined`.

### Efeito operacional observado

O ranking sob a release (Viego 58.7, Udyr 58.5, Vi 55.3, Nocturne 53.3, Graves 50.1) difere do da
baseline (60.4 / 54.3 / 51 / 49.6 / 46.8) — os pesos da release valorizam mais
`TEAM_COMPOSITION` (0.2) e distribuem cobertura de forma diferente. Isso é o comportamento
esperado de uma configuração calibrada, e agora é **reproduzível**: o mesmo resultado sai do
replay offline a partir só do bundle.

### Estado final

```
release-etapa27b-validacao  VALIDATION_FAILED
release-etapa27b-v2         ROLLED_BACK
release-etapa27c-v1         ACTIVE          <- a ativa (ponteiro confere)
ponteiros=1 | releases_ACTIVE=1 | candidata=APPROVED_FOR_FUTURE_RELEASE
configuração operacional = RELEASE (baseline não está mais em uso)
```

Nenhum peso, artefato ou configuração foi alterado durante a operação — a única modificação no
repositório é documental. Trilha append-only completa:
`CREATED → VALIDATION_STARTED → VALIDATION_COMPLETED → ACTIVATED`.

### Não validado

O app Electron **empacotado**: a verificação usou o renderer via dev server, onde `window.sparta`
não existe. As telas envolvidas (Laboratório do motor, resumo de capacidade de replay) não
dependem do bridge.
