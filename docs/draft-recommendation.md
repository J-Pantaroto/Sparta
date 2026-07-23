# Draft Recommendation

O motor fica em `packages/core/src/draft/recommendation-engine.ts`. Auditado e documentado na "Fase 7" (revisão dos algoritmos de scoring) — ver `CLAUDE.md`. Mesma ressalva de `docs/scoring-model.md`: os números abaixo são julgamento de design informado por conhecimento de LoL, não calibração estatística.

Entradas:

- `DraftState`;
- `PlayerProfile`;
- `PlayerChampionStats[]`;
- `ChampionTag[]`;
- `MatchupData[]`;
- `CompositionRules`;
- `PatchMetaData | null`.

Saída: 3 a 5 recomendações com score, confiança, categoria, motivos e avisos. Toda recomendação precisa explicar o motivo e o risco — score sem explicação não é aceito no produto.

## Pesos por cenário (`selectWeights`)

Três tabelas de peso, cada uma somando 1.0 (invariante testada em `recommendation-engine.test.ts`):

- **Blind pick / first pick** (`draft.pickOrder <= 1`): `personalPerformance 0.45, blindSafety 0.2, compositionFit 0.15, recentForm 0.1, meta 0.05, allySynergy 0.05, matchup 0, enemyDraftAnswer 0`. Sem lane inimiga revelada nem composição aliada formada, matchup/enemyDraftAnswer não fazem sentido (peso 0); `blindSafety` ganha peso alto porque "funciona sem depender do que o inimigo faz" é a própria definição de segurança em blind.
- **Lane inimiga revelada** (`draft.enemyLaneChampionId` definido): `personalPerformance 0.35, matchup 0.25, recentForm 0.15, allySynergy 0.1, enemyDraftAnswer 0.1, meta 0.05, blindSafety 0, compositionFit 0`. `matchup` passa a valer (segunda maior fatia) porque agora há dado concreto de "esse campeão vs aquele campeão"; `blindSafety`/`compositionFit` zeram — "segurança às cegas" não é mais o problema relevante.
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
