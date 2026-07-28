# Pool pessoal por posição

O pool de candidatos do Champion Select é explícito e pertence à conta Riot
autenticada. Para cada posição, ele contém somente a união de:

- `PERSONAL_OBSERVED`: o próprio jogador usou o campeão naquela posição em
  uma `MatchObservation` normalizada;
- `USER_PROVIDED`: o usuário adicionou deliberadamente o campeão àquela
  posição.

Não entram no pool `ChampionTag.roles`, classes ou tags da Data Dragon, Smite,
observações de outros jogadores, listas fixas ou qualquer inferência de
elegibilidade global. `GlobalChampionRoleEligibility` continua
`UNAVAILABLE`.

## Persistência

`PlayerChampionPoolEntry` é única por `riotAccountId + championId + role` e
registra `source`, `enabled`, `createdAt` e `updatedAt`. A origem observada é
materializada de forma idempotente a partir de `MatchObservation`; se já
existir uma entrada manual para a mesma chave, a observação real prevalece.

Entradas manuais podem ser desabilitadas e reativadas. Entradas observadas não
podem ser classificadas como manuais nem desabilitadas pela API, e nenhuma
operação do pool apaga o histórico Match-V5.

## API

Todas as operações abaixo exigem autenticação e resolvem a conta Riot pelo
usuário da sessão:

- `GET /players/pool?role=MID`: entradas da posição e contagens de todas as
  posições;
- `POST /players/pool` com `{ championId, role }`: inclusão manual idempotente;
- `PATCH /players/pool/:championId` com `{ role, enabled: false }`:
  desabilitação de uma entrada manual;
- `POST /drafts/recommendations`: consolida o pool e gera o ranking.

O payload de inclusão não aceita `source`; a origem é definida pelo servidor.
Campeão inexistente e posição inválida são recusados. Todas as chaves de
persistência incluem a conta autenticada.

## Recomendações

O motor avalia cada candidato independentemente, exclui campeões banidos ou já
escolhidos e ordena por score, com `championId` como desempate determinístico.
A resposta contém:

```ts
{
  primaryRecommendations: RankedPoolRecommendation[]; // até 5
  alternatives: RankedPoolRecommendation[];           // até 3
  poolSummary: {
    totalCandidates: number;
    evaluatedCandidates: number;
    primaryCount: number;
    alternativeCount: number;
    status: AvailabilityStatus;
    shortageReason?: string;
  };
}
```

Com cinco ou mais candidatos válidos, há exatamente cinco recomendações
principais. As três opções seguintes podem aparecer como alternativas. Com
menos de cinco, somente os candidatos reais são devolvidos e
`shortageReason` informa a insuficiência.

Cada recomendação informa rank, score, cobertura, origem no pool, partidas
pessoais, métricas estruturadas, motivos e limitações. A ordem de entrada do
pool não altera os scores.

## Ausência de histórico pessoal

Um campeão manual sem partidas continua elegível pelos sinais estratégicos já
produzidos pelo motor. Para ele:

- `personalGames` é `0`;
- desempenho pessoal, forma recente e matchup pessoal são `null` e
  `UNAVAILABLE`;
- confiança pessoal fica ausente;
- os pesos são normalizados somente entre os componentes disponíveis para
  aquele candidato;
- nenhum `0` de desempenho ou `50` neutro é criado para preencher a ausência.

Se o perfil estratégico `ChampionTag` também estiver ausente, blind safety,
sinergia, resposta ao inimigo e encaixe de composição ficam `null` e
`UNAVAILABLE`; o motor não fabrica `50` nem proveniência derivada.

Os pesos, thresholds e fórmulas existentes não foram recalibrados. Para
candidatos observados que já eram elegíveis, score e métricas permanecem
invariantes.

## Compatibilidade e limites

A API mantém temporariamente o alias legado `recommendations`, contendo apenas
as recomendações principais. O desktop também aceita uma API antiga que
devolva somente essa lista, sem inventar origem, candidatos ou alternativas.

Somente o pool é persistido. Draft, ranking, escolha, recomendações e
explicações continuam efêmeros.
