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
