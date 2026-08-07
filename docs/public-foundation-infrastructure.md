# Fundação pública do Sparta GG — infraestrutura, DNS e site institucional (Etapa 31K)

Este documento descreve o que a Etapa 31K **preparou** (código, configuração, conteúdo) e o que
continua **bloqueado por decisão/aquisição do responsável pelo projeto**. Nenhum domínio foi
registrado, nenhum VPS foi provisionado e nenhuma credencial de e-mail existe até o momento desta
etapa — ver §1 (FASE 0) para como essa conclusão foi alcançada e §9 para o checklist exato de
aquisição.

Marca: **Sparta GG**. Domínio pretendido: **spartagg.com.br**. Contato pretendido:
**suporte@spartagg.com.br**. Infra pretendida: **VPS Hostinger**. Nenhum desses três recursos foi
efetivamente contratado nesta etapa — são decisões já tomadas pelo responsável, registradas aqui
para orientar a preparação, não fatos de infraestrutura já existente.

## 1. FASE 0 — confirmação de que nada foi provisionado

Antes de tocar em qualquer configuração de infraestrutura, esta etapa verificou — **exclusivamente
por configuração/documentação já presente no repositório**, nunca tentando descobrir credenciais —
se domínio, VPS, acesso SSH ou e-mail já existiam:

- Busca no repositório inteiro (`git grep`, case-insensitive) por `spartagg`, `hostinger`,
  `registro.br`, `suporte@spartagg` e variações: **nenhuma ocorrência** fora desta própria etapa.
- `~/.ssh/config` do ambiente de trabalho: **ausente**.
- Todo o histórico de etapas anteriores registradas em `.claude/CLAUDE.md` (Etapas 30–31J) confirma
  que nenhuma infraestrutura pública jamais foi provisionada — o desktop 0.9.0 foi retirado de
  circulação justamente por depender de uma API pública que nunca existiu (`docs/post-release-0.9.0.md`,
  `docs/release-withdrawal-0.9.0.md`).

Em nenhum momento desta etapa foi solicitada, adivinhada ou testada qualquer senha, chave privada,
token de API de provedor de nuvem/DNS/e-mail. Conclusão: **nenhum dos três recursos (domínio, VPS,
e-mail) existe hoje.** Isso não impede preparar código e documentação — impede apenas publicar de
verdade, que é o estado final desta etapa (ver §10).

## 2. O que foi construído nesta etapa

| Item | Caminho | Estado |
| --- | --- | --- |
| Site institucional (9 páginas, Vite multi-page) | `apps/site/` | Buildado e testado localmente; **não publicado** |
| Dockerfile do site (build + Caddy) | `Dockerfile.site` | Buildado e smoke-testado localmente com Docker real; **não publicado em registry nenhum** |
| Configuração do reverse proxy | `infra/Caddyfile` | Validada com `caddy validate` e testada localmente (headers, gzip, 404 customizado); **não aplicada contra domínio real** |
| Compose de produção do site | `infra/docker-compose.yml` | Escrito, não executado em produção |

Todo o site foi construído e verificado com o dev server real (Vite) e com o Caddyfile de produção
real rodando dentro de um container Docker real nesta máquina — não é código nunca executado. O que
não foi feito, porque os recursos externos não existem, é: registrar o domínio, apontar DNS,
provisionar o VPS, emitir certificado TLS real, ou colocar qualquer coisa no ar publicamente.

## 3. Arquitetura pretendida

```
                                   spartagg.com.br
                                          │
                                   DNS (A/AAAA)
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │   VPS (Hostinger)      │
                              │                        │
                              │  ┌──────────────────┐  │
  usuário ──── HTTPS ────────▶│  │  Caddy (infra/)   │  │
                              │  │  - TLS automático  │  │
                              │  │  - redirect apex   │  │
                              │  │  - headers/gzip    │  │
                              │  └────────┬──────────┘  │
                              │           │              │
                              │  ┌────────▼──────────┐  │
                              │  │  site estático     │  │  ◀── ATIVO nesta etapa
                              │  │  (apps/site/dist)  │  │      (quando o VPS existir)
                              │  └────────────────────┘  │
                              │                        │
                              │  ┌────────────────────┐  │
                              │  │  api.spartagg.com.br│  │  ◀── RESERVADO, DESLIGADO
                              │  │  (proxy comentado)  │  │      (bloqueado pela Etapa 31D:
                              │  └────────┬───────────┘  │       BLOCKED_BY_EMAIL_PROVIDER_
                              │           │               │       CONFIGURATION /
                              │  ┌────────▼───────────┐  │       BLOCKED_BY_RIOT_APPROVAL)
                              │  │  PostgreSQL         │  │
                              │  │  (não provisionado   │  │
                              │  │   nesta etapa)       │  │
                              │  └────────────────────┘  │
                              └───────────────────────┘

  e-mail (suporte@spartagg.com.br) ── hospedado FORA da VPS, provedor de e-mail separado
```

A API pública e o Postgres de produção **não fazem parte do `infra/docker-compose.yml` desta
etapa** — adicioná-los sem uso real seria infraestrutura fantasma, e os gates da Etapa 31D
continuam de pé. Quando a API for liberada, o Caddyfile já reserva o bloco `handle /api/*`
(comentado) e o nome de host `api.spartagg.com.br` já está no plano de DNS abaixo — só falta
descomentar e adicionar os serviços `api`/`postgres` ao compose.

## 4. Plano de DNS (registros pretendidos, não aplicados)

| Tipo | Hostname | Destino | TTL | Finalidade |
| --- | --- | --- | --- | --- |
| A | `spartagg.com.br` | IP público do VPS | 3600 | Site institucional (canônico) |
| AAAA | `spartagg.com.br` | IPv6 do VPS (se disponível) | 3600 | Site institucional, IPv6 |
| CNAME ou A | `www.spartagg.com.br` | `spartagg.com.br` / IP do VPS | 3600 | Redireciona para o domínio canônico (Caddy faz o 301) |
| A | `api.spartagg.com.br` | IP público do VPS | 3600 | Reservado para a futura API pública — **não ativar antes dos gates da 31D serem resolvidos** |
| CNAME/MX (conforme provedor) | `spartagg.com.br` | registros do provedor de e-mail escolhido | conforme provedor | `suporte@spartagg.com.br` — hospedado fora da VPS, nunca misturado com os registros do site |
| TXT (SPF) | `spartagg.com.br` | conforme provedor de e-mail | conforme provedor | Autenticação de envio de e-mail |
| TXT (DKIM) | conforme provedor | conforme provedor | conforme provedor | Autenticação de envio de e-mail |
| TXT (DMARC) | `_dmarc.spartagg.com.br` | política DMARC | conforme provedor | Política de autenticação de e-mail |

`status.spartagg.com.br` (subdomínio opcional mencionado na especificação) **não foi criado** — a
página de status vive em `/status.html` no próprio domínio principal, o que evita um subdomínio e
um certificado adicional para uma única página. Pode ser revisitado se o produto crescer.

Nenhum desses registros pode ser criado até o domínio ser registrado — ver checklist em §9.

## 5. VPS — hardening mínimo (runbook, a executar quando o VPS existir)

Este runbook não foi executado — não há VPS. Ordem recomendada na primeira configuração:

1. Distribuição Linux LTS (ex.: Ubuntu 24.04 LTS ou Debian 12) com atualização completa do sistema
   antes de qualquer serviço (`apt update && apt upgrade`).
2. Criar usuário não-root com privilégio administrativo (`sudo`), configurar autenticação SSH por
   chave pública e **só depois de confirmar que o novo acesso funciona**, desabilitar login SSH por
   senha e login SSH direto como `root`. Nunca inverter essa ordem — desabilitar acesso antes de
   confirmar o novo caminho é o erro mais comum de bloqueio acidental.
3. Firewall (`ufw` ou equivalente): permitir apenas 22 (SSH, idealmente restrito por IP/rede se
   viável), 80 e 443 (HTTP/HTTPS). Nenhuma porta de banco de dados (5432) exposta à internet.
4. Definir timezone e hostname reais do servidor (facilita correlacionar logs).
5. Instalar Docker Engine + Docker Compose plugin; usuário de deploy no grupo `docker` (não rodar
   como root por conveniência).
6. Estrutura de diretórios prevista: `/opt/sparta/site` (checkout ou artefatos de deploy),
   `/opt/sparta/site/infra` (Caddyfile e compose), volumes Docker nomeados para `caddy-data`/
   `caddy-config` (certificados) — já declarados em `infra/docker-compose.yml`.
7. `docker compose -f infra/docker-compose.yml up -d --build` inicial; confirmar
   `docker compose ps` saudável e `docker compose logs site` sem erro de emissão de certificado.
8. Logs: `docker compose logs -f site` para acompanhar emissão/renovação de TLS na primeira
   subida; Caddy renova automaticamente depois, sem cron necessário.
9. Política de restart já embutida no compose (`unless-stopped`) — o site volta sozinho depois de
   reboot ou crash do processo.

## 6. Deploy e rollback do site (runbook)

**Deploy normal** (quando o VPS existir):

1. `git pull` (ou publicar a imagem via CI/registry, se o pipeline evoluir para isso) no servidor,
   ou `docker compose -f infra/docker-compose.yml build` a partir de um checkout atualizado.
2. `docker compose -f infra/docker-compose.yml up -d --build` — o Caddy recarrega a nova imagem
   sem perder o volume de certificados (`caddy-data`/`caddy-config` são nomeados e persistem entre
   `up`s).
3. Verificar `https://spartagg.com.br/` (200), `https://spartagg.com.br/status.html` (200), e uma
   URL inexistente (404 com a página customizada, não o texto padrão do Caddy).
4. Confirmar headers de segurança presentes (`curl -I` contra o domínio real) e HTTP redirecionando
   para HTTPS.

**Rollback**: como o site é estático e sem estado (nenhum banco, nenhuma sessão), reverter é
`git checkout <commit-anterior> && docker compose -f infra/docker-compose.yml up -d --build` — sem
migration, sem dado a preservar. Se o próprio `Dockerfile.site` ou `Caddyfile` for a causa da
falha, o rollback é literalmente voltar ao commit anterior desses arquivos.

## 7. Backup

Política atual aceita explicitamente pelo responsável: **backup semanal do provedor** (Hostinger),
sem camada adicional contratada nesta etapa. Isso é suficiente para o site estático (sem estado
persistente além dos certificados TLS, que o próprio Caddy reemite sozinho se perdidos). **Risco
documentado, não escondido: dependência de backup de um único provedor** — se a conta do provedor
for comprometida ou o backup dele falhar silenciosamente, não há segunda cópia independente. Este
risco é aceitável para o site institucional (sem dado pessoal de usuário, 100% reconstruível a
partir do repositório Git); **não é** aceitável sem revisão quando o Postgres de produção existir —
antes de qualquer migração relevante do banco público, fazer um dump manual + checksum + validação
básica de restore, conforme já é prática registrada em `docs/database-migrations.md` para o
ambiente local.

## 8. Observabilidade básica

Sem stack de observabilidade pesada nesta etapa. O suficiente para o site estático:

- `docker compose ps` / `docker compose logs site` — estado do container e logs do Caddy (inclui
  emissão/renovação de TLS, erros de proxy quando a API for ligada).
- `HEALTHCHECK` embutido na imagem (`Dockerfile.site`) — `docker inspect` expõe o estado de saúde
  sem ferramenta externa.
- Espaço em disco/memória do VPS: comandos padrão do sistema operacional (`df -h`, `free -m`) —
  suficiente para um site estático de poucos megabytes.

Nada disso substitui um alerta ativo (e-mail/webhook em caso de indisponibilidade) — não incluído
nesta etapa, candidato a revisão quando a API pública também precisar de observabilidade.

## 9. Checklist de aquisição para o responsável pelo projeto

Nada abaixo foi executado por este agente — são as ações financeiras/administrativas que só o
responsável pelo projeto pode tomar. Nenhuma delas foi presumida como já feita.

- [ ] **Registrar o domínio `spartagg.com.br`** junto a um registrador (Registro.br para domínios
      `.com.br`). Confirmar que o WHOIS/contato administrativo está correto.
- [ ] **Contratar o VPS na Hostinger** (ou provedor equivalente já decidido) — plano com Linux,
      IP público (IPv4 no mínimo), acesso SSH.
- [ ] **Gerar um par de chaves SSH local** (se ainda não existir) e configurar acesso por chave ao
      VPS assim que ele existir — nunca compartilhar a chave privada com este agente ou com
      qualquer sistema além do próprio VPS.
- [ ] **Apontar o DNS do domínio** para o IP do VPS conforme a tabela da §4, usando o painel do
      registrador ou de um provedor de DNS de preferência.
- [ ] **Contratar um serviço de e-mail para `suporte@spartagg.com.br`**, hospedado fora da própria
      VPS (ex.: Google Workspace, Zoho Mail, ou o serviço de e-mail transacional que a Etapa 31D já
      previu para confirmação de cadastro — `docs/account-access-onboarding.md`). Configurar
      SPF/DKIM/DMARC conforme o provedor escolhido antes de publicar o endereço publicamente.
- [ ] **Confirmar com o agente** (nesta ou em etapa futura) quando cada um dos itens acima estiver
      pronto, para retomar o deploy real a partir daqui — sem repetir a preparação já feita.

Nenhum destes itens envolve valor financeiro que este agente possa ou deva decidir sozinho — são
listados apenas para orientar exatamente o que falta, na ordem em que normalmente é necessário
(domínio antes de DNS, VPS antes de deploy, e-mail antes de publicar o endereço de suporte).

## 10. Estado final desta etapa

**`BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING`.** Código, configuração e conteúdo do site estão
prontos, testados localmente (incluindo build Docker real e smoke test do Caddyfile de produção
contra headers/gzip/404 reais) e documentados. Nada foi publicado porque nenhum dos três recursos
externos (domínio, VPS, e-mail) existe. A API pública, o Postgres de produção, a submissão à Riot e
a republicação do instalador Desktop continuam fora de escopo desta etapa, como especificado —
nenhum deles depende do que está bloqueado aqui, e nenhum foi tocado.

Quando os recursos da §9 existirem, os próximos passos são exatamente os runbooks das §5–6 deste
documento — nenhuma auditoria nova é necessária, só execução.
