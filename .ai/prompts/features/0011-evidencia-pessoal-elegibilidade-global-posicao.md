---
status: IMPLEMENTADA
solicitado_em: 2026-07-27 21:30
implementado_em: 2026-07-27 21:47
---

# Evidência pessoal e elegibilidade global por posição

## Pedido original

> Separar explicitamente experiência pessoal observada do jogador com um
> campeão em uma posição de elegibilidade global do campeão. Agregar apenas
> observações Match-V5 reais, manter elegibilidade global indisponível sem
> fonte aprovada e expor os dois conceitos separadamente na API e em um
> consumidor visual mínimo, sem alterar pool, scores ou recomendações.

## Notas de implementação

- Contratos separados no core: `PlayerChampionRoleEvidence` agrega somente
  `MatchObservation`; `GlobalChampionRoleEligibility` fica `UNAVAILABLE`,
  `eligible: null`, sem proveniência inventada.
- Rota `GET /players/:puuid/champions/:championId/role-evidence`, com filtros
  explícitos de papel, patch, fila, intervalo, modo e tipo de jogo.
- `ChampionTag.roles` e o campo persistido de catálogo foram esvaziados; o
  adaptador legado marca semântica `UNKNOWN`. `observedRoles` explicita o
  significado pessoal do alias `preferredRoles`.
- Card factual único no detalhe de pós-jogo. Nenhum pool, peso, limiar,
  score ou quantidade de recomendação foi alterado.
- Testes novos no core, repositório, rota e renderer cobrem Vel'Koz suporte,
  Smite, amostra zero, posição ausente, filtros, filas, legado, API distinta,
  UI e invariância do motor.
- Banco real: 173 `ChampionTag`, zero `Champion.roles` preenchido. A rota real
  encontrou 8 partidas observadas de Vel'Koz/SUPPORT nas filas 420 e 440;
  Vel'Koz/MID retornou amostra zero, sem fallback.
