---
status: IMPLEMENTADA
solicitado_em: 2026-07-25 16:00
implementado_em: 2026-07-25 14:15
---

# Meta e matchup indisponíveis sem dados reais

## Pedido original

> Remover os valores neutros falsos de matchup e meta. Meta sem fonte real, matchup pessoal sem amostra e matchup global sem fonte devem ser indisponíveis, sem usar 50 como fallback. Quando houver histórico pessoal suficiente, o matchup deve preservar o valor calculado, amostra, confiança e proveniência. O score deve normalizar proporcionalmente apenas os pesos das métricas disponíveis e expor a cobertura individual de dados, sem misturá-la com confiança. Preservar a compatibilidade API/desktop sem que respostas legadas com `matchup: 50` ou `meta: 50` criem evidência falsa.

## Notas de implementação

- `PERSONAL_MATCHUP` usa somente as partidas do jogador autenticado, no mesmo campeão, adversário e posição; carrega amostra, confiança e proveniência quando existe.
- Sem amostra, sem inimigo de rota, matchup global e meta sem fonte real, a métrica fica `UNAVAILABLE` com `value: null`, sem barra na interface.
- `LANE_MATCHUP` ficou restrito ao adaptador legado; respostas antigas com `matchup: 50` ou `meta: 50` não recriam evidência.
- `normalizeAvailableWeights` normaliza somente os pesos ativos com dados e `dataCoverage` registra a soma dos pesos originais cobertos por candidato.
- Testes adicionados em core, API e renderer; `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm build` passaram.
