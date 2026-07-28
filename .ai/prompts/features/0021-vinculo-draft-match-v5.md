---
status: EM_ANDAMENTO
solicitado_em: 2026-07-28 17:22
implementado_em:
---

# Vincular drafts persistidos às partidas Match-V5

## Pedido original

> Execute somente a Etapa 21: implemente reconciliação determinística e
> auditável entre `DraftSession` real e a partida Match-V5 correspondente.
> Priorize `gameId` oficial compartilhado; sem ele, permita somente conjunto
> forte e único de evidências estruturadas. Preserve estados `PENDING`,
> `LINKED`, `AMBIGUOUS`, `UNLINKABLE` e `NOT_APPLICABLE`, estratégia, versão,
> instante, evidências, candidatos e motivo.
>
> Não vincule por campeão, posição, horário aproximado, fila, resultado,
> duração ou ordem cronológica isolados. Duas candidatas permanecem
> `AMBIGUOUS`; ausência de partida sincronizada permanece `PENDING`; dodge
> permanece encerrado sem partida. Garanta idempotência, transação,
> concorrência, unicidade e precedência permanente do vínculo por gameId.
>
> Capture o identificador disponível no LCU somente por leitura, sem payload
> bruto ou credenciais. Reprocesse por operação interna/protegida e backfill
> apenas sessões reais já persistidas. Exponha o estado no histórico de drafts
> e permita abrir o pós-game vinculado, sem aceitar `matchId` arbitrário do
> desktop, reescrever snapshots ou avaliar acerto/causalidade da recomendação.

## Notas de implementação

- Contrato `draft-match-link/1.0.0`, estados explícitos, evidências e revisões imutáveis.
- `gameId` observado via LCU read-only; `matchId` é preenchido somente pelo reconciliador.
- Estratégia secundária exige conjunto forte e candidato único; não há score nem desempate.
- Backfill protegido percorre apenas sessões existentes e o sync trata reconciliação como best-effort.
- Migração preserva vínculos legados não confiáveis em `legacyLinkedMatchId`.
