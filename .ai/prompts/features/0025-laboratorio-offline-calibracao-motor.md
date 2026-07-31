---
status: IMPLEMENTADA
solicitado_em: 2026-07-30 17:05
implementado_em: 2026-07-31 00:52
---

# Laboratório offline de calibração do motor (Etapa 25a — domínio puro)

## Pedido original

> # ETAPA 25 — Laboratório offline de calibração do motor
>
> Criar um laboratório offline e versionado para comparar configurações candidatas do motor
> contra a linha de base histórica: definir configurações candidatas, reexecutar drafts
> históricos usando somente o dado disponível naquele momento, comparar rankings, medir
> estabilidade e deslocamento, cruzar com revisões humanas pré-partida, segmentar por
> posição/patch/cobertura/versão, gerar relatórios de impacto e **impedir promoção automática
> para produção**. Status máximo de promoção: `APPROVED_FOR_FUTURE_RELEASE`.
>
> Vitória e derrota não podem ser usadas como rótulo automático de recomendação correta.
>
> Não utilizar no replay: resultado posterior; KDA; timeline; build utilizada; observações
> importadas depois do draft; partidas jogadas depois daquele snapshot; revisão pós-resultado.
> O replay não pode ter vazamento temporal.
>
> Não: modificar a configuração operacional; alterar variáveis de ambiente de produção;
> atualizar snapshots históricos; publicar novos pesos automaticamente; trocar a versão ativa do
> motor; usar vitória como label; usar dados posteriores no replay; recalcular snapshots
> históricos; treinar modelo; criar otimizador automático; buscar pesos por força bruta; criar
> A/B test em usuários reais; habilitar meta global; misturar versões históricas silenciosamente;
> considerar maior score como melhoria automática.

## Decisão do usuário sobre o replay (caminho A)

Apresentada a restrição arquitetural encontrada na auditoria (abaixo), o usuário escolheu o
**caminho A**: o laboratório trabalha somente com replay historicamente honesto. Caminho C
(usar dado atual como substituto) foi **rejeitado** por vazamento temporal e risco de comparação
enganosa. A etapa foi dividida em **25a** (domínio puro) e **25b** (persistência, API, tela,
validação real, fluxo de aprovação).

Classificação exigida por parâmetro:

- `EXACT_REWEIGHT` — altera apenas pesos sobre métricas já congeladas no snapshot.
- `EXACT_POST_AGGREGATION` — altera somente regras aplicadas depois das métricas congeladas,
  sem mudar sua derivação.
- `REQUIRES_HISTORICAL_DERIVATION_INPUT` — depende de `PlayerChampionStats`, `ChampionTag`,
  capacidades ou outros inputs históricos não preservados.
- `UNSUPPORTED` — não pode ser avaliado pelo laboratório atual.

Parâmetros que exigem inputs históricos ausentes devem ser **rejeitados na validação da
configuração**, com motivo estruturado — não se executa um experimento inteiro só para marcar
todos os casos como impossíveis.

## Auditoria (feita antes da implementação)

### 1. Não existe nada de calibração no repositório

`grep -rln "Calibration|calibration|EngineCandidate"` em `apps/` e `packages/` (excluindo
`dist`) retornou **zero arquivos**. Construção inteiramente nova; nada a preservar ou migrar.

### 2. O que o snapshot histórico realmente preserva

`PersistedRecommendation` (`packages/core/src/draft/recommendation-snapshot.ts`, Etapa 16)
guarda por candidato: `totalScore`, `dataCoverage`, `metricDetails` (`RecommendationMetric[]`,
com `value: number | null` e `status`), `effectiveWeights` (pesos **já normalizados** que
produziram aquele score), `category`, `confidence`, `reasons`, `warnings`, `limitations`,
`personalGames`, `poolSource` e `strategicAnalysis`.

`RecommendationSnapshotRecord` guarda ainda `canonicalInput` (posição, origem da posição, pool
com origem, aliados, inimigos, bans, adversário direto, campeão selecionado) e
`algorithmVersions`.

### 3. O que o snapshot **não** preserva — a restrição central

Não existe, em lugar nenhum, o estado histórico de `PlayerChampionStats`, `ChampionTag`,
`ChampionCapabilityProfile` nem dos agregados de matchup **como estavam no instante do draft**.
Essas tabelas são recalculadas a cada sync e sobrescritas.

Consequência direta: só é reproduzível o que opera **sobre as métricas já congeladas**.
Recalcular qualquer derivação com os dados de hoje leria um histórico maior do que o jogador
tinha no draft — exatamente o vazamento temporal proibido.

### 4. Fórmula exata do score, medida no motor

`recommendFromPersonalPool` (`recommendation-engine.ts:298-303`):

```txt
baseScore  = round( Σ_k metrics[k] * normalizedWeights[k] )    // round = 1 casa decimal
totalScore = round( clamp( baseScore - executionRisk.scorePenalty, 0, 100 ) )
```

`normalizeAvailableWeights` (`recommendation-engine.ts:37`) zera o peso do sinal indisponível e
divide os restantes por `dataCoverage` (soma dos pesos originais que tinham dado).

### 5. A penalização de risco é reconstruível sem dado histórico

`riskPenalty` (`execution-risk.ts:166-172`) depende **somente** do valor de risco:

```txt
risk <= EXECUTION_RISK_PENALTY_START (25) → 0
senão → round( clamp((risk - 25) / 75, 0, 1) * EXECUTION_RISK_MAX_PENALTY (8) )
```

E esse valor de risco **está congelado** no snapshot, como a métrica `EXECUTION_RISK`
(`execution-risk.ts:246-260`, `availableMetric({ key: "EXECUTION_RISK", value: risk, ... })`).

Isso torna a verificação de integridade um teste real, não circular: a penalização é calculada
de forma independente a partir da métrica congelada e o `totalScore` persistido é comparado com
o reconstruído. Também torna `EXECUTION_RISK_PENALTY_START` e `EXECUTION_RISK_MAX_PENALTY`
parâmetros genuinamente **pós-agregação** (mudam a curva aplicada a um risco já congelado),
enquanto `MAX_FAMILIARITY_RISK_RELIEF` altera como o próprio risco é derivado e portanto exige
input histórico ausente.

### 6. Mapeamento 1:1 entre chave do motor e métrica congelada

Confirmado em `toRecommendationMetrics` (`recommendation-metrics.ts:87-155`):

| Chave do motor       | Métrica congelada           |
| -------------------- | --------------------------- |
| `personalPerformance`| `PERSONAL_PERFORMANCE`      |
| `recentForm`         | `RECENT_FORM`               |
| `matchup`            | `PERSONAL_MATCHUP`          |
| `blindSafety`        | `BLIND_SAFETY`              |
| `allySynergy`        | `ALLY_SYNERGY`              |
| `enemyDraftAnswer`   | `ENEMY_COMPOSITION_ANSWER`  |
| `compositionFit`     | `TEAM_COMPOSITION`          |
| `meta`               | `META_STRENGTH`             |

Nos casos com análise estratégica, `metrics.enemyDraftAnswer` e `metrics.compositionFit` são
literalmente `strategicAnalysis.*.value`, ou seja, o mesmo número que vai para `metricDetails`.
`META_STRENGTH` é sempre indisponível (Etapa 18) e `GLOBAL_MATCHUP` não tem chave de peso.

## Escopo da Etapa 25a

Somente domínio puro em `packages/core/src/calibration/`:

- contrato da configuração candidata e registro de capacidade de replay por parâmetro;
- validação com rejeição estruturada;
- canonicalização e string de hash (o hash em si fica na 25b, que tem `node:crypto`);
- reconstrução do baseline a partir das métricas congeladas, com tolerância documentada;
- reponderação exata;
- comparação de rankings e métricas de estabilidade;
- segmentação e motivos de exclusão;
- testes determinísticos.

## Fora do escopo da 25a

Migration, persistência, repositório, rotas, tela, execução operacional e qualquer alteração do
motor ativo — tudo isso é 25b.

## Etapa futura registrada (não faz parte de 25a nem 25b)

Criar um `ReplayInputBundle` imutável gravado junto de **novos** snapshots, contendo os inputs
necessários para reproduzir derivações (`PlayerChampionStats` do momento, `ChampionTag`,
capacidades, agregados de matchup). A captura é **prospectiva**: não torna snapshots antigos
reproduzíveis e não reconstrói dado histórico a partir do estado atual.

## Critérios de aceite (25a)

1. Configuração com qualquer parâmetro `REQUIRES_HISTORICAL_DERIVATION_INPUT` ou `UNSUPPORTED`
   é rejeitada na validação, com parâmetro, capacidade e dependência histórica ausente nomeados.
2. Peso negativo, chave desconhecida e valor não finito são rejeitados.
3. Baseline reconstruído bate com o `totalScore` persistido dentro da tolerância documentada;
   quando não bate, o caso é `REPLAY_INTEGRITY_FAILED` e **não** entra na comparação.
4. Reponderação usa somente métricas congeladas, disponibilidade histórica e a penalização
   derivada da métrica congelada — nenhum acesso a resultado, KDA, timeline, build, observação
   posterior ou revisão pós-resultado.
5. Nenhuma função do módulo recebe resultado de partida; vitória e derrota não existem no
   contrato.
6. Score maior não é tratado como melhoria: a comparação reporta deslocamento e estabilidade,
   sem veredito automático.
7. Promoção máxima expressável no tipo: `APPROVED_FOR_FUTURE_RELEASE`.

## Resultado medido (Etapa 25a)

### Integridade contra o Postgres real

Banco local, leitura apenas (nenhuma escrita, nenhuma migration): **2 snapshots** e
**11 recomendações persistidas**, todas de JUNGLE, agregação `1.0.0`.

**11 de 11 candidatos reconstruídos como `EXACT_REPLAY`, com diferença zero:**

| Campeão  | Persistido | Reconstruído | Base | Penalização | Origem da penalização |
| -------- | ---------- | ------------ | ---- | ----------- | --------------------- |
| Nocturne | 44.5       | 44.5         | 46   | 1.5         | `FROM_FROZEN_RISK`    |
| Lee Sin  | 38.5       | 38.5         | 42   | 3.5         | `FROM_FROZEN_RISK`    |
| Udyr     | 47         | 47           | 51.6 | 4.6         | `FROM_FROZEN_RISK`    |
| Graves   | 60         | 60           | 60.4 | 0.4         | `FROM_FROZEN_RISK`    |
| Viego    | 57.8       | 57.8         | 59.6 | 1.8         | `FROM_FROZEN_RISK`    |
| Vi       | 44.5       | 44.5         | 46   | 1.5         | `FROM_FROZEN_RISK`    |

(o segundo snapshot repete cinco desses candidatos, com os mesmos valores)

As penalizações são não triviais e todas diferentes entre si, e foram recuperadas **sem** olhar o
`totalScore`: só a partir da métrica `EXECUTION_RISK` congelada. Nenhum caso caiu em
`ABSENT_AND_ZERO`, `SCORE_MISMATCH` ou `MISSING_EXECUTION_RISK`.

### Experimento real com uma candidata de reponderação

Configuração `composicao-mais-pesada` (composição 0.20 contra os 0.25/0.15 de desempenho e forma),
validada como reproduzível e aplicada aos 2 casos:

- 2 de 2 casos reproduzidos, 0 excluídos;
- `top1PreservedRate` 0 — Viego assume a primeira posição nos dois casos;
- deslocamento médio de rank 1.17, máximo 4 (Graves 1→5 no segundo caso);
- sobreposição do grupo primário 1.0 (ninguém saiu do grupo, só mudou de ordem);
- 2 inversões conforto × estratégico.

A mesma configuração com `minGamesForRanking: 3` foi **rejeitada na validação**, com
`REQUIRES_HISTORICAL_DERIVATION_INPUT` e a dependência `PlayerChampionStats.games no instante do
draft` nomeada — sem executar o experimento.

### Observação da amostra real

A cobertura histórica dos casos ficou na faixa `<0.5` (0.25 para cinco dos seis candidatos, 0.8
para Viego). É consequência conhecida de `META_STRENGTH` ser sempre indisponível e de a maior
parte do pool não ter histórico pessoal naquela posição — não é um defeito do laboratório, mas
limita bastante o que a amostra atual sustenta.

### Testes

51 testes novos determinísticos (`engine-candidate.test.ts` 16, `snapshot-replay.test.ts` 18,
`ranking-comparison.test.ts` 17). Suíte completa: **831 testes** (era 780).
`typecheck`, `lint`, `test` e `build` completos no monorepo.

### Fora do escopo, como planejado

Nenhuma migration, persistência, repositório, rota, tela ou execução operacional. O motor ativo
não foi alterado: `recommendation-engine.ts`, `champion-performance.ts` e `execution-risk.ts` não
aparecem no diff.
