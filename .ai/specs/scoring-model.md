# Scoring Model

Este documento descreve os algoritmos que avaliam desempenho do jogador, com os valores atuais e o raciocínio por trás de cada um. Auditado e documentado na "Fase 7" (revisão dos algoritmos de scoring) — ver `CLAUDE.md`.

**Importante**: os números abaixo (baselines, pesos, thresholds) são **julgamento de design informado por conhecimento de domínio de League of Legends**, não calibração estatística. O Sparta ainda não acumulou dado real suficiente (apenas ~20-25 partidas de uma única conta de teste) para justificar ajustar esses valores com base em estatística. Onde um número tem alguma derivação relativa a outro (ex.: "mesma granularidade de"), isso está indicado explicitamente; o resto é arbitrário mas motivado.

## `packages/core/src/scoring/champion-performance.ts`

Score de desempenho de um jogador num campeão específico, de 0 a 100.

### Regras gerais

- `MIN_GAMES_FOR_RANKING = 5`: piso de partidas pra um campeão entrar no ranking (`rankChampionPool`). Amostra menor é considerada instável demais pra comparar contra outros campeões.
- Volume de partidas não aumenta o score diretamente — só afeta `confidence` (`confidenceFromGames`): `low` abaixo de `MEDIUM_CONFIDENCE_GAMES` (8), `medium` entre 8 e `HIGH_CONFIDENCE_GAMES` (20), `high` a partir de 20.
- `DEATHS_BAD_VALUE = 7`: mortes por partida (ou numa partida individual) igual ou acima disso zera o componente de mortes em `normalizeInverse`. Usado consistentemente em `scoreChampionPerformance`, `calculateRecentForm`, `player-insights.ts` e `postgame/post-game-analysis.ts` — antes da Fase 7, `calculateRecentForm` usava `8` em vez de `7` sem motivo pra divergir dos outros três usos; corrigido pra uma única constante.
- KDA usa `(kills + assists) / max(1, deaths)`.

### `roleBaselines`

Valor "esperado" por role e por dimensão (kda, cs, damage, gold, vision, kp, objective), usado como denominador em `normalizeRatio` (valor real ÷ baseline). Aproximações de senso comum de LoL:

| Role | kda | cs/min | dano/min | gold/min | visão/min | kp | objetivo |
|---|---|---|---|---|---|---|---|
| TOP | 3.2 | 7.5 | 700 | 420 | 0.8 | 0.5 | 0.35 |
| JUNGLE | 3.5 | 5.8 | 560 | 390 | 1.0 | 0.62 | 0.62 |
| MID | 3.4 | 7.7 | 760 | 430 | 0.85 | 0.56 | 0.38 |
| ADC | 3.2 | 8.2 | 780 | 440 | 0.7 | 0.58 | 0.42 |
| SUPPORT | 3.1 | 1.2 | 360 | 270 | 2.2 | 0.64 | 0.5 |

Suporte farma pouco (CS/gold baixos) mas tem visão muito acima dos outros roles; jungle e suporte priorizam kp/objective mais que os laners, que dependem mais de CS/dano/gold individuais.

### Pesos por role (`weights`, cada role soma 1.0)

- **TOP/MID/ADC** (laners): `kda 0.2, winrate 0.15, cs 0.15, damage 0.15, gold 0.1, deaths 0.1, recent 0.1, vision 0.05`. Priorizam os sinais mais diretos de performance de lane 1v1/1v2.
- **JUNGLE**: `kda 0.15, winrate 0.15, kp 0.15, objective 0.15, gold 0.1, damage 0.1, deaths 0.1, recent 0.1`. Troca peso de CS por kp/objective — farm é menos relevante que presença em rotas/objetivos.
- **SUPPORT**: `kp 0.2, vision 0.2, deaths 0.15, objective 0.15, kda 0.1, winrate 0.1, recent 0.1`. Concentra em kp/visão (as duas fontes primárias de impacto do papel, já que não há ouro/CS próprios relevantes pra medir) e reduz kda/winrate individuais (resultado de time pesa mais que estatística pessoal).

A soma exata de 1.0 por role é uma invariante testada estruturalmente em `champion-performance.test.ts`.

### `normalizeRatio` — âncora `*75`

`clamp((valor / esperado) * 75)`. Estar exatamente na baseline rende **75/100, não 100** — deixa margem acima de "no esperado" pra recompensar quem supera a expectativa, em vez de já cravar o teto só por atingir a média do role.

### Forma recente (`calculateRecentForm`)

Decaimento exponencial: `recencyWeight(index) = exp(-index / decayFactor)`, com `decayFactor = 8`. Isso dá uma "meia-vida" de ~8 partidas: o peso cai a ~37% (1/e) no índice 8 e a ~1% perto do índice 37 — uma janela de "forma recente" de aproximadamente uma sessão/dia competitivo típico, não uma temporada inteira.

Cada partida individual dentro da janela é pontuada com sub-pesos fixos (somam 1.0): `kda 0.25, resultado 0.2, cs 0.15, dano 0.15, gold 0.1, mortes 0.1, visão 0.05`. `kp`/`objective` ficam de fora deliberadamente (às vezes ausentes/zerados na Riot em patches antigos; incluir penalizaria erroneamente partidas antigas sem esse dado). O resultado (vitória/derrota) usa um bônus/penalidade categórico fixo (`100`/`35`), não proporcional à margem — os outros componentes já capturam qualidade da partida; isso só marca o resultado bruto.

## `packages/core/src/scoring/dimension-signals.ts`

Deriva sinais de "força"/"fraqueza" a partir de uma razão (centro 1.0) ou de um score já calculado (centro 50), genérico o suficiente pra servir tanto uma média entre partidas (`player-insights.ts`) quanto o valor bruto de uma única partida (`post-game-analysis.ts`).

- `RATIO_STRENGTH_THRESHOLD = 1.1` / `RATIO_WEAKNESS_THRESHOLD = 0.85`: bandas **deliberadamente assimétricas** em torno do centro 1.0 — a banda de fraqueza começa mais perto do centro (15% abaixo) que a de força (10% acima), porque ficar abaixo do esperado é mais acionável/notável de sinalizar ao jogador do que superar a expectativa.
- `RATIO_HIGH_SEVERITY = 0.7` / `RATIO_MEDIUM_SEVERITY = 0.8`: sub-tiers de severidade dentro da banda de fraqueza.
- `SCORE_STRENGTH_THRESHOLD = 65` / `SCORE_WEAKNESS_THRESHOLD = 35`: equivalente em "espaço de score" — aqui **simétrico** (ambos 15 pontos do centro 50), diferente da assimetria em espaço de razão, porque um score já é uma escala absoluta calculada pelo chamador (ex.: winrate 0-100), não uma razão onde "acima"/"abaixo" têm grandezas naturalmente diferentes.
- `SCORE_HIGH_SEVERITY = 20` / `SCORE_MEDIUM_SEVERITY = 30`: sub-tiers análogos em espaço de score.

## `packages/core/src/aggregation/player-insights.ts`

- `PREVIOUS_BLOCK_MIN_GAMES = 3`: piso de partidas no bloco anterior pra calcular tendência — com menos que isso, uma única partida oscilaria o bloco inteiro demais pra confiar numa direção.
- `TREND_THRESHOLD_POINTS = 5`: diferença mínima (em pontos de score 0-100) entre bloco recente e anterior pra considerar "melhorando"/"piorando" em vez de "estável".
- `MAX_STRENGTHS`/`MAX_WEAKNESSES = 3`: corte de top-N pontos fortes/fracos mostrados — mais que isso deixa de ser resumo acionável e vira lista exaustiva. Mesmo corte usado em `post-game-analysis.ts` (Fase 4) pro mesmo conceito numa única partida.

## `packages/core/src/aggregation/growth-journey.ts`

- `MIN_BLOCK_REPORTS = 3`: mesmo raciocínio de `PREVIOUS_BLOCK_MIN_GAMES`, aplicado aos dois blocos (não só ao anterior) — com poucos relatórios, um bloco pequeno oscila a taxa em 50-100 pontos, gerando veredito "resolved"/"new" espúrio a partir de 1 jogo.
- `RATE_TREND_THRESHOLD_POINTS = 20`: 20 pontos percentuais num bloco de 10 partidas equivale a uma oscilação de 2 jogos — mesma granularidade aceita por `TREND_THRESHOLD_POINTS` (5 pontos de score), só que em unidade de taxa de presença (%) em vez de score 0-100.

## Fora de escopo desta revisão

Recalibrar qualquer peso, baseline ou threshold com base em dado estatístico real — não há partidas suficientes acumuladas ainda. Os valores acima devem ser revisitados quando houver volume real de uso do produto.
