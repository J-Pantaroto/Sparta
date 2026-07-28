# Pós-game comparativo entre draft e partida

Fonte de verdade: `docs/draft-postgame-comparison.md`.

## Contrato operacional

- Algoritmo puro e determinístico `draft-postgame-comparison/1.0.0`.
- Usa a `DraftSession` vinculada, o `RecommendationSnapshot` original e
  somente fatos Match-V5/timeline/observações persistidos.
- Ranking, grupo, score, cobertura, sinais e versões vêm do snapshot; o motor
  atual nunca é executado.
- Antes e depois da partida permanecem blocos temporais distintos.
- Correspondência nunca é causalidade; vitória e derrota não validam nem
  invalidam o motor.
- Escolha fora do snapshot é `NOT_IN_SNAPSHOT`, sem score ou posição
  retroativos.
- Sem snapshot, preserva o resumo observado e declara a comparação histórica
  indisponível.
- Divergência de posição bloqueia matchup e loadouts da posição antiga como
  equivalentes.
- Matchup pessoal só é comparado com adversário direto confirmado e amostra
  rastreável. Matchup global continua indisponível.
- Inventário, runas e feitiços são comparados somente com observações
  anteriores ao instante do snapshot, sem rótulos de melhor/pior.
- Mudança oficial e impacto teórico de patch ficam separados; contexto
  importado depois do snapshot não aparece como conhecido no draft e impacto
  global observado continua indisponível.
- Zero real permanece disponível; ausência de timeline, posição, loadout ou
  objetivos permanece independente.

Cobertura usa oito dimensões explícitas: snapshot, escolha no snapshot,
posição, adversário, timeline, estatísticas, loadout e objetivos. Não é
confiança, qualidade da partida, chance de vitória ou nota da recomendação.

`DraftPostGameComparisonRevision` estende o domínio de `PostgameReport` com
revisões imutáveis. O mesmo hash canônico + versão devolve a revisão
existente; fonte ou algoritmo alterado cria outra, sem sobrescrever histórico.

API autenticada:

- `GET /draft-sessions/:sessionId/post-game-comparison`;
- `GET /matches/:matchId/draft-comparison`;
- `POST /draft-sessions/:sessionId/post-game-comparison/generate`.

O `POST` rejeita métricas e conclusões do cliente. A interface mostra “Draft
versus partida” sem redesenhar o pós-game e inclui o aviso de não causalidade.
