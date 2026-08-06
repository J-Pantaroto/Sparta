# Exclusão de conta e dados — processo preliminar

Status: desenho operacional; ainda não é endpoint/serviço público.

1. Receber pedido em `[CANAL A DEFINIR]` e gerar protocolo sem expor PUUID.
2. Verificar a identidade Sparta e, quando necessário, exigir nova autenticação RSO; nunca aceitar
   somente Riot ID/PUUID como prova.
3. Revogar sessões e marcar o vínculo `REVOKED` imediatamente.
4. Identificar dados próprios: User, RiotAccount, perfil/pool, participantes vinculados, drafts,
   snapshots/bundles, comparações, relatórios, revisões, laboratório e logs relacionados.
5. Aplicar a decisão jurídica de apagar ou anonimizar cada categoria, preservando somente o que
   tiver obrigação demonstrável de retenção.
6. Propagar a backups/subprocessadores conforme prazo definido e cumprir listas/identificadores de
   exclusão fornecidos pela Riot.
7. Registrar evidência mínima da conclusão sem manter o PUUID/dados apagados.
8. Confirmar ao solicitante pelo canal verificado.

Pendências do titular: SLA, prazos de backup/log, categorias com retenção legal, canal, operador,
procedimento de recurso e implementação idempotente. A migration 31C não apaga nada e revogação
não deve ser apresentada como exclusão completa.
