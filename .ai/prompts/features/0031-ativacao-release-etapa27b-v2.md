---
status: BLOQUEADA
solicitado_em: 2026-08-03 22:30
bloqueado_em: 2026-08-03 22:35
---

# Ativação da release real `release-etapa27b-v2`

## Pedido original

> ATIVAR RELEASE.
>
> Ative explicitamente a release real `release-etapa27b-v2`. Faça a ativação de forma atômica e,
> logo depois, execute a validação operacional completa: confirmar que ela ficou ACTIVE e é a única
> release ativa; confirmar invalidação do cache; consultar a configuração operacional; gerar uma
> recomendação real; confirmar que snapshot e ReplayInputBundle registraram releaseId, versão e
> configHash corretos; executar replay offline e verificar integridade; validar API, Electron e
> logs; confirmar ausência de fallback, erro de hash, NaN, Infinity, undefined ou falhas HTTP.
>
> Não altere pesos ou artefato durante a ativação. Se qualquer validação crítica falhar, faça
> rollback imediato para a baseline e registre o motivo.

## Resultado: ativada, reprovada na integridade do replay, revertida

A ativação em si **funcionou exatamente como projetado**. O que reprovou foi uma consequência
estrutural só observável com uma release de fato ativa — motivo pelo qual ela não tinha aparecido
em nenhuma validação anterior da Etapa 27b (todas rodaram com a baseline em uso, ou com ativação
numa conta isolada onde nenhuma recomendação nova foi gerada e replayada).

### Achado bloqueante: o `ReplayInputBundle` não preserva a configuração efetiva

`verifyReplayBundle` (`packages/core/src/calibration/replay-verifier.ts`) reconstrói o motor
chamando `implementation(bundle)`. O tipo do registro é

```ts
export type ReplayImplementation = (bundle: ReplayInputBundle) => {...}[];
export const replayEngines = { "recommendation-engine/1.0.0": replayRecommendationEngineV1 };
```

`replayRecommendationEngineV1(bundle, configuration?)` aceita uma configuração opcional (parâmetro
aditivo da Etapa 27a), mas **o tipo do registro apaga esse segundo parâmetro**: ele é sempre
`undefined` na verificação. O motor então roda com `selectWeights(draft)` — a **baseline**.

Enquanto isso, o snapshot foi produzido com os pesos da **release**. O contrato do bundle
(`replay-input-bundle.ts`) **não tem campo para a configuração efetiva**: guarda apenas
`algorithmVersions.recommendationConfiguration = <configHash>`. Um hash **identifica** qual
configuração valia, mas não permite **reconstruí-la**.

Consequência: com qualquer release ativa, todo snapshot novo fica irreplayável, o que quebra a
garantia central da Etapa 26 (reprodutibilidade histórica exata).

### Medição real (conta Zekerus#117, Postgres real)

| Origem do snapshot | Replay offline | Divergências |
| --- | --- | --- |
| `RELEASE` (release ativa) | `REPLAY_INTEGRITY_FAILED` | **10** |
| `BUILT_IN_BASELINE` (após rollback) | `EXACT_REPLAY` | **0** |

A prova de que a causa é a configuração, e não outra coisa: os valores `reconstruido` das
divergências (Viego 60.4, Udyr 54.3, Vi 51, Nocturne 49.6) são **exatamente** os scores que a
baseline produz — medidos na recomendação gerada logo após o rollback. O replay estava rodando a
baseline contra um snapshot de release.

Divergiram score **e** cobertura, nos 5 candidatos: `dataCoverage` 0.9 vs 0.7 (Viego) e 0.5 vs 0.2
(demais) — a cobertura muda porque a release atribui peso a métricas que a tabela de blind/lane
revelada da baseline zera.

### O que passou (tudo, menos o replay)

- Ativação atômica: HTTP 200, `READY_FOR_ACTIVATION → ACTIVE`, transação serializável.
- Unicidade: 1 ponteiro, 1 release `ACTIVE`, ponteiro apontando para ela.
- Artefato intocado: `artifactHash` e `configHash` idênticos antes e depois, e
  `validatedArtifactHash == artifactHash`. Pesos congelados inalterados.
- Cache invalidado nas duas transições (`cacheInvalidated: true` no log de ativação e de rollback);
  resolução seguinte veio `MISS` nas duas, nunca `HIT` de valor velho.
- Configuração operacional: `GET /recommendation-engine/active-release` passou de
  `BUILT_IN_BASELINE` (3 cenários) para `RELEASE` com os pesos reais, e voltou depois do rollback.
- Recomendação real gerada e persistida (`SAVED`), 5 principais com score finito.
- Eco no snapshot e no bundle: as 7 conferências cruzadas de
  `configurationSource`/`configurationReleaseId`/`configurationVersion`/`configHash` —
  coluna, JSON da configuração, `algorithmVersions` do snapshot e do bundle — todas `t`.
- Logs: 0 fallback, 0 `hash_mismatch`, 0 `resolve_failed`, 0 erro, 0 HTTP 4xx/5xx (9/9 em 200),
  0 `NaN`/`Infinity`/`undefined`.

### Rollback

Executado imediatamente após a falha, com o motivo gravado em `rolledBackReason` e no evento
append-only `ROLLED_BACK`. Restaurou a baseline (ponteiro apagado, pois `previousReleaseId` era
nulo — a release vinha da baseline). Estado final: **0 ponteiros, 0 releases `ACTIVE`,
configuração operacional `BUILT_IN_BASELINE`**, e replay de snapshot novo de volta a
`EXACT_REPLAY` com 0 divergências.

`release-etapa27b-v2` fica em `ROLLED_BACK` — estado terminal pelo grafo da 27a. Reativar exige um
artefato novo, o que é o comportamento correto: o artefato desta release está íntegro, mas o
**sistema** ainda não sabe replayar snapshots produzidos por ela.

### Não validado

Electron não foi reexercitado: o dev server estava fora do ar e, com o rollback, o estado
observável voltou a ser exatamente a baseline já validada na Etapa 27b (0 erros de console, 0
`NaN`/`undefined`, 0 imagens quebradas). O que **não** foi visto na interface real é o estado com
release ativa, que deixou de existir com o rollback.

## Correção necessária antes de reativar (fora do escopo desta execução)

Duas opções, ambas em `packages/core` mais o eco na captura:

1. **Embutir a configuração efetiva no bundle** — `ReplayInputBundle` ganha o campo, entra na
   canonicalização e no `contentHash`, e `replayRecommendationEngineV1` a repassa ao motor. Bundle
   fica autossuficiente, coerente com a premissa da Etapa 26a de embutir o que não é endereçável
   por conteúdo. Exige nova `schemaVersion` do bundle; bundles antigos continuam válidos como
   baseline.
2. **Alargar o tipo do registro** para `(bundle, configuration?) => ...` e a verificação carregar a
   configuração pelo `configHash`. Mais barato, mas reintroduz dependência de fonte externa no
   caminho de verificação — exatamente o que a Etapa 26 evitou de propósito.

A opção 1 preserva o invariante que dá sentido ao bundle. Nenhuma das duas foi implementada aqui:
o pedido era ativar e validar, e a instrução em caso de falha crítica era reverter e registrar.
