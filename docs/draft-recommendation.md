# Draft Recommendation

O motor inicial fica em `packages/core/src/draft/recommendation-engine.ts`.

Entradas:

- `DraftState`;
- `PlayerProfile`;
- `PlayerChampionStats[]`;
- `ChampionTag[]`;
- `MatchupData[]`;
- `CompositionRules`;
- `PatchMetaData | null`.

Saída: 3 a 5 recomendações com score, confiança, categoria, motivos e avisos.

Cenários:

- First pick: prioriza desempenho pessoal, blind safety, encaixe geral, forma recente e meta.
- Lane inimiga revelada: adiciona peso forte de matchup.
- Quarto/quinto pick: prioriza resposta ao draft inimigo e sinergia aliada.

Toda recomendação precisa explicar o motivo e o risco. Score sem explicação não é aceito no produto.
