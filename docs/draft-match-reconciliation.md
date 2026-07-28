# Reconciliação DraftSession → Match-V5

Contrato: `draft-match-link/1.0.0`.

## Ordem de decisão

1. Sessão `USER` ou `ABANDONED`: `NOT_APPLICABLE`.
2. Vínculo já confirmado por `EXACT_GAME_ID`: preservado.
3. `externalGameId` observado no LCU e presente na mesma plataforma no Match-V5:
   `LINKED / EXACT_GAME_ID`.
4. Sem ID exato: somente o conjunto forte documentado em
   `docs/draft-persistence.md`; exatamente um candidato pode vincular.
5. Dois ou mais candidatos: `AMBIGUOUS`. Evidência mínima ausente:
   `UNLINKABLE`. Partida ainda não sincronizada: `PENDING`.

O reconciliador não usa placar, vitória/derrota ou proximidade como desempate. Bans não são usados
porque a fonte Match-V5 persistida não os fornece.

## Concorrência e auditoria

Cada sessão é processada em transação `SERIALIZABLE`, com repetição limitada para conflitos. O
banco aplica unicidade `(riotAccountId, linkedMatchId)`. Um vínculo exato nunca é removido por
heurística; se um gameId exato colidir com vínculo heurístico anterior, a revisão heurística é
deslocada para `AMBIGUOUS` e a mudança fica no histórico imutável.

Reprocessar sem mudança não cria revisão. Cada mudança material grava status, estratégia, matchId,
gameId externo, evidências, quantidade de candidatos, versão, motivo e `decidedAt`.

## Operação

O sync de partidas chama o reconciliador como efeito colateral best-effort; falha não invalida nem
reverte partidas já importadas. `POST /drafts/sessions/reconcile` permite backfill autenticado da
conta e retorna totais por estado, sem criar sessões e sem aceitar IDs de partida.
