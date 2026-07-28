# Observações de partida

## Escopo

A observação descreve o estado final real de um participante em uma partida
Match-V5 persistida. Ela não é recomendação, ordem de compra, estatística
global nem elegibilidade de posição do campeão.

O `rawJson` continua preservado como fonte reprocessável. O extrator atual é
`match-observation/1.0.0`.

## Dados medidos antes da modelagem

O banco local tinha 22 partidas e 220 participantes, todos com itens, runas,
feitiços e os três campos de posição. Quatro participantes tinham
`positionAssignedByMatchmaking` divergente enquanto `teamPosition` e
`individualPosition` concordavam. Por isso a política determinística é:

1. `teamPosition`, quando reconhecido;
2. `individualPosition`, quando reconhecido;
3. indisponível.

`positionAssignedByMatchmaking` é preservado e normalizado separadamente como
posição atribuída, mas não substitui a posição jogada. `NONE`, `INVALID`,
string vazia e vocabulário desconhecido não viram posição. Não existe fallback
para MID.

## Modelo

- `Match` preserva versão completa, patch normalizado, queue ID, modo, tipo,
  plataforma, data e duração.
- `MatchObservation` é única por `MatchParticipant`; guarda a versão do
  extrator, status de runas e os campos de posição originais e normalizados.
- `MatchItemSlot` guarda os sete slots finais em ordem. ID `0` vira
  `state=EMPTY`; campo ausente vira `UNAVAILABLE`; ID positivo desconhecido
  permanece `PRESENT` com o ID.
- `MatchRuneSelection` guarda árvore e ordem; a primeira seleção primária é
  marcada como keystone. `MatchRuneFragment` guarda offense/flex/defense
  separadamente.
- `MatchSummonerSpellSlot` guarda slots 1 e 2 separadamente.

Os índices de item, perk, fragmento, feitiço e posição permitem consultas
futuras por campeão, posição, patch e resultado usando as relações naturais de
partida/participante. Nenhum segundo blob de observação foi criado.

## Catálogo e proveniência

IDs observados têm proveniência `OBSERVED`. A posição normalizada é
`CALCULATED`, com a versão do extrator. Nome e asset só existem quando um
catálogo local resolve o ID; nesse caso a versão do catálogo e o estado
`EXACT` ou `OTHER_VERSION` são preservados.

Na auditoria desta etapa, o cache local continha apenas o catálogo de campeões
da Data Dragon. Não havia catálogo local de itens, runas ou feitiços. Portanto
o backfill preserva os IDs e grava `catalogStatus=UNAVAILABLE`, sem inventar
nomes e sem buscar a versão atual remotamente.

## Backfill

`pnpm --filter @sparta/api backfill:match-observations`

O processo lê somente `Match.rawJson` e o banco local. Não instancia clientes
Riot/Data Dragon, não imprime matchId, puuid ou payload e informa partidas
processadas, atualizadas, indisponíveis e com erro.

Uma observação já gravada com a versão atual não sofre escrita. Quando a
versão muda, a observação e seus filhos são substituídos na mesma transação;
as chaves únicas impedem duplicação. Partida sem `rawJson` ou sem estrutura
Match-V5 utilizável é contabilizada como indisponível e não interrompe o lote.

## Consumo

`GET /matches/:matchId/observation` exige sessão e resolve o puuid pela conta
Riot do usuário autenticado. A resposta usa `MatchLoadoutObservation` e expõe
estados, IDs, enriquecimento e proveniência sem alterar contratos anteriores.

O pós-game mostra apenas textos factuais: “Itens utilizados”, “Runas
utilizadas”, “Feitiços utilizados” e “Posição observada”. A build é o estado
final dos slots; cronologia de compra ficou fora desta etapa porque exigiria
modelar corretamente compra, venda, undo, transformação e destruição na
timeline.
