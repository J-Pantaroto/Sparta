# Inteligência pessoal de builds, runas e feitiços

## Escopo

A Etapa 17 agrega as observações normalizadas da Etapa 10 por:

```text
jogador + campeão + posição observada
```

Patch, filas, período e quantidade de partidas recentes são filtros opcionais.
O resultado descreve somente o que aquele jogador utilizou. Não é build
global, meta, recomendação universal, relação causal com vitória nem ordem de
compra.

O agregado é calculado sob demanda e não cria tabela, migration ou cópia dos
dados originais. `MatchObservation` e seus filhos continuam sendo a fonte
persistida.

## Contrato

`PersonalLoadoutEvidence` contém:

- campeão e posição;
- `status`, `sampleSize` e `availableSampleSize`;
- escopos de patch, fila, período e recência;
- padrões de inventário final, runas e feitiços;
- disponibilidade independente de cada uma dessas três partes;
- proveniência observada, calculada e de catálogo;
- versão `personal-loadout-evidence/1.0.0`;
- histórico separado quando um patch foi pedido e só existem observações fora
  dele.

Cada padrão preserva assinatura, partidas, vitórias, derrotas, resultados
indisponíveis, última utilização, patches, filas, IDs, resolução do catálogo e
limitações. Vitórias e derrotas são descritivas e não participam da ordenação.

## Assinaturas canônicas

### Inventário final

O inventário é um multiconjunto ordenado numericamente:

```text
[1001, 3078, 1001] -> [1001, 1001, 3078]
```

A posição dos itens nos sete slots não divide padrões equivalentes. Repetições
continuam presentes. ID `0` é slot vazio e sai da assinatura. IDs positivos
sem nome ou asset permanecem. A quantidade de slots indisponíveis faz parte da
assinatura para que uma observação parcial não pareça completa.

O dado representa apenas o estado final. Não há reconstrução de compras,
vendas, undo, transformação ou ordem.

### Página de runas

A assinatura preserva:

- árvore primária e secundária;
- perk, árvore, ordem e marca de keystone;
- fragmentos em `OFFENSE`, `FLEX` e `DEFENSE`;
- estado `AVAILABLE` ou `PARTIAL`;
- IDs ausentes como ausência explícita.

Uma página parcial não compartilha assinatura com a versão completa. Nenhum
perk, árvore ou fragmento é completado por heurística.

### Feitiços de invocador

Slots 1 e 2 continuam preservados na observação individual. No agregado, pares
invertidos são equivalentes porque esses slots não mudam a semântica do
conjunto usado na partida. O par canônico é ordenado por ID, enquanto
`observedOrders` retém todas as ordens realmente vistas, inclusive `null` em
slot ausente.

Smite não participa da posição. A posição vem exclusivamente de
`MatchObservation.normalizedRole`.

## Seleção, patch e filas

O agregador descarta observações de outro campeão ou posição. Posição ausente
não vira MID e não entra em agregado de posição conhecida.

Um patch solicitado compara a identidade `major.minor`: `16.14` e `16.14.1`
pertencem ao mesmo patch, mas os valores originais continuam expostos. Se não
há observação no patch solicitado, o contexto principal fica `UNAVAILABLE`.
Observações de outro patch podem aparecer em `recentHistory`, com status
`STALE` e motivo explícito; nunca são apresentadas como atuais.

Filas podem ser filtradas por ID. Sem filtro, cada padrão lista todos os IDs
observados e quantas partidas não tiveram fila resolvida. O Sparta não cria
nesta etapa uma classificação global de modos nem chama uma fila de Summoner's
Rift sem essa fonte. Assim, uma fila alternativa permanece identificada pelo
seu ID e não é misturada silenciosamente sob um rótulo incorreto.

`recentMatches` é aplicado depois dos filtros de jogador, campeão, posição,
fila e período, ordenando por data descendente e `matchId` como desempate.
Recência informa uso; não indica qualidade.

## Disponibilidade

Inventários, runas e feitiços possuem `status`, `sampleSize`,
`availableSampleSize` e motivo próprios.

- nenhuma partida no contexto: agregado `UNAVAILABLE`;
- uma partida completa: dado `AVAILABLE`, amostra 1, sem confiança inventada;
- itens e feitiços presentes com runas ausentes: agregado `PARTIAL`;
- ID observado sem catálogo: observação disponível, enriquecimento
  `UNAVAILABLE`;
- página ou par incompleto: padrão `PARTIAL`, sem preenchimento.

Listas vazias só aparecem junto de disponibilidade e motivo estruturados.

## Ordenação

Padrões são ordenados deterministicamente por:

1. quantidade de observações, decrescente;
2. utilização mais recente, decrescente;
3. assinatura canônica, crescente.

Taxa de vitória não escolhe o primeiro padrão. Uma observação única recebe a
limitação factual de amostra 1; não recebe rótulo de confiabilidade ou
superioridade.

## Proveniência e catálogo

- IDs, slots, patch, fila, resultado e data: `OBSERVED`, Match-V5;
- agrupamento e contagens: `CALCULATED`, Sparta, com versão do algoritmo;
- nome, asset e versão: `OFFICIAL`, catálogo Data Dragon persistido na
  observação;
- catálogo de outra versão: `OTHER_VERSION`/`STALE`;
- ID sem resolução: `UNAVAILABLE` somente para o enriquecimento.

A Etapa 10 registrou que o ambiente não possuía catálogo local de itens, runas
ou feitiços durante o backfill. Esses IDs continuam válidos e aparecem como
`ID N`; a Etapa 17 não busca a versão atual remotamente para reescrever uma
partida antiga.

## API e proteção

```http
GET /players/:playerId/champions/:championId/roles/:role/loadout-evidence
Authorization: Bearer <token>
```

Query opcional:

```text
patch=16.14.1
queueId=420,440
from=2026-07-01T00:00:00.000Z
to=2026-07-28T00:00:00.000Z
recentMatches=20
```

O servidor resolve a conta vinculada ao usuário autenticado e exige que
`:playerId` seja o próprio `puuid`. Outra conta recebe `403
PLAYER_HISTORY_FORBIDDEN` antes da leitura das observações.

## Interface e compatibilidade

“Seu histórico com este campeão” aparece somente no detalhe da recomendação e
no pré-game depois da confirmação. Os cinco cards principais continuam
compactos. A seção mostra os padrões mais frequentes, amostra, posição,
patches, filas e última utilização com linguagem observacional.

A consulta é separada da recomendação. O histórico não entra no request do
motor, no `PickRecommendation`, no risco, na análise estratégica nem no
snapshot persistido. Um teste de invariância executa o ranking antes e depois
do agregado e exige igualdade integral.

Desktop conectado a uma API anterior sem a rota converte o caso em
`UNAVAILABLE` estruturado, com listas vazias e motivo; nunca cria configuração
padrão.
