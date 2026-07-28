# Evidência pessoal e elegibilidade global por posição

O Sparta mantém dois contratos que não se substituem:

- `PlayerChampionRoleEvidence` é a experiência factual deste jogador com
  este campeão nesta posição. Ela é agregada exclusivamente das
  `MatchObservation` normalizadas na Etapa 10, cuja origem é o Match-V5.
- `GlobalChampionRoleEligibility` responderia se o campeão é globalmente
  elegível para a posição. Não há fonte aprovada; a resposta atual é sempre
  `status: "UNAVAILABLE"`, `eligible: null` e
  `"Elegibilidade global por posição ainda não está disponível."`.

Uma partida de Vel'Koz como suporte aumenta apenas a evidência pessoal de
Vel'Koz/SUPPORT. Smite, classes, tags, dificuldade, frequência pessoal e
conhecimento manual não criam elegibilidade de jungle ou de outra posição.

## Fonte, filtros e resposta

`findPlayerChampionRoleEvidence` consulta `MatchObservation` com
`positionStatus = AVAILABLE` e `normalizedRole` exato. O campo legado
`MatchParticipant.role` e `PlayerChampionStats` não são fontes. Observação
sem posição normalizada é excluída e nunca vira MID.

A saída contém campeão, posição, partidas, V/D, última partida, patches,
filas, versões do extrator, origem da normalização e proveniência. Amostra
zero é `UNAVAILABLE`, com `sampleSize: 0` e motivo explícito; não existe
confiança, score neutro ou limiar arbitrário de "experiência".

Rota:

`GET /players/:puuid/champions/:championId/role-evidence?role=SUPPORT`

`patch`, `queueId`, `gameMode` e `gameType` aceitam listas explícitas
separadas por vírgula; `from` e `to` aceitam ISO 8601. Múltiplas filas
aparecem em `queueIds`. Uma partida antiga continua factual; o contrato não
a chama de recente.

A resposta separa `personalRoleEvidence`, `globalRoleEligibility` e `scope`;
nunca usa uma única lista `roles` para representar os dois conceitos.

## Auditoria de `role` e `roles`

| Uso | Classificação | Regra |
| --- | --- | --- |
| `DraftState.playerRole`, `DraftPick.role` | posição do draft atual | Vale somente para a sessão atual. |
| `MatchObservation.normalizedRole` | posição observada | Fato Match-V5 normalizado e versionado. |
| `PlayerChampionStats.role`, `MatchupData.role` | histórico pessoal | Não representa população global. |
| `PlayerChampionRoleEvidence.role` | experiência pessoal explícita | Agrega somente `MatchObservation`. |
| `PickRecommendation.role` | contexto da recomendação | É a posição solicitada no draft. |
| `GlobalChampionRoleEligibility.role` | elegibilidade global | Indisponível até existir fonte aprovada. |
| `ChampionTag.roles` | legado ambíguo | Sempre vazio e não consumido pelo motor. |
| `Champion.roles` | legado ambíguo de catálogo | Sem origem conhecida; nunca é elegibilidade. |
| `PlayerProfile.preferredRoles` | alias legado | Espelha `observedRoles`, derivado do volume pessoal. |

`adaptLegacyChampionRoleField` é o ponto central para ler `role`/`roles`
antigos: devolve valores com `semantics: "UNKNOWN"`, sem proveniência e sem
campo `eligible`.

## ChampionTag, motor e interface

O manifesto e o seed mantêm `ChampionTag.roles` vazio, inclusive para Ahri
e Orianna, cujos valores MID eram curadoria manual sem fonte global. O seed
também limpa o campo legado `Champion.roles` no banco.

Nenhum peso, threshold, tamanho do pool ou score mudou. Um teste de
invariância executa o motor com `ChampionTag.roles: ["MID"]` e `[]` e exige
saída idêntica.

No detalhe de pós-jogo, um único card mostra experiência observada, V/D,
última partida, patches, filas e origem Match-V5. A indisponibilidade global
é secundária. O card não sugere posição nem chama amostra antiga de recente.
