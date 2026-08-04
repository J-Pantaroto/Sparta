---
status: IMPLEMENTADA
solicitado_em: 2026-08-03 23:00
implementado_em: 2026-08-04 01:20
---

# Etapa 27c — Replay autossuficiente para configurações promovidas

## Pedido original

> Tornar o `ReplayInputBundle` autossuficiente também quando a recomendação utilizar uma release
> operacional. O replay deve reconstruir a recomendação usando exatamente a configuração efetiva
> preservada no bundle, sem consultar release atual, provider, banco de configurações, cache,
> candidata, experimento ou estado operacional presente.
>
> Criar `ReplayInputBundle v2` com `effectiveRecommendationConfiguration`; a configuração participa
> do `contentHash` (`capturedAt` continua fora); corrigir o contrato do registro de replay para que
> a configuração não seja descartada pelo tipo, sem parâmetro opcional que permita fallback
> silencioso; sem backfill; bundle v1 de baseline continua reproduzível; bundle v1 de release vira
> `MISSING_EFFECTIVE_CONFIGURATION`. Validar em conta isolada e, na conta real, apenas deixar uma
> release substituta em `READY_FOR_ACTIVATION`. Parar antes de qualquer nova ativação real.

## Notas de implementação

### O contrato do bundle (v2)

`REPLAY_BUNDLE_SCHEMA_VERSION` passou a `replay-input-bundle/2.0.0`, com
`REPLAY_BUNDLE_SCHEMA_VERSION_V1` mantido em `SUPPORTED_REPLAY_BUNDLE_SCHEMAS`. O campo novo é
`effectiveRecommendationConfiguration?: EffectiveRecommendationConfiguration` — opcional **no
tipo** só porque bundle v1 legitimamente não o tem; a validação o exige quando `schemaVersion` é
v2, e o verificador devolve erro estruturado em vez de cair na baseline.

**A canonicalização é versionada, e isso não é detalhe.** Acrescentar o campo
incondicionalmente ao `canonicalBundleContent` mudaria o `contentHash` de **todo bundle v1 já
persistido**, e eles passariam a falhar a verificação de integridade — um backfill silencioso pela
porta dos fundos. O ramo v1 devolve exatamente a mesma string de antes (`canonicalBundleBase`),
e só o ramo v2 acrescenta a configuração. Medido: os 16 bundles v1 da conta real continuam com
`contentHash` válido e sem configuração embutida.

A configuração entra no hash pela canonicalização **dela** (`canonicalConfigurationContent`, a
mesma que produz o `configHash`), mais `version` e `configHash` à parte porque aquela função os
exclui de propósito. Uma segunda forma canônica para o mesmo dado seria fonte de divergência.

### Validação da configuração embutida

Seis rejeições novas: `MISSING_EFFECTIVE_CONFIGURATION`, `CONFIGURATION_HASH_MISMATCH`,
`CONFIGURATION_HASH_INCONSISTENT` (o `configHash` ecoado em `algorithmVersions` discorda do da
configuração), `CONFIGURATION_SOURCE_INCONSISTENT` (`RELEASE` sem `releaseId`, ou
`BUILT_IN_BASELINE` com `releaseId`), `CONFIGURATION_PARAMETER_INVALID` (reaproveita
`validateEffectiveConfigurationStructure` da 27a) e `INCOMPATIBLE_CONFIGURATION_VERSION`.
Configuração adulterada invalida o bundle **antes** de qualquer execução.

### O contrato do registro — a causa raiz da 27b

```ts
export type ReplayImplementation = (
  bundle: ReplayInputBundle,
  configuration: EffectiveRecommendationConfiguration  // obrigatória
) => ReplayReconstructedCandidate[];
```

Antes, `replayRecommendationEngineV1` tinha `configuration?` opcional e o tipo do registro
apagava o parâmetro — o efeito prático era fallback silencioso para a baseline. Tornar obrigatório
fecha o caminho **no tipo**: não existe mais como chamar o replay sem dizer com qual configuração.
O compilador achou sozinho os três pontos que o tipo antigo escondia, em
`replay-input-bundle.test.ts`.

### De onde a configuração vem (`resolveBundleConfiguration`)

Exclusivamente do bundle:

- **v2** → a configuração embutida, seja de baseline ou de release. A baseline embutida também é
  usada **diretamente**, não recalculada das constantes atuais — senão um ajuste futuro delas
  mudaria em silêncio o replay de um snapshot antigo (coberto por teste).
- **v1 sem `configHash` registrado** → anterior à 27b, quando release operacional não existia; a
  baseline do cenário é, por construção, o que produziu aquele resultado.
- **v1 com `configHash` registrado** → ambíguo, e a desambiguação sai do **próprio bundle**:
  recalcula-se a baseline do cenário (`buildBaselineConfiguration(draftStateFrom(bundle))`) e
  compara-se o `configHash`. Bate → era baseline, replay segue exato. Não bate → era release, e os
  parâmetros não foram preservados. **Não** se busca o artefato pelo hash, o que reintroduziria
  dependência de fonte externa no caminho de verificação.

Isso funciona porque a baseline varia por cenário de draft: os dois bundles de baseline da conta
real têm hashes distintos (`b5df76e4…` e `d63d15de…`), e o de release tem outro (`2cefcade…`).

### `MISSING_EFFECTIVE_CONFIGURATION`

Status de verificação e capacidade novos
(`FULL_DERIVATION_REPLAY_MISSING_CONFIGURATION`), distintos de `INVALID` (nada corrompeu) e de
`UNAVAILABLE` (os inputs de derivação estão todos lá). O replay **não é executado**: rodar a
baseline produziria as mesmas 10 divergências conhecidas e enganosas que reprovaram a ativação.
`reweightAvailable` continua `true` — a reponderação da Etapa 25 segue como fallback declarado.

### Bug real corrigido no caminho

`validateRelease` no cliente do desktop fazia `POST` sem corpo com
`Content-Type: application/json`, e o Fastify recusa isso com `FST_ERR_CTP_EMPTY_JSON_BODY` (400)
**antes** de a rota rodar — o mesmo defeito achado na Etapa 26b em `verifySnapshotReplay`.
Introduzido por mim na 27b e só exposto agora, ao exercitar a validação pelo caminho real; o botão
"Validar" da tela nunca teria funcionado. Corrigido com `body: "{}"`. As duas ocorrências
pendentes em `generateDraftComparison`/`revealDraftReviewResult` continuam **fora de escopo**,
conforme o pedido.

## Validação real

**Conta isolada** (criada, exercitada e removida por completo — dados próprios, nada copiado da
conta real): 3 bundles v2 com configuração embutida; candidata com os mesmos pesos da real;
experimento `COMPLETED` com 3/3 casos exatos; release validada `VALID`/`MATCH` em 3 casos e
**ativada**. O cenário exato que causou o rollback da 27b — recomendação sob release ativa —
replayou com **`EXACT_REPLAY` e 0 divergências**.

Independência da fonte externa, testada em duas etapas: (1) pesos da release **adulterados no
banco** → replay segue `EXACT_REPLAY`; (2) release **deletada** junto do ponteiro → replay segue
`EXACT_REPLAY`. Depois, ciclo limpo de ativação → rollback pela API, com o replay do snapshot
produzido sob a release continuando exato **depois** do rollback. Resíduo final: zero.

**Conta real**: permanece na baseline. Release substituta `release-etapa27c-v1` criada e validada
até `READY_FOR_ACTIVATION` (`VALID`, equivalência `MATCH` em 2 casos, 0 divergências), **não
ativada**. `release-etapa27b-v2` continua `ROLLED_BACK`.

Capacidade de replay em todo o universo real de 16 bundles: **13 pré-27b e 2 de baseline →
`EXACT_REPLAY` com 0 divergências**; o único de release → `MISSING_EFFECTIVE_CONFIGURATION` com
**0 divergências** (eram 10 antes desta etapa). Recomendação nova na baseline produziu bundle v2 e
ranking **idêntico** ao anterior (Viego 60.4 / Udyr 54.3 / Vi 51 / Nocturne 49.6 / Graves 46.8),
com replay exato.

Electron (dev, renderer real): Laboratório com "Configuração operacional atual", "Fallback para
baseline em uso", os 3 cenários de baseline, as 3 releases com "Release pronta para ativação" e
`ROLLED_BACK`; 0 erros de console, 0 imagens quebradas, 0 `NaN`/`Infinity`/`undefined`.

**Não validado**: o app Electron empacotado (a validação usou o renderer via dev server, onde
`window.sparta` não existe — as telas envolvidas não dependem do bridge).

## Testes

24 novos em `packages/core/src/calibration/replay-bundle-configuration.test.ts`, cobrindo a lista
essencial completa do pedido. 620 no total do pacote (1052 no monorepo: core 620, api 263, riot 96,
desktop 73). `typecheck`, `lint`, `test` e `build` completos nos quatro pacotes.

Sem migration: o bundle é JSONB e o `schemaVersion` já era coluna de texto.
