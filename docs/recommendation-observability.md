# Avaliação longitudinal e observabilidade do motor

## Escopo

`buildLongitudinalRecommendationReport`
(`recommendation-observability/1.0.0`) produz uma leitura descritiva das
sessões de draft vinculadas com segurança ao Match-V5. A agregação é feita
sob demanda sobre os registros históricos; não há tabela, cache ou segunda
fonte de verdade longitudinal.

Esta camada não executa o motor de recomendação, não recalcula snapshots, não
altera pesos e não gera contrafactuais. Vitória e derrota são contagens
observadas, nunca acerto ou erro do Sparta.

## Unidade de análise

Cada `RecommendationObservation` representa uma única `DraftSession`:

- a sessão precisa possuir `linkedMatchId` confiável e campeão escolhido;
- o participante precisa corresponder ao `puuid` da conta;
- o snapshot é o que estava vigente em `lockedInAt`: criado até aquele
  instante e ainda não substituído nele;
- snapshots criados depois do lock-in e snapshots anteriores já substituídos
  não entram;
- a escolha fora do snapshot é `NOT_IN_SNAPSHOT`, com rank, score, cobertura,
  risco e origem do pool ausentes;
- a posição analisada e a observada permanecem separadas;
- a revisão pós-game mais recente é apenas uma dimensão disponível ou
  indisponível; ela não é gerada automaticamente pela consulta.

Uma defesa por `draftSessionId` impede duplicação mesmo se um adapter legado
entregar a mesma sessão duas vezes.

## Agregados

O relatório sempre preserva numerador, denominador e tamanho da amostra para:

- escolhas `PRIMARY`, `ALTERNATIVE` e `NOT_IN_SNAPSHOT`;
- vitórias e derrotas observadas por grupo;
- rank médio, mediano e distribuição por posição original;
- divergência entre posição analisada e observada;
- distribuição por posição, patch, fila e campeão;
- frequência das correspondências e indisponibilidades já calculadas na
  Etapa 22;
- disponibilidade de snapshot, score, cobertura, risco, posição, patch,
  fila, data e relatório pós-game.

Score, cobertura e risco usam faixas determinísticas
`recommendation-observability-bands/1.0.0`. Score e risco usam intervalos de
10 pontos; cobertura usa intervalos de 0,1. Os valores brutos continuam nas
observações e as faixas não são calibração, probabilidade ou threshold do
motor.

Zero medido permanece disponível. Campo ausente aumenta somente o contador
de indisponibilidade daquela dimensão e não elimina a observação inteira.

## Versões

As dimensões centrais são:

- `recommendationEngine`;
- `draftStrategy`;
- `executionRisk`;
- `postgameComparison`.

Outras chaves persistidas no snapshot também aparecem sem serem renomeadas.
Cada versão informa amostra, primeira e última ocorrência observável,
patches, posições, grupos, origens do pool e disponibilidade das métricas.

O limite padrão de cinco observações é configurável por
`displaySampleThreshold`. Ele é somente um limite de apresentação, sem
significância estatística. A comparação direta é marcada indisponível quando
há uma única versão, amostra abaixo do limite, tamanhos muito diferentes ou
ausência de sobreposição de patch, posição, grupo ou origem do pool. Mesmo
quando existe sobreposição, a leitura continua descritiva e não atribui
diferença à qualidade do algoritmo.

## Filtros e API

Rotas autenticadas:

- `GET /players/:playerId/recommendation-observability`;
- `GET /players/:playerId/recommendation-observability/versions`;
- `GET /players/:playerId/recommendation-observability/roles/:role`.

Filtros opcionais:

- `from`, `to`;
- `patch`, `queueId`, `role`, `championId`, `group`;
- `algorithmDimension` + `algorithmVersion`;
- aliases `recommendationVersion`, `strategicVersion`,
  `executionRiskVersion` e `postgameVersion`;
- `displaySampleThreshold`.

Listas usam valores separados por vírgula. Os filtros são aplicados antes de
calcular numeradores e denominadores. O `playerId` precisa ser o `puuid` de
uma conta pertencente ao usuário autenticado; outra conta responde
`PLAYER_OBSERVABILITY_FORBIDDEN`.

O desktop envia somente filtros e apresenta a tela “Histórico do motor”. Não
envia agregados, conclusões ou resultados calculados.

## Limitação obrigatória

Todo relatório inclui:

> Resultados observados descrevem o histórico disponível e não demonstram que
> a recomendação causou vitória ou derrota.

Esta etapa não mede taxa de acerto, não calibra score, não compara candidatos
não escolhidos e não prepara ajuste automático ou aprendizado.
