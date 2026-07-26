# Origem, disponibilidade e confiança dos dados

Contrato central que permite ao Sparta dizer **de onde um número veio** e **se ele existe**.

## O problema que ele resolve

Antes deste contrato, o valor `50` aparecia na tela em quatro situações diferentes:

1. Um cálculo que deu neutro de verdade (composição equilibrada, por exemplo).
2. Ausência de dado (`findMatchupScore` devolvendo `?? 50` sem histórico do confronto).
3. Fallback artificial.
4. Componente ainda não implementado (`patchMeta` é `null`, então `meta` é sempre `50`).

As quatro viravam a mesma barra amarela. O jogador não tinha como distinguir "o Sparta analisou
e deu neutro" de "o Sparta não faz ideia".

## Os dois eixos

Origem e disponibilidade são independentes: um dado `DERIVED` pode estar perfeitamente
disponível, e um `OFFICIAL` pode estar indisponível.

### Origem (`ProvenanceSourceType`)

| Valor | Significado |
|---|---|
| `OFFICIAL` | Publicado pela Riot (Riot API, Data Dragon). Fato. |
| `OBSERVED` | Lido de um estado real, sem cálculo (sessão do LCU, partida persistida). |
| `CALCULATED` | Agregação determinística sobre dado real. Reproduzível a partir da entrada. |
| `DERIVED` | Algoritmo com julgamento de design embutido (pesos, limiares, tabelas de classe). |
| `INFERRED` | Estimativa sobre dado incompleto. Não reproduzível só a partir da entrada. |
| `CACHE` | Cópia local de uma das origens acima; `collectedAt`/`expiresAt` dizem se ainda vale. |

### Disponibilidade (`AvailabilityStatus`)

| Valor | Significado | Valor numérico |
|---|---|---|
| `AVAILABLE` | Presente e atual. | Existe |
| `PARTIAL` | Presente, cobrindo menos do que deveria. Usável com ressalva. | Existe |
| `STALE` | Presente porém não atual (patch antigo, cache vencido). | Pode existir |
| `UNAVAILABLE` | Não existe agora. | **Sempre `null`** |

## `DataProvenance`

Todo campo é opcional **de propósito**: o que não se aplica fica ausente, nunca preenchido com
placeholder.

```ts
{
  sourceType: "DERIVED",
  sourceId: "sparta",
  resource: "ChampionTag",
  algorithmVersion: "1.0.0"
}
```

Campos disponíveis: `sourceType`, `sourceId`, `resource`, `patch`, `region`, `tier`, `queue`,
`position`, `sampleSize`, `collectedAt`, `expiresAt`, `algorithmVersion`, `confidence`,
`status`, `unavailableReason`, `staleReason`.

`sampleSize: 0` significa "amostra vazia, medida". Ausência de `sampleSize` significa "não se
aplica ou não é conhecida". São coisas diferentes e o contrato preserva a diferença.

## `RecommendationMetric`

Cada métrica é independente e carrega a própria disponibilidade, confiança e proveniência —
inclusive dentro de um mesmo candidato, e entre candidatos diferentes.

```ts
// Ausência: valor null, motivo declarado.
{ key: "GLOBAL_MATCHUP", value: null, status: "UNAVAILABLE", confidence: null,
  unavailableReason: "Nenhuma fonte global configurada" }

// Neutro calculado de verdade: 50 com status disponível.
{ key: "TEAM_COMPOSITION", value: 50, status: "AVAILABLE", confidence: 0.72,
  provenance: { sourceType: "DERIVED", algorithmVersion: "1.0.0" } }
```

Construtores (`availableMetric`, `unavailableMetric`, `staleMetric`) garantem o invariante:
**não existe caminho que produza uma métrica indisponível com número**.

### Conceitos que não podem ser fundidos

| Par | Por quê |
|---|---|
| `PERSONAL_MATCHUP` vs `GLOBAL_MATCHUP` | Histórico do próprio jogador vs taxa observada no meta. Um jogador pode ir bem num confronto estatisticamente ruim. |
| `LANE_MATCHUP` (legado) | Alias de transporte de versões anteriores. É convertido centralmente para `PERSONAL_MATCHUP` indisponível quando não há proveniência suficiente; não é produzido pelo motor atual. |
| `PATCH_OFFICIAL_CHANGE` vs `PATCH_IMPACT` vs `META_STRENGTH` | Fato publicado, interpretação do fato, e o que as partidas mostram depois. |
| `CHAMPION_DIFFICULTY` vs `EXECUTION_RISK` | Dificuldade do campeão pra qualquer um vs risco desse campeão pra **este** jogador. |
| `PERSONAL_PERFORMANCE` vs `PERSONAL_EXPERIENCE` | Quão bem joga vs quanto já jogou. |
| `ALLY_SYNERGY` vs `TEAM_COMPOSITION` vs `ENEMY_COMPOSITION_ANSWER` | Encaixe com quem já foi escolhido, adequação ao 5x5 completo, e resposta ao time inimigo. |

A lista de chaves é aberta: métricas de build/runa e de pré/pós-game entram sem alterar o
contrato.

## Confiança: dois formatos

O domínio tem `Confidence` categórico (`"low"`/`"medium"`/`"high"`) desde a Fase 2, exibido ao
jogador e usado pelas heurísticas. O contrato novo usa `ConfidenceScore` numérico (0-1), que
permite comparar e combinar confianças de fontes diferentes sem perder resolução.

`toConfidenceLabel`/`toConfidenceScore` atravessam os dois. A conversão categórica → numérica é
uma aproximação declarada: `toConfidenceScore(toConfidenceLabel(x))` **não** devolve `x`, e não
serve pra "recuperar" precisão perdida.

`confidence: null` significa "não conhecida" — diferente de confiança baixa.

## Como a interface representa cada estado

`MetricRow` (`apps/desktop/src/renderer/src/ui/MetricRow.tsx`):

| Status | Renderização |
|---|---|
| `AVAILABLE` | Barra normal com o valor. |
| `PARTIAL` | Barra + marca "parcial". |
| `STALE` | Barra dessaturada + marca "desatualizado" + motivo. |
| `UNAVAILABLE` | **Sem barra.** Trilho tracejado vazio, "Indisponível" e o motivo. |

O trilho tracejado ocupa o mesmo espaço da barra (a lista não "pula" quando falta uma métrica)
sem sugerir posição na escala.

## Estado atual da migração

`PickRecommendation` carrega **os dois** por enquanto:

- `metrics` — bloco numérico, continua sendo a entrada do `totalScore`.
- `metricDetails` — métricas estruturadas, o que a interface consome.

`toRecommendationMetrics` (`packages/core/src/draft/recommendation-metrics.ts`) é o produtor
central das métricas estruturadas. O bloco `metrics` continua como compatibilidade da entrada
do score; `matchup` e `meta` ficam `null` quando indisponíveis.

O motor produz `PERSONAL_MATCHUP` apenas com partidas do jogador autenticado, no mesmo
campeão, adversário e posição. A métrica disponível carrega `sampleSize`, confiança da
metodologia de matchup e proveniência `CALCULATED` do `MatchParticipant`; portanto, um `50`
calculado de verdade continua disponível. Sem amostra, ou sem adversário da rota identificado,
ela fica `UNAVAILABLE` com motivo explícito. `GLOBAL_MATCHUP` fica indisponível enquanto não
houver fonte global real, e `META_STRENGTH` fica indisponível enquanto não houver Meta
Intelligence observada para o patch.

O legado `LANE_MATCHUP` existe apenas na borda de compatibilidade. Respostas antigas com
`metrics.matchup: 50`, `metrics.meta: 50` ou `metricDetails` legado não recuperam esses
números como evidência: o adaptador devolve as métricas correspondentes como indisponíveis.

`ensureRecommendationMetrics` normaliza respostas de um backend anterior ao contrato. Não é
defensividade hipotética: desktop e API são implantados separadamente, e ao validar esta etapa
contra a API em execução a tela inteira quebrou num `metricDetails is not iterable`. A
normalização acontece uma vez, no cliente da API — nenhum componente se defende por conta
própria.

## Score e cobertura quando faltam sinais

`normalizeAvailableWeights` remove somente a métrica indisponível do cálculo daquele
candidato e normaliza proporcionalmente os pesos ativos restantes para continuarem somando 1.
Peso que era zero no cenário original continua zero. Assim, ausência não vira `0` nem `50` e a
nota permanece na escala 0–100.

`PickRecommendation.dataCoverage` é a soma dos **pesos originais ativos** cujas métricas têm
dados, calculada individualmente por candidato. Por exemplo, matchup pessoal (`0,25`) e meta
(`0,05`) indisponíveis num cenário de lane revelada deixam cobertura `0,70`. Cobertura informa
quanto do modelo foi observado; não substitui nem altera a confiança estatística do jogador.

## Ausência versus zero (Etapa 4)

O contrato acima resolveu o `50` ambíguo. O mesmo problema existia com `0`, que também
significava duas coisas incompatíveis.

### Quando `0` é um valor real

Zero é um valor como qualquer outro quando a fonte informou zero, ou quando o cálculo rodou
sobre entradas válidas e deu zero:

- zero mortes, zero abates, zero assistências;
- **participação em abates igual a 0 com o time tendo tido abates** — o jogador não participou
  de nenhum, e isso é informação;
- diferença de ouro zero entre dois valores conhecidos;
- CS zero num minuto que a partida de fato alcançou.

Esses casos aparecem como `0` / `0%` na interface, com barra normal.

### Quando o campo fica ausente

O valor é `null` (ou o campo simplesmente não existe) quando:

- a Riot não envia o campo naquele patch (`challenges` ausente);
- a timeline não foi obtida;
- a partida não chegou no minuto de referência;
- o denominador é zero ou desconhecido;
- nenhuma observação da amostra tem o dado;
- a métrica ainda não é extraída de fonte nenhuma.

Ausência nunca vira `0`. A interface mostra "Indisponível" com o motivo, sem barra.

### Percentuais sem denominador

Participação em abates com o time em 0 abates é **indisponível**, não `0%`: a razão não existe.
O mesmo vale quando os abates do time, ou os do jogador, não estão disponíveis.

### Agregações parciais

Média de um campo que falta em parte das partidas usa **apenas as observações válidas** como
denominador. Dividir pelo total diluiria o valor na proporção do que falta, que é tratar
ausência como zero por outro caminho.

`StatCoverage` (`packages/core/src/types/domain.ts`) acompanha o valor:

| Campo | Significado |
|---|---|
| `sampleSize` | Partidas consideradas no contexto. |
| `availableSampleSize` | Partidas que realmente tinham o dado. `null` = cobertura desconhecida. |
| `status` | `AVAILABLE` / `PARTIAL` / `UNAVAILABLE` — o mesmo enum da Etapa 2, não um segundo. |
| `reason` | Por que está parcial ou indisponível. |

Construtores em `packages/core/src/types/stat-coverage.ts`. Cobertura não é confiança: são dois
eixos, e nenhum é derivado do outro.

### Score com componente ausente

`scoreChampionPerformance` **remove** o componente sem dado e redistribui o peso entre os
restantes (`normalizeWeightsByAvailability`, a mesma função que o motor de draft usa desde a
Etapa 3). `ChampionPerformanceScore.dataCoverage` registra quanto do modelo participou.

Isso corrigiu um erro medido: `objectiveParticipation` nunca foi extraído de fonte nenhuma
(0 de 220 participantes no banco real tinham o dado), então a agregação gravava `0`, e esse
zero entrava com **15% do peso** em JUNGLE e SUPPORT como se fosse participação medida. Contra
a conta real: Viego JUNGLE **52 → 61,4**, Vel'Koz SUPPORT **46 → 53,7**, ambos com
`dataCoverage 0,85`.

### Decisões por campo

| Campo | Decisão | Por quê |
|---|---|---|
| `killParticipation` (partida) | Já era `undefined` sem `challenges` | Correto desde a Fase 1 |
| `killParticipation` (agregado) | `null` sem observação; média só sobre as válidas | Antes caía pra `0` |
| `objectiveParticipation` | Sempre `null` | Não é extraído de nenhuma fonte hoje |
| `deathsBefore10/15` | Continua `number` | Contagem de eventos: `0` = não morreu |
| `csAt10/csAt15` | `undefined` se a partida não chegou no minuto | Antes era `0`, ou o CS de um minuto anterior rotulado como se fosse do minuto pedido |
| `goldDiffAt15` | Já era `undefined` | Correto desde a Fase 1 |
| `teamId` (participante) | Entrada descartada sem `teamId` | O `?? 0` criava um time fantasma (a Riot usa 100/200) na conta de aliados/inimigos |
| `csPerMinute`, `goldPerMinute`, `damagePerMinute`, `visionScorePerMinute` | Continuam `number` | Toda partida persistida tem |
| Agregado de coleção vazia | `aggregatePlayerChampionStats` devolve `null` | Sem observação não há agregado, e não um agregado zerado |

### Ambiguidade histórica que permanece

`PlayerChampionStats.killParticipation` gravado antes da migration `20260726120000` pode ter
`0` legítimo ou artificial — de dentro do agregado não dá pra distinguir. Esses valores **não
foram convertidos**: as linhas são recalculadas inteiras a cada sync a partir de
`MatchParticipant`, então se corrigem sozinhas na próxima sincronização.

`objectiveParticipation` é diferente: ali o `0` legado é **provadamente** artificial, porque o
campo nunca foi preenchido por nenhuma partida. Linhas legadas (`objectiveParticipationSamples`
nulo e valor `0`) são servidas como indisponíveis, no repositório. A mesma regra, e só ela,
existe no cliente (`ensureChampionStatsCoverage`) pro caso de o desktop falar com uma API
anterior a esta etapa. `killParticipation: 0` não é tocado em nenhum dos dois lados.

## Participação em objetivos (Etapa 5)

A Etapa 4 deixou `objectiveParticipation` honestamente indisponível porque o Sparta não extraía
o dado de fonte nenhuma. Esta etapa passa a calculá-lo a partir do payload Match-V5 **já
persistido**, sem nenhuma integração externa nova.

### Definição

Fração dos objetivos neutros conquistados pelo **próprio time** em que o jogador participou.

```txt
numerador   = challenges.dragonTakedowns + challenges.baronTakedowns
denominador = teams[meuTime].objectives.dragon.kills + .baron.kills
```

### Objetivos incluídos e excluídos

| Objetivo | Situação | Motivo |
|---|---|---|
| Dragão | **Incluído** | 0 inconsistências em 220 participantes reais |
| Barão | **Incluído** | 0 inconsistências em 220 participantes reais |
| Arauto | **Excluído** | Contabilidade divergente (ver abaixo) |
| Void grubs (`horde`), Atakhan, torre, inibidor | Fora do escopo | Existem no payload, mas a contabilidade de cada um não foi validada contra dado real |

**Por que o Arauto ficou de fora.** `challenges.riftHeraldTakedowns` e
`teams[].objectives.riftHerald.kills` não medem a mesma coisa. Na partida `BR1_3263128214`,
**nenhum dos dois times** matou Arauto (`riftHerald.kills = 0` para ambos) e mesmo assim um
participante tem `riftHeraldTakedowns: 1` — e o `challenges.teamRiftHeraldKills` dele é `0`, ou
seja, o payload se contradiz internamente. Incluí-lo exigiria aceitar numerador maior que
denominador ou mascarar a diferença com um clamp; nenhuma das duas produz um percentual que
corresponda a algo verificável.

### Tratamento de zero, ausência e parcialidade

| Situação | Resultado |
|---|---|
| Jogador participou de 0 dos objetivos, time conquistou pelo menos 1 | `0` real, `AVAILABLE` |
| Time não conquistou dragão nem barão | **`UNAVAILABLE`** — não existe denominador, e `0%` diria "não participou de nada" quando não houve nada de que participar |
| Sem `challenges` no payload | `UNAVAILABLE` |
| Só um dos dois campos de takedown presente | `UNAVAILABLE` — somar um subconjunto contra um denominador que conta os dois subestimaria o percentual de forma sistemática |
| Sem `teams`, ou time do jogador ausente da lista | `UNAVAILABLE` |
| Numerador maior que denominador | Valor sai **sem truncar**, marcado `PARTIAL` com o motivo — a anomalia aparece em vez de ser escondida |

Os absolutos (`objectiveTakedowns`, `teamObjectiveKills`) são preservados mesmo quando a razão
é indisponível: saber que o jogador participou de 0 de 0 é diferente de não saber nada.

### Proveniência

`sourceType: "CALCULATED"`, `sourceId: "riot"`,
`resource: "match-v5:challenges+teams.objectives"`, mais `algorithmVersion`, `patch` e
`collectedAt`. O percentual é conta do Sparta; os dois números que entram nele são oficiais, e
o `resource` registra exatamente de onde vieram. Observação indisponível **não** carrega
proveniência de cálculo — não houve cálculo.

### Agregação e score

A agregação usa `averageAvailable` (Etapa 4) sem alteração: média só sobre as partidas com
observação válida, `PARTIAL` quando parte da amostra tem o dado, `UNAVAILABLE` quando nenhuma
tem. O componente `objective` volta a participar do score pelo peso original (15% em JUNGLE e
SUPPORT, 0 nos demais papéis) sempre que houver valor — inclusive quando esse valor é zero
medido. Nenhum peso foi recalibrado.

### Cobertura observada

Medido no banco real (22 partidas, patch 16.14, 220 participantes):

| | |
|---|---|
| Partidas com `challenges` e `teams.objectives` | 22 de 22 |
| Participantes com razão calculável | 195 |
| Participantes com participação zero medida | 62 |
| Participantes indisponíveis (time sem dragão/barão) | 25 |
| Participantes com numerador > denominador | 0 |

Patches anteriores ao `challenges` não existem no banco atual; o caminho está coberto por teste.

### Backfill

```bash
pnpm --filter @sparta/api backfill:objective-participation
```

Recalcula a partir do `Match.rawJson` já gravado. **Não faz nenhuma chamada à Riot API** e o
`rawJson` nunca é apagado — ele continua sendo a fonte reprocessável se a metodologia mudar.
Idempotente: a comparação de "não mudou" usa os **inteiros**, não a razão, porque comparar o
float por igualdade quebra a idempotência (medido: `1/6` não faz round-trip exato pelo `double
precision` do Postgres, e aquela linha era reescrita a cada execução). Ao final, recalcula os
`PlayerChampionStats` das contas vinculadas — sem isso a métrica ficaria no `MatchParticipant`
sem chegar ao perfil nem ao score até o próximo sync. O resumo é só de contagens; nenhum puuid
ou payload é impresso.
