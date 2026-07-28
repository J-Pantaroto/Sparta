# Draft versus partida

## Objetivo e limite

`buildDraftPostGameComparison` compara o que ficou persistido antes da
partida com fatos observados depois dela. O algoritmo
`draft-postgame-comparison/1.0.0` é puro: não chama o motor de recomendação,
não recalcula ranking, não simula candidatos não escolhidos e não produz
contrafactual.

Vitória e derrota são somente fatos. Score de recomendação não é
probabilidade de vitória e cobertura não é confiança, qualidade da partida
ou nota do jogador.

## Linha temporal

### Antes da partida

- posição e origem registradas na `DraftSession`;
- draft conhecido, patch e fila;
- `RecommendationSnapshot` mais recente da sessão;
- ranking, grupo, score, cobertura e pool da recomendação escolhida;
- métricas, riscos, experiência, dificuldade, estratégia, limitações e
  versões daquele snapshot;
- histórico pessoal de loadout reconstruído somente com
  `MatchObservation.context.startedAt <= RecommendationSnapshot.createdAt`;
- notas de patch somente como “conhecidas no draft” quando a revisão já
  estava persistida no instante do snapshot.

### Depois da partida

- resultado e campeão do Match-V5;
- posição normalizada;
- KDA, CS, ouro, dano, visão e participações disponíveis;
- timeline, incluindo mortes antes de 10/15, CS em 10/15 e diferença de ouro
  aos 15 quando presentes;
- inventário final, runas e feitiços observados;
- patch, fila e duração.

Contexto oficial de patch importado depois do snapshot permanece marcado
como posterior. O impacto teórico fica separado da mudança oficial e nunca
vira força global observada.

## Correspondências

Cada `PostGameComparisonSignal` possui ID estável, estado, evidência anterior,
evidência posterior, proveniência e limitação. Frases usam correspondência,
nunca causa.

Exemplos cobertos:

- posição do draft versus posição observada;
- risco de execução persistido versus mortes precoces da timeline;
- matchup pessoal persistido versus uma nova observação, somente quando o
  adversário direto é confirmado;
- configuração observada versus padrões pessoais anteriores ao snapshot;
- mudança oficial do patch como contexto temporal.

Participação em objetivos permanece no resumo observado mesmo quando é zero.
Ela só vira comparação quando existir expectativa prévia independente. A
versão atual do snapshot não persiste essa expectativa isoladamente, então o
sinal comparativo declara a limitação em vez de inferi-la.

Matchup global e impacto global observado do patch continuam indisponíveis.

## Cobertura

A cobertura é a média simples de oito dimensões booleanas e independentes:

1. snapshot disponível;
2. campeão escolhido presente no snapshot;
3. posição compatível;
4. adversário direto confirmado;
5. timeline disponível;
6. estatísticas observadas disponíveis;
7. loadout observado disponível;
8. participação em objetivos disponível.

Uma divergência de posição remove a dimensão correspondente e impede que
matchup, itens, runas ou feitiços da posição antiga sejam tratados como
equivalentes. Zero observado conta como disponível; ausência não.

## Escolha fora do snapshot e snapshot ausente

Uma escolha ausente do ranking recebe `NOT_IN_SNAPSHOT`, sem score, posição
ou grupo retroativos. O motor atual não é executado.

Sem snapshot, o relatório ainda preserva o resumo real da partida, mas as
comparações históricas ficam indisponíveis e a API responde
`SNAPSHOT_MISSING`.

## Persistência e reprodução

`DraftPostGameComparisonRevision` é uma extensão revisionada do domínio
`PostgameReport`. A linha vincula:

- conta Riot;
- `DraftSession`;
- `RecommendationSnapshot`, quando existe;
- `Match`;
- `PostgameReport` geral, quando já existe.

O SHA-256 cobre somente inputs canônicos de fonte, sem `generatedAt`.
`draftSessionId + inputHash + algorithmVersion` é único. O mesmo input e
versão devolvem a revisão existente; mudança legítima de fonte ou algoritmo
cria nova revisão. Relatórios anteriores nunca são sobrescritos.

Também ficam persistidos versões de fonte/algoritmo, IDs dos sinais do
snapshot, cobertura e motivos de indisponibilidade.

## API

```http
GET  /draft-sessions/:sessionId/post-game-comparison
GET  /matches/:matchId/draft-comparison
POST /draft-sessions/:sessionId/post-game-comparison/generate
```

O `POST` não aceita métricas nem conclusões. O servidor resolve todas as
fontes pela conta autenticada e pelos vínculos persistidos.

Estados de consulta:

- `AVAILABLE`;
- `PARTIAL`;
- `MATCH_NOT_LINKED`;
- `SNAPSHOT_MISSING`;
- `TIMELINE_UNAVAILABLE`;
- `NOT_GENERATED`.

Uma sessão sem partida vinculada nunca recebe relatório. Partida ou sessão
de outra conta retorna 404 sem expor o relatório.
