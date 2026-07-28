# Draft Recommendation

## Estratégia 5×5 (Etapa 15)

`TEAM_COMPOSITION` e `ENEMY_COMPOSITION_ANSWER` são produzidas por
`analyzeDraftStrategy` para cada candidato principal e alternativa. O motor
usa o manifesto de capacidades como fonte principal, compara aliados sem/com
o candidato e avalia relações gerais de ameaça–resposta. Pesos, pool, cinco
recomendações, desempenho, matchup, dificuldade e risco não foram alterados.
Ver `docs/draft-strategic-analysis.md`.

O motor fica em `packages/core/src/draft/recommendation-engine.ts`. Auditado e documentado na "Fase 7" (revisão dos algoritmos de scoring) — ver `CLAUDE.md`. Mesma ressalva de `docs/scoring-model.md`: os números abaixo são julgamento de design informado por conhecimento de LoL, não calibração estatística.

Entradas:

- `DraftState`;
- `PlayerProfile`;
- `PlayerChampionStats[]`;
- `ChampionTag[]` (ver "Origem dos ChampionTag" no fim);
- `MatchupData[]`;
- `CompositionRules`;
- `PatchMetaData | null`.

Saída atual: até cinco recomendações principais e até três alternativas,
sempre originadas do pool pessoal explícito da posição. Toda recomendação
precisa explicar motivo, risco, origem, amostra e cobertura — score sem
explicação não é aceito no produto.

## Pool de candidatos (Etapa 12)

`recommendFromPersonalPool` recebe a união já consolidada de observações
Match-V5 normalizadas (`PERSONAL_OBSERVED`) e inclusões explícitas
(`USER_PROVIDED`). Não consulta `ChampionTag.roles`, classes, Smite, listas
fixas nem elegibilidade global.

O resultado é `{ primaryRecommendations, alternatives, poolSummary }`.
Existindo pelo menos cinco candidatos válidos, os cinco primeiros ficam na
lista principal; até três seguintes viram alternativas. Banidos e escolhidos
não são avaliados, não há duplicatas e pool insuficiente nunca é preenchido.
O desempate por `championId` torna o resultado independente da ordem de
entrada.

Candidato sem amostra pessoal mantém `personalPerformance`, `recentForm` e
`matchup` indisponíveis, confiança ausente e `personalGames: 0`. Os pesos
restantes são normalizados por candidato. Nenhum peso, threshold ou fórmula
foi recalibrado; o score de candidato observado já elegível permanece
invariante. Detalhes de persistência, API e compatibilidade:
`docs/player-champion-pool.md`.

## Dificuldade e risco pessoal (Etapa 13)

`CHAMPION_DIFFICULTY` usa exclusivamente o `info.difficulty` oficial
preservado no catálogo, separado de `ChampionTag.difficulty`.
`PERSONAL_EXPERIENCE` mede somente amostra e recência; não lê win rate, KDA
ou score de desempenho. `EXECUTION_RISK` combina dificuldade e essa
evidência e aplica, depois do score base, uma penalização limitada a oito
pontos. Sem dificuldade, a penalização é zero e o score anterior fica
invariante. Fórmula, versões e limites: `docs/champion-execution-risk.md`.

## Pesos por cenário (`selectWeights`)

Três tabelas de peso, cada uma somando 1.0 (invariante testada em `recommendation-engine.test.ts`):

- **Blind pick / first pick** (`draft.pickOrder <= 1`): `personalPerformance 0.45, blindSafety 0.2, compositionFit 0.15, recentForm 0.1, meta 0.05, allySynergy 0.05, matchup 0, enemyDraftAnswer 0`. Sem lane inimiga revelada nem composição aliada formada, matchup/enemyDraftAnswer não fazem sentido (peso 0); `blindSafety` ganha peso alto porque "funciona sem depender do que o inimigo faz" é a própria definição de segurança em blind.
- **Lane inimiga revelada** (`draft.enemyLaneChampionId` definido): `personalPerformance 0.35, matchup 0.25, recentForm 0.15, allySynergy 0.1, enemyDraftAnswer 0.1, meta 0.05, blindSafety 0, compositionFit 0`. `matchup` só entra quando há histórico pessoal real daquele campeão contra o adversário, na mesma posição; `blindSafety`/`compositionFit` zeram — "segurança às cegas" não é mais o problema relevante.
- **Nem blind nem matchup revelado** (pick do meio do draft): `personalPerformance 0.3, enemyDraftAnswer 0.2, allySynergy 0.2, matchup 0.15, recentForm 0.1, meta 0.05, blindSafety 0, compositionFit 0`. `enemyDraftAnswer`/`allySynergy` ganham peso porque a composição de ambos os times já tem mais picks pra reagir/encaixar.

## Sinergia e resposta ao draft

- **`calculateAllySynergy`**: média simples (pesos iguais 1/3) de `engage`/`peel`/`waveclear` das tags — as três mais diretamente ligadas a encaixar com o time aliado formado até agora.
- **`calculateEnemyAnswer`**: `tag.pickoff * 45 + tag.engage * 30 + tag.scaling * 25`, multiplicado por `max(0.8, enemyFragility)`. `pickoff` pesa mais (45) porque "conseguir isolar/eliminar um alvo" é o jeito mais direto de responder a um draft inimigo frágil; o piso `0.8` evita que o enemyAnswer despenque a quase 0 quando o time inimigo já está bem formado (frontline alto) — mesmo contra um time sólido, um pick de resposta ainda tem algum valor.
- **`calculateCompositionFit`**: base `55` (levemente acima do neutro 50 — "nenhum problema de composição a resolver" já é um encaixe ok por padrão), com bônus condicionais quando a composição aliada está abaixo do mínimo de uma `CompositionRules`: `+25` frontline (risco mais crítico — time inteiro fica vulnerável), `+20` engage (sem isso, difícil forçar teamfight), `+15` waveclear (perde-se pra push, raramente perde-se o jogo só por isso), `+10` fixo de dano balanceado (preferência de time, não ausência crítica).

## Reasons, warnings e categoria

- Reasons positivas (`blindSafety >= 70`, `matchup >= 60`) usam thresholds bem acima do neutro 50 — só aparecem quando o sinal é forte o bastante pra valer a pena destacar.
- Warning de amostra pequena reusa `MEDIUM_CONFIDENCE_GAMES` (8, exportado de `champion-performance.ts`) em vez de duplicar o literal — antes da Fase 7 era um `8` solto desalinhado da mesma constante.
- Warning de forma recente fraca usa `recentForm < 45` — abaixo do neutro 50 mas menos extremo que os cortes de fraqueza de `dimension-signals.ts` (35), já que é só um aviso brando, não uma fraqueza estrutural.
- `selectCategory` reusa os mesmos cortes 70/60 de reasons pra `best_blind`/`best_matchup`/`best_teamfit` (consistência: categoria só reflete sinal já forte o bastante pra ter virado reason); `safe_pick` usa corte mais brando (65) por ser a categoria "resultado padrão aceitável", não um destaque.

## Cenários já considerados

- First pick: prioriza desempenho pessoal, blind safety, encaixe geral, forma recente e meta.
- Lane inimiga revelada: adiciona peso forte de matchup.
- Quarto/quinto pick: prioriza resposta ao draft inimigo e sinergia aliada.

## Fora de escopo desta revisão

Recalibrar qualquer peso ou threshold com base em dado estatístico real — não há partidas suficientes acumuladas ainda.

## Origem e disponibilidade das métricas

Cada `PickRecommendation` carrega `metricDetails`: as métricas estruturadas do candidato, cada
uma com disponibilidade, confiança e proveniência próprias. É o que a interface consome — o
bloco numérico `metrics` continua existindo apenas como entrada do `totalScore`.

Ver `docs/data-provenance.md` pro contrato completo, incluindo por que `50` calculado e `50`
por ausência de dado deixaram de ser a mesma coisa.

`PERSONAL_MATCHUP` representa apenas o histórico observado do próprio jogador. Ele traz
amostra, confiança e proveniência quando existe; sem amostra ou sem oponente de rota, fica
indisponível. `GLOBAL_MATCHUP` permanece indisponível até uma fonte global ser integrada, e
`META_STRENGTH` também permanece indisponível até haver Meta Intelligence estatística real.

Quando um sinal com peso ativo está indisponível, `normalizeAvailableWeights` exclui apenas
aquele sinal para o candidato e normaliza os pesos restantes. `dataCoverage` preserva a soma
dos pesos originalmente cobertos, sem ser misturada à confiança estatística: com matchup
(`0,25`) e meta (`0,05`) ausentes, por exemplo, a cobertura é `0,70`.

## Origem dos ChampionTag

`data/seeds/champion-tags.json` cobre o roster inteiro e e **gerado**:

```bash
pnpm --filter @sparta/api champion-tags:generate
```

O gerador le `tags` (classe) e `info` (attack/defense/magic/difficulty, 0-10) do
`champion.json` da Data Dragon e passa por `deriveChampionTag`
(`packages/core/src/draft/champion-tag-derivation.ts`), que mapeia isso pras dimensoes do
Sparta. O arquivo continua versionado de proposito: o resultado da derivacao fica revisavel
num diff, e nao vira efeito colateral invisivel de rodar o seed.

**O que a derivacao nao e**: nao e calibracao estatistica nem conhecimento de campeao
individual. Duas Marksman recebem exatamente o mesmo perfil, e campeao que foge do arquetipo
da classe fica generico demais. E uma leitura de CLASSE - menos precisa que curadoria, muito
mais informativa que o neutro 50 que valia pra quase todo mundo antes.

Entradas com `"source": "manual"` sobrevivem a regeneracao: a curadoria cresce por cima da
base automatica em vez de competir com ela.

`roles` sai vazio nas entradas derivadas porque a Data Dragon **nao publica rota**. Chutar
(Marksman -> ADC, Mage -> MID) erraria em todo campeao flex, e nenhum motor consome
`tag.roles` hoje - inventar o campo so criaria dado falso.

## Posição ausente

`DraftState.playerRole` é opcional desde a Etapa 6. Sem posição, `recommendPicks` devolve `[]`
antes de montar o pool ou escolher a tabela de pesos, e a rota responde `422`
`PLAYER_ROLE_UNAVAILABLE`. Ausência de posição não é MID — ver `docs/data-provenance.md`.
