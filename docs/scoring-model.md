# Scoring Model

O primeiro score de campeão fica em `packages/core/src/scoring/champion-performance.ts`.

Regras:

- O score vai de 0 a 100.
- O campeão precisa de pelo menos 5 partidas para entrar no ranking.
- A quantidade de partidas não aumenta diretamente o score.
- O volume afeta somente a confiança: `low`, `medium` ou `high`.
- KDA usa `(kills + assists) / max(1, deaths)`.
- Forma recente usa `exp(-index / 8)`, onde `index = 0` é a partida mais recente.

Pesos iniciais variam por role. Laners priorizam KDA, winrate, CS/min, dano/min, gold/min, mortes evitadas, forma recente e visão. Jungle pesa participação em abates e objetivos. Suporte pesa participação, visão, mortes evitadas e objetivos.
