---
status: IMPLEMENTADA
solicitado_em: 2026-07-27 20:55
implementado_em: 2026-07-27 21:15
---

# Observações reais de build, runas, feitiços e posições

## Pedido original

> Extrair e normalizar, a partir dos `rawJson` Match-V5 já persistidos, itens finais, runas,
> fragmentos, feitiços, posições observadas e o contexto da partida. Preservar IDs, ordem,
> ausência, divergências, patch e proveniência; criar persistência reutilizável, backfill local
> idempotente e um consumidor factual mínimo, sem novas integrações ou recomendações.

## Notas de implementação

- Contrato `MatchLoadoutObservation` e extrator puro
  `match-observation/1.0.0`, sem I/O e sem números artificiais.
- Persistência relacional para slots finais de item, perks, fragmentos,
  feitiços e posição observada; `rawJson` preservado.
- Política medida no banco: `teamPosition`, depois `individualPosition`.
  Matchmaking permanece separado e divergências são registradas.
- Backfill usa somente dados locais, não imprime identificadores e reprocessa
  apenas quando a versão muda.
- Rota autenticada reutilizável e card factual mínimo no pós-game.
- Catálogo local auditado: não havia itens/runas/feitiços; IDs foram
  preservados e enriquecimento ficou explicitamente indisponível.
- Validação real: 22 partidas, 220 observações, 1.540 slots de item, 1.320
  perks, 660 fragmentos e 440 feitiços; segunda execução com zero updates.
- Testes novos no mapper Riot, persistência/backfill/API; suíte integral,
  typecheck, lint, builds e API real validados.
- Corrigida a migration anterior de cache (`DATETIME` não existe no
  PostgreSQL) para permitir o deploy da cadeia.
