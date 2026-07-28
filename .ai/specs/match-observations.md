# Observações de partida

Fonte de verdade: `docs/match-observations.md`.

- Extrator: `match-observation/1.0.0`.
- Observação pessoal por partida; nunca elegibilidade global do campeão.
- Posição normalizada: `teamPosition`, depois `individualPosition`; matchmaking
  é preservado separadamente e divergências permanecem auditáveis.
- Sete slots finais de item, runas/fragmentos e dois slots de feitiço usam
  entidades relacionais e estados explícitos de ausência.
- IDs são primários; nomes/assets só existem quando catálogo local resolve.
- Backfill local, versionado e idempotente; nenhuma chamada externa.
- API autenticada: `GET /matches/:matchId/observation`.
- Consumidor mínimo: card factual no pós-game.

Detalhes, modelo e limitações estão no documento fonte.
