# Runbooks da API pública — planejamento da Etapa 31B

Estes procedimentos são executáveis somente depois de a infraestrutura ser aprovada e criada na
Etapa 31C. Os nomes `<...>` são parâmetros obrigatórios, não valores para copiar. Em todo incidente,
preservar timestamp, ator, commit, digest, migration, release ativa e request IDs; nunca registrar
secret, token, senha, URL de banco ou PUUID.

## 1. Primeiro deploy

1. Confirmar `BLOCKED_BY_RIOT_APPROVAL` resolvido, decisões do proprietário registradas e staging
   privado aprovado.
2. Verificar IAM mínimo, MFA, TLS, rede privada, secrets, backup, alertas e registry.
3. Construir no CI; registrar commit, SBOM, scan e digest imutável.
4. Criar banco vazio, executar backup inicial e aplicar `prisma migrate deploy` por job único.
5. Implantar o digest no staging; exigir `/health=200` e `/ready=200`.
6. Rodar o gate completo: auth/RSO, sync controlado, recomendação, snapshot, bundle v2, replay
   `EXACT_REPLAY`, release ativa e rollback ensaiado.
7. Só com aprovação humana promover **o mesmo digest** à produção e repetir smoke sanitizado.
8. Registrar baseline de latência/erros/conexões e o digest anterior (se houver).

Abortar por migration falha, readiness > 5 min, vulnerabilidade crítica não aceita, secret ausente,
replay divergente, release ativa/hash inesperado ou Riot 401/403.

## 2. Deploy normal

1. Confirmar janela, CI, digest, changelog e compatibilidade da migration.
2. Criar/confirmar backup pré-deploy e digest anterior.
3. Promover o mesmo digest já aprovado em staging; migration em job único antes do tráfego.
4. Acompanhar readiness, p95, 5xx, Postgres, Riot e replay por 30 minutos.
5. Encerrar apenas depois do smoke e registrar resultado. Se degradar, executar rollback da API.

## 3. Migration

1. Revisar como aditiva/compatível; estimar lock e espaço. Destrutiva requer plano próprio e janela.
2. Bloquear concorrência de jobs e confirmar backup restaurável.
3. Rodar `prisma migrate deploy` com usuário de migration, timeout e log sanitizado.
4. Conferir `_prisma_migrations`, schema esperado, readiness e consultas críticas.
5. Em falha antes de escrita, corrigir e repetir. Em aplicação parcial, parar deploy e decidir
   roll-forward com evidência; não editar tabela de migrations manualmente.
6. Restore só por decisão de incidente, aceitando a perda de escritas após o backup.

## 4. Rollback da API

1. Retirar a nova revisão do tráfego e fixar o digest anterior conhecido — nunca rebuildar a tag.
2. Se o schema for retrocompatível, reimplantar e verificar health/readiness/smoke.
3. Se não for, manter escrita suspensa e executar o runbook de migration/restore; não “desmigrar” no
   improviso.
4. Preservar logs, digests e métricas; registrar causa e dados potencialmente afetados.

## 5. Rollback da release do motor

1. Não confundir imagem da API com `RecommendationEngineRelease`.
2. Autenticar operador autorizado, conferir release ativa, hashes e alvo `previousReleaseId`.
3. Usar o endpoint/serviço operacional existente de rollback; nunca editar o ponteiro no banco.
4. Confirmar evento append-only, ponteiro, hashes e replay `EXACT_REPLAY`.
5. Rollback do motor não autoriza ajustar pesos, reprocessar histórico nem substituir artefato.

## 6. Banco indisponível

1. `/health` pode continuar 200; confirmar `/ready=503`, alarmes, conexões, disco e status do provedor.
2. Retirar instâncias não-ready; pausar sync, deploy e migrations para impedir avalanche.
3. Não reiniciar banco repetidamente. Corrigir rede/credencial/capacidade ou acionar provedor.
4. Se houver perda/corrupção, declarar incidente e usar restauração; caso contrário aguardar retorno.
5. Após retorno: readiness, migrations, contagens críticas, release ativa e replay; monitorar backlog.

## 7. Redis indisponível

Hoje Redis é `not_used`: sua indisponibilidade não deve retirar a API do ar. Confirmar que nenhuma
versão implantada passou a consumi-lo. Quando virar cache/rate-limit distribuído, documentar modo de
falha antes da ativação: rate limiting deve falhar fechado nas rotas de credencial; cache pode falhar
aberto apenas para leitura recalculável, nunca para release ativa, sessão ou idempotência. Restaurar
conexão, medir evictions/memória e não tratar cache recuperado como fonte de verdade.

## 8. Chave Riot expirada, bloqueada ou limitada

1. Classificar 401/403 (credencial/aprovação), 429 (rate limit) ou 5xx/timeout; nunca logar chave.
2. Em 401/403, retirar onboarding/sync do tráfego por controle operacional, mantendo leituras já
   persistidas com estado explícito; não usar Development Key como substituta pública.
3. Em 429, respeitar `Retry-After`, reduzir concorrência e aguardar janela; não rotacionar chaves para
   contornar limite.
4. Contatar o responsável Riot, atualizar somente o secret no cofre e reiniciar revisão controlada.
5. Validar Account-V1 e Match-V5 com conta controlada antes de reabrir fluxos.

## 9. Restauração de backup

1. Declarar RPO/RTO, backup alvo e escritas que serão perdidas; obter autorização explícita.
2. Preservar banco afetado somente leitura. Restaurar primeiro em instância nova e isolada.
3. Validar checksum, migrations, contagens/FKs, usuários/contas, partidas, snapshots/bundles,
   relatórios, release ativa/eventos e replay.
4. Trocar conexão por operação controlada, manter banco anterior preservado e executar smoke.
5. Registrar duração, perda real e ações; destruir a cópia antiga só conforme retenção aprovada.

## 10. Incidente com secret

1. Revogar/rotacionar imediatamente o secret afetado no sistema de origem; não basta editar variável.
2. Se for chave Riot, avisar Riot e seguir o runbook 8. Se banco, rotacionar usuário/senha e encerrar
   sessões. Se token HMAC, todos os tokens existentes devem ser considerados comprometidos.
3. Auditar acesso, logs e artefatos sem reproduzir o valor. Verificar Git, CI, registry e release.
4. Implantar nova versão do secret por revisão controlada e validar readiness/smoke.
5. Documentar janela, alcance, usuários/dados afetados e notificações aplicáveis.

## Evidência mínima ao encerrar qualquer runbook

- ID do incidente/deploy, início/fim, responsável e aprovador;
- commit, digest antes/depois e migrations;
- status de `/health` e `/ready`, smoke e métricas;
- estado/id/hashes da release operacional e replay;
- backup usado/testado, RPO/RTO real e ações pendentes.
