# Prontidão da infraestrutura pública da API — Etapa 31B

Data da auditoria: 2026-08-05 (America/Sao_Paulo)
Escopo: planejamento e preparação local; **nenhum recurso externo foi criado**.

## Parecer

```text
READY_FOR_INFRASTRUCTURE_APPROVAL
BLOCKED_BY_RIOT_APPROVAL
BLOCKED_BY_OWNER_DECISIONS
```

O desenho é executável e a configuração local foi preparada, mas isso não autoriza a Etapa 31C.
A API pública não pode oferecer os fluxos essenciais com a Development Key atual. Também faltam
decisões financeiras/administrativas do proprietário e uma decisão de produto sobre prova de
propriedade da conta Riot e autorização das consultas pessoais.

O desktop permanece `WITHDRAWN_PENDING_PUBLIC_API`. Nenhuma imagem foi publicada, nenhum registry,
domínio, banco, Redis ou ambiente foi criado. `release-etapa27c-v1` continua `ACTIVE`, com
`artifactHash=8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90` e
`configHash=fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38`; o replay continua
`EXACT_REPLAY`.

## 1. Requisitos reais medidos

Medição local do Compose atual, em repouso: API 120,8 MiB, Postgres 44,7 MiB, Redis 8,9 MiB e
analyzer 35,5 MiB. O banco usado na validação ocupa 18,7 MB, com 3 usuários, 22 partidas, 220
participantes, 31 snapshots e 29 bundles. A imagem da API tem 513 MB. Esses números são uma linha
de base, não previsão de produção.

| Item                       | Estado                                          | Necessidade para iniciar                                              | Plano inicial                                                                        |
| -------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| API Node/Fastify           | obrigatório                                     | 0,5 vCPU/512 MiB mínimos; reservar 1 vCPU/1 GiB para picos            | 1 réplica, container sem privilégio, porta interna 3333                              |
| Postgres 16                | obrigatório                                     | persistência, TLS, conexão privada, 5 conexões iniciais por instância | 1–2 GiB de RAM, 20 GiB expansível, backup diário                                     |
| Redis                      | futuro                                          | nenhuma chamada da API o utiliza hoje                                 | não tornar requisito de boot; provisionar só ao adotar rate limit/cache distribuído  |
| Analyzer Python            | futuro                                          | não é chamado pela API                                                | fora do deploy inicial                                                               |
| Disco persistente          | obrigatório no VPS; gerenciado nas opções cloud | banco, WAL e backups                                                  | nunca gravar estado permanente no filesystem da API                                  |
| Porta pública              | obrigatório                                     | somente 443                                                           | 3333 apenas em rede privada; 80 só para redirecionamento/ACME quando aplicável       |
| Liveness                   | obrigatório                                     | `GET /health`, sem dependências                                       | reiniciar apenas por falha do processo                                               |
| Readiness                  | obrigatório                                     | `GET /ready`, testa Postgres e retorna 503 sem detalhe                | retirar instância do tráfego quando o banco falhar; Redis aparece como `not_used`    |
| Migrations                 | obrigatório                                     | 21 migrations Prisma existentes                                       | job único `prisma migrate deploy` antes de promover a imagem                         |
| Secrets                    | obrigatório                                     | banco, token HMAC e futura Production Key Riot                        | cofre do provedor; nunca imagem, log ou `.env` versionado                            |
| HTTPS/domínio              | obrigatório                                     | certificado válido e URL estável                                      | terminação no edge gerenciado; HSTS somente no endpoint HTTPS                        |
| Logs/métricas/alertas      | recomendado                                     | logs estruturados já sanitizados                                      | retenção 30 dias em staging e 90 dias em produção, sujeita à decisão do proprietário |
| Backup testado             | obrigatório antes de produção                   | snapshot/backup não basta sem restauração                             | diário, cópia antes de deploy e restore trimestral                                   |
| Multi-AZ, WAF, 2+ réplicas | futuro                                          | escala atual não justifica de início                                  | ativar por SLO/tráfego, não por antecipação                                          |

Volume inicial de planejamento: até 100 contas controladas, 50 partidas por conta e menos de 10
requisições/s no pico. Antes de ultrapassar 100 contas ou 50 req/s, repetir carga, conexões, custo e
limites Riot. A API usa rate limit em memória por processo; escalar horizontalmente exige store
distribuído ou gateway com limite central.

## 2. Dependência da Riot

Estado objetivo: **`PUBLIC_API_BLOCKED_BY_RIOT_APPROVAL`**.

A documentação oficial diz que Development Keys expiram a cada 24 horas e servem a protótipos não
públicos; Personal Keys também não autorizam produto público. Produto público requer Production
Key. A chave não pode ficar no binário distribuído, o produto deve usar HTTPS, e Riot Sign On (RSO)
só está disponível a produtos com Production Level API Key.

| Fluxo                       | Riot Web API em tempo de uso? | Situação pública                                                                        |
| --------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| Conta Sparta (email/senha)  | não                           | funciona, mas não entrega os dados essenciais sozinho                                   |
| Vincular/buscar Riot ID     | Account-V1                    | bloqueado; o vínculo público seguro também precisa de prova de propriedade/RSO          |
| Sincronizar partidas        | Account-V1 + Match-V5         | bloqueado sem Production Key                                                            |
| Detalhe e timeline Match-V5 | sim                           | bloqueado sem Production Key                                                            |
| Data Dragon                 | não exige Production Key      | permitido para catálogo/assets estáticos                                                |
| Champion Select             | LCU local no desktop          | leitura local não usa chave; recomendações frescas dependem do histórico sincronizado   |
| Histórico/recomendações     | não em cada leitura           | dados já persistidos funcionam; onboarding e atualização dependem da sincronização Riot |
| Replay                      | não                           | bundle congelado funciona sem chamada Riot                                              |
| Dados globais               | fonte/contrato inexistentes   | indisponível; Production Key não cria esse produto automaticamente                      |

Bloqueio de segurança separado: `POST /players/link-riot-account` resolve um Riot ID e associa o
PUUID ao usuário autenticado sem provar que ele controla a conta. Além disso, existem consultas de
perfil/histórico por nome ou PUUID sem autorização uniforme. CORS não é controle de acesso. Antes de
staging público, o proprietário precisa escolher RSO como vínculo oficial e autorizar a alteração
coordenada da API e do desktop; até lá o staging deve ser privado e usar conta controlada.

Fontes oficiais consultadas em 2026-08-05:

- [Riot Developer Portal — chaves, produtos e rate limits](https://developer.riotgames.com/docs/portal)
- [Riot League of Legends — RSO, HTTPS, chave no servidor e Data Dragon](https://developer.riotgames.com/docs/lol)
- [Riot General Policies](https://developer.riotgames.com/policies/general)
- [Riot Developer Terms](https://developer.riotgames.com/terms)

## 3. Arquiteturas comparadas

Valores em USD/mês, aproximações para carga pequena, consulta em 2026-08-05. Excluem imposto,
domínio, suporte, câmbio e tráfego extraordinário. O valor final deve ser congelado numa calculadora
oficial antes da aprovação; nenhum free tier é premissa operacional.

### Recomendada — melhor equilíbrio: Google Cloud gerenciado em São Paulo

Cloud Run (1 réplica máxima inicial, 1 vCPU/1 GiB), Artifact Registry regional, Cloud SQL for
PostgreSQL Enterprise pequeno com IP privado e backups, Secret Manager, Cloud Storage para export
independente, Cloud Logging/Monitoring e HTTPS gerenciado. Memorystore Redis de 1 GiB entra apenas
quando houver consumidor real; até lá `REDIS_URL` não define disponibilidade da API.

- Estimativa: **US$ 50–120 sem Redis; US$ 90–180 com Redis**.
- Complexidade: média; banco, TLS, logs e revisões de serviço são gerenciados.
- Limites: cold start se mínimo zero; conexões do Cloud SQL; custo regional; Redis tem piso de 1 GiB.
- Backup: automático do Cloud SQL + export periódico para bucket com retenção.
- Rollback: promover revisão anterior do Cloud Run pelo digest; banco não “volta” junto.
- Região: `southamerica-east1` (São Paulo), co-localizando runtime, registry e banco.
- Lock-in: médio, principalmente IAM, Cloud Run, Secret Manager e observabilidade; imagem e Postgres
  continuam portáveis.

### Menor custo: VPS Lightsail único em São Paulo

Instância Linux 4 GiB/2 vCPU, Docker Compose, reverse proxy Caddy, API, Postgres e Redis em rede
privada/volumes, ECR privado como registry futuro, snapshots e backup criptografado em object
storage. Redis pode ficar desativado até ser usado.

- Estimativa: **US$ 30–45**; o bundle Linux 4 GiB/2 vCPU/80 GB custa US$ 24/mês, antes de snapshots,
  registry e armazenamento de backup.
- Complexidade: média/alta operacional; patching, firewall, banco, certificado e restore são do dono.
- Limites: host e disco únicos; deploy e banco competem por CPU/IO; manutenção causa indisponibilidade.
- Backup: `pg_dump` diário + snapshot do disco; cópia fora do host; restore mensal no staging.
- Rollback: digest anterior no Compose, sem rebuild; migration incompatível exige restore/roll-forward.
- Região: AWS `sa-east-1`/São Paulo, confirmada antes da contratação.
- Lock-in: baixo para compute, médio para snapshot/rede; maior risco de pessoa-chave.

### Maior controle: AWS ECS/Fargate gerenciado em São Paulo

ECS/Fargate, ECR, ALB/ACM, RDS PostgreSQL, ElastiCache/Valkey, Secrets Manager, CloudWatch e S3. Uma
tarefa de API inicialmente; subnets privadas para dados, apenas ALB público.

- Estimativa: **US$ 90–220** com banco, balanceador e cache pequenos sempre ligados.
- Complexidade: alta para a escala atual; mais IAM, VPC, security groups e componentes faturáveis.
- Limites: custo fixo de ALB/RDS; operação e preço de `sa-east-1`; mais pontos de configuração.
- Backup: RDS automático/PITR + export/snapshot antes de migration; S3 com lifecycle.
- Rollback: task definition anterior fixada ao digest; deploy circuit breaker.
- Região: `sa-east-1` (São Paulo).
- Lock-in: médio/alto nos controles AWS; container e PostgreSQL permanecem migráveis.

Referências oficiais de preço: [Lightsail bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html),
[Lightsail pricing](https://aws.amazon.com/lightsail/pricing/), [ECR](https://aws.amazon.com/ecr/pricing/),
[Fargate](https://aws.amazon.com/fargate/pricing/), [Cloud Run](https://cloud.google.com/run/pricing),
[Cloud SQL](https://cloud.google.com/sql/pricing/), [Memorystore](https://cloud.google.com/memorystore/docs/redis/pricing),
[Artifact Registry](https://cloud.google.com/artifact-registry/pricing) e
[Secret Manager](https://cloud.google.com/secret-manager/pricing).

## 4. Configuração de produção preparada

`.env.production.example` é somente um contrato sem valores reais. A validação agora exige em
produção: segredo HMAC único com pelo menos 32 caracteres, URL pública HTTPS, PostgreSQL, allowlist
CORS explícita, documentação desligada e uma chave Riot definida. A infraestrutura ainda precisa
confirmar que ela é uma Production Key aprovada; a aplicação não tenta inferir o tipo pelo formato.
Também ficaram configuráveis proxy confiável por número de saltos, TTL do bearer token, limites,
timeouts, log level e shutdown forçado.

`Origin: null` é necessário ao renderer `file:` do Electron, mas não autentica ninguém. Tokens
continuam bearer HMAC, hoje sem refresh, revogação ou rotação por versão; reduzir o TTL não resolve
revogação. Antes da exposição pública devem ser decididos RSO, sessões revogáveis e autorização de
todas as rotas pessoais. Cookies não são usados. `/docs` é opt-in somente em desenvolvimento.

`/health` permanece liveness e `/ready` consulta `SELECT 1` com timeout. Redis é reportado
`not_used` para não transformar uma variável não consumida em falsa dependência. Shutdown aceita
SIGTERM/SIGINT, para novas conexões, espera requisições e força saída depois do grace period.

## 5. Banco, migrations e dados irremovíveis

- Criar banco vazio e usuário de aplicação sem privilégios de administração; usuário separado para
  migrations. Exigir TLS e rede privada.
- Executar `prisma migrate deploy` uma única vez, em job exclusivo, antes de promover tráfego. Nunca
  executar `migrate dev` fora do local.
- Antes de cada deploy com schema: backup identificado por commit, digest e migration alvo; testar a
  leitura do backup antes de prosseguir.
- Backup diário com retenção proposta de 7 diários, 4 semanais e 6 mensais; PITR de 7 dias quando o
  provedor suportar. A política final depende do proprietário.
- Restore trimestral em staging isolado, medindo RPO/RTO e validando contagens, FK, release ativa e
  replay. Backup nunca é “validado” só porque o job terminou.
- Migration aditiva primeiro; código compatível com schema antigo e novo; remoção só em deploy
  posterior. Em incompatibilidade, interromper tráfego/escrita e preferir roll-forward. Restaurar
  banco apenas com decisão explícita porque apaga escritas posteriores.
- Nunca apagar silenciosamente usuários, contas Riot, partidas/raw source, timelines, snapshots,
  bundles, revisões pós-game, experimentos, artefatos/eventos/pointer da release ativa ou trilhas de
  importação de patch. Pedidos legais de exclusão exigem fluxo próprio auditável, ainda inexistente.

RPO proposto: 24 h no piloto, 15 min ao habilitar PITR. RTO proposto: 4 h no piloto. Ambos precisam
de aceite do proprietário e prova de restore.

## 6. Imagem e promoção

- Nome lógico: `sparta/api`.
- Registry: decisão pendente; deve ser privado e co-localizado ao runtime.
- Tags imutáveis: `0.9.0-api.<commit-curto>` e `sha-<commit>`; promoção por digest
  `sha256:<digest>`. `staging`/`production` podem ser ponteiros, nunca fonte de verdade.
- Tag de rollback: registro documental `rollback/<deployment-id>` apontando ao digest anterior, sem
  mover tags imutáveis.
- Build no CI a partir do commit aprovado, SBOM, scan de vulnerabilidade, assinatura/attestation se
  escolhida e teste de boot/readiness. A imagem atual já roda como usuário `node`.
- Retenção: últimos 10 digests promovidos e todos os associados a incidente/release; mínimo 180 dias.
- Promoção: o mesmo digest validado em staging segue para produção. Não reconstruir por ambiente.
- Rollback: reimplantar digest anterior; nunca depender somente de `latest`; migration destrutiva
  impede rollback automático e aciona runbook de banco.

## 7. Ambientes

| Local                                    | Staging                                                                 | Produção                                           |
| ---------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| Compose e credenciais de desenvolvimento | projeto/conta isolada, acesso privado, fixtures e conta Riot controlada | conta/projeto separado, acesso mínimo, dados reais |
| `/docs` habilitável                      | `/docs` desligado                                                       | `/docs` desligado                                  |
| banco descartável                        | banco pequeno restaurável, jamais cópia crua de produção                | backup/PITR e retenção aprovados                   |
| Development Key apenas local             | Production Key só depois de aprovação e secret isolado                  | Production Key de produção, rotação controlada     |

Gate de staging: migrations, register/login, RSO/vínculo, sync Match-V5/timeline, recomendação,
snapshot, bundle v2, `EXACT_REPLAY`, `release-etapa27c-v1` ativa, falhas Riot sanitizadas, readiness,
backup/restore e rollback do digest. Não usar PUUID ou partidas de terceiros quando fixtures/conta
controlada bastarem.

## 8. Observabilidade mínima

| Sinal                | Alerta inicial                                                         |
| -------------------- | ---------------------------------------------------------------------- |
| `/health` e `/ready` | 2 falhas consecutivas / readiness > 2 min                              |
| Latência HTTP        | p95 > 1 s por 10 min; separar rotas Riot                               |
| Erros HTTP           | 5xx > 2%/5 min; 401/403 não contam como indisponibilidade              |
| Postgres             | conexão falha; pool > 80%; disco > 75%; backup atrasado > 26 h         |
| Redis futuro         | erro/conexões/memória somente quando virar dependência real            |
| Riot                 | 401/403 imediato; 429 e 5xx por rota/região sem logar chave/PUUID      |
| Configuração         | qualquer fallback inesperado, hash divergente ou release ativa ausente |
| Replay/bundle        | `REPLAY_INTEGRITY_FAILED`, bundle inválido ou divergência > 0          |
| Migration            | job falhou ou duas execuções concorrentes                              |
| Capacidade           | CPU > 80%, memória > 80%, DB connections > 80% por 15 min              |

Logs JSON com request ID, código e duração; nunca Authorization, cookie, chave Riot, senha, URL de
banco, payload bruto ou PUUID. Retenção proposta: 30 dias staging/90 produção. Não foi adicionada
telemetria ao desktop nem rastreamento de usuário.

## 9. Checklists

### Provisionamento (somente após autorização)

- [ ] Provedor, região, teto mensal e centro de custo aprovados.
- [ ] Domínio e conta cloud sob controle do proprietário, MFA e dois administradores.
- [ ] Staging e produção isolados; registry privado criado na mesma região.
- [ ] Rede privada, HTTPS, DNS, firewall e proxy hops validados.
- [ ] Postgres, backup/PITR, cofre de secrets e observabilidade criados.
- [ ] Redis criado somente se houver consumidor e orçamento explícito.
- [ ] Production Key/RSO Riot aprovados e armazenados no cofre.

### Segurança antes de staging público

- [ ] RSO/prova de propriedade substitui vínculo por Riot ID sem prova.
- [ ] Toda rota pessoal exige autenticação e confirma ownership da RiotAccount.
- [ ] Sessão revogável/rotação de token decidida e implementada.
- [ ] CORS sem `*`; `null` aceito conscientemente para o Electron.
- [ ] TLS banco/edge, IAM mínimo, MFA, logs sanitizados e secret scan aprovados.
- [ ] Imagem por digest, SBOM e scan sem vulnerabilidade crítica não aceita.
- [ ] Processo de exclusão/privacidade e contato de incidente definidos.

### Deploy

- [ ] Commit e digest aprovados; CI, testes, SBOM e scan verdes.
- [ ] Backup pré-deploy identificável e restaurável.
- [ ] Migration compatível revisada e aplicada por job único.
- [ ] Mesmo digest passa smoke completo em staging.
- [ ] Produção recebe digest, secrets e configuração aprovados.
- [ ] `/health`, `/ready`, login, sync controlado e replay verificados.
- [ ] Digest anterior e instrução de rollback registrados.

## 10. Decisões e perguntas do proprietário

1. Qual teto mensal em USD/BRL, incluindo impostos e 30% de margem?
2. Qual opção/provedor e região serão autorizados: GCP São Paulo (recomendada), Lightsail ou AWS
   gerenciado?
3. Qual conta cloud, responsáveis financeiros e dois administradores terão acesso?
4. Qual domínio/subdomínio será comprado/controlado e por quem?
5. Qual registry privado será autorizado e qual retenção de imagens?
6. A Riot já aprovou Production Key e RSO para este produto? Quem é o contato responsável?
7. O proprietário autoriza uma etapa de produto/segurança para RSO, ownership das rotas e sessões
   revogáveis antes de tornar staging público?
8. Aprova retenção 7 diários/4 semanais/6 mensais, PITR 7 dias, RPO 24 h (depois 15 min), RTO 4 h e
   teste trimestral de restore?
9. Quem pode fazer deploy, ler secrets, restaurar banco e declarar incidente?

Sem respostas a 1–9, sem Production Key/RSO e sem fechar os bloqueios de autorização, a próxima
etapa pode no máximo preparar um staging **privado** depois de nova autorização explícita. Esta
etapa para antes de qualquer gasto ou provisionamento.
