---
status: IMPLEMENTADA
solicitado_em: 2026-08-07 17:20
implementado_em: 2026-08-07 21:20
---

# Etapa 31K — Fundação pública do Sparta GG: domínio, site institucional e infraestrutura base

## Pedido original

> Fundação pública do Sparta GG: domínio, site institucional e infraestrutura base. Ciclo de
> redesign do Desktop completo até a 31J; autenticação obrigatória, confirmação de e-mail e
> onboarding implementados; identidade Riot preparada; produção ainda bloqueada por configuração
> real de e-mail e aprovação da Riot; `release-etapa27c-v1` preservada; `EXACT_REPLAY`; CI verde;
> o app público 0.9.0 continua retirado e não deve ser republicado nesta etapa. Decisões de
> infraestrutura já tomadas pelo responsável (dadas, não a serem relitigadas): marca "Sparta GG";
> domínio pretendido `spartagg.com.br`; contato pretendido `suporte@spartagg.com.br`; infra
> pretendida "VPS Hostinger"; site e futura API na VPS; PostgreSQL em infra controlada; e-mail
> hospedado fora do app/API; HTTPS obrigatório; backup semanal do provedor aceito como política
> mínima atual. Domínio disponível quando verificado, mas compra não deve ser presumida.
>
> Objetivo: preparar, e quando os recursos externos já estiverem sob controle do responsável,
> publicar a fundação pública: domínio, DNS, VPS, HTTPS, site institucional, páginas legais,
> suporte, estrutura para futura API, infraestrutura necessária para um pedido futuro à Riot.
> Explicitamente: não publicar a API funcional do Sparta ainda; não republicar o instalador
> Desktop; não submeter à Riot nesta etapa.
>
> FASE 0 (explícita): antes de tocar em infraestrutura, determinar EXCLUSIVAMENTE via
> configuração/documentação já fornecida pelo responsável se domínio/VPS/acesso SSH/e-mail já
> existem. Proibido tentar descobrir credenciais; pedir senha, chave SSH privada, token, senha do
> Registro.br, senha da Hostinger, senha de e-mail — credenciais devem ser configuradas pelo
> responsável via mecanismo seguro/local, nunca solicitadas pelo agente. Se um recurso não
> existir: não comprar/contratar automaticamente; produzir um checklist objetivo do que o
> responsável precisa adquirir/configurar e parar na fronteira da ação financeira. Estado
> permitido: `BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING`. Depois que o responsável confirmar
> os recursos, continuar a mesma etapa.
>
> [Especificação completa de 34 seções cobrindo: arquitetura (spartagg.com.br → reverse-proxy/
> HTTPS → site + futura api.spartagg.com.br → API + Postgres, API desligada nesta etapa),
> subdomínios (spartagg.com.br/www/api, www redireciona pro canônico), DNS documentado por tipo/
> hostname/destino/TTL/finalidade separando site/API/e-mail, hardening mínimo de VPS quando
> provisionado (Linux LTS, updates, usuário não-root, chave SSH, firewall, timezone, hostname,
> logs, Docker/Compose, restart policy, nunca desabilitar root/senha antes de confirmar o novo
> acesso, nunca chave privada no repo, zero secret em .env.example/Dockerfile/Compose/logs/docs),
> reverse proxy (Caddy ou Nginx, simplicidade operacional, TLS/redirect/cabeçalhos/compressão/
> proxy futuro da API/servir o site), HTTPS válido com renovação automática sem certificado
> autoassinado público, site institucional NÃO reaproveitando o renderer do Electron diretamente,
> identidade visual compartilhada onde fizer sentido, escuro premium responsivo rápido acessível
> sem excesso de efeitos, Home com hero específico "Sparta GG / Análise pessoal e suporte à
> tomada de decisão no League of Legends" (adaptável após revisar terminologia atual), evitando
> promessas proibidas (vitória garantida/elo garantido/recomendação perfeita da IA), seções
> sugeridas (o que é/como funciona/evolução de perfil/análise de draft/pré-game/pós-game/
> privacidade/disponibilidade atual), capturas reais pós-31J sanitizadas quando valioso nunca
> imagem de concorrente, honestidade do estado atual do produto (sem botão de download
> funcional já que o Desktop foi retirado e a API não é pública, pode mostrar "Acesso público em
> preparação" ou equivalente, nunca linkar o instalador antigo 0.9.0, nunca alegar aprovação da
> Riot), página "Como funciona" explicando Conta Sparta→vínculo Riot→sincronização→análise→apoio
> ao draft→análise pós-partida distinguindo dado pessoal/próprio/Riot/indisponível-global sem
> revelar detalhes sensíveis internos do motor, página Funcionalidades só com recursos reais
> (Perfil/Dashboard/Champion Select/pré-game/histórico/pós-game/evolução pessoal), nunca anunciar
> modo carreira/coach/meta global/recursos experimentais como públicos, Laboratório/Motor podem
> ficar fora da comunicação principal por serem técnicos, Política de Privacidade pública
> refletindo o comportamento real do sistema cobrindo identidade do app/responsável/dados da
> conta Sparta/e-mail/dados Riot/histórico de partidas/identificadores técnicos/logs/cookies-
> sessão-se-houver/finalidade/retenção/segurança/terceiros/direitos/exclusão/contato, com
> política explícita: reter enquanto a conta estiver ativa, permitir exclusão sob pedido,
> considerar remoção após 365 dias de inatividade, concluir pedidos de exclusão em até 30 dias,
> nunca inventar coleta que não existe nem omitir coleta que existe, marcar pontos que precisam
> de revisão jurídica como tais, Termos de Uso cobrindo elegibilidade/conta/uso permitido/
> integração Riot/disponibilidade/propriedade intelectual/limitações/encerramento/mudanças/
> contato sem alegações jurídicas absolutas sem embasamento, registrar que o texto precisa de
> revisão jurídica antes de operação comercial relevante, disclaimer visível da Riot usando o
> texto oficial exato documentado no pacote de submissão atual do projeto, não improvisado/
> parafraseado quando existir texto oficial, nunca usar o logo da Riot como marca própria do
> Sparta nem o logo do LoL como logo do produto, nenhum design sugerindo produto oficial, página
> /excluir-conta explicando o que é removido/prazo/consequências/como solicitar/verificação de
> identidade/dado legalmente exigido preservado se houver, sem simular formulário funcional
> enquanto a API pública não existir (pode instruir contato via suporte configurado), suporte
> suporte@spartagg.com.br publicado só quando a caixa realmente existir e receber e-mail, validar
> envio/recebimento/SPF/DKIM/DMARC quando disponível, não hospedar SMTP na VPS nesta etapa,
> página de práticas de segurança/privacidade (HTTPS/autenticação/confirmação de e-mail/
> isolamento de conta/vínculo Riot/minimização de dados/exclusão) sem detalhe de arquitetura
> explorável, página /status só com estados públicos reais (site/autenticação/integração Riot),
> nenhum painel interno, "Integração pública: em preparação" aceitável enquanto a API não for
> pública, arquitetura do arquivo de verificação da Riot (ex. https://spartagg.com.br/riot.txt)
> preparada para servir o conteúdo exato que a Riot fornecer depois, nunca inventar token ou
> placeholder que pareça válido, SEO técnico básico (title/description/canonical/favicon/OG/
> sitemap/robots.txt) sem spam de palavra-chave nem parceria alegada com a Riot, validação de
> acessibilidade (navegação por teclado/headings/contraste/alt/landmarks/foco/formulários/
> mobile) com boas práticas WCAG como meta mínima, performance evitando framework pesado/imagem
> gigante/vídeo autoplay/fontes excessivas/JS desnecessário, usar capturas reais recentes
> priorizando Dashboard/Perfil/Champion-Select/Pós-game nunca expor e-mail de teste real/tokens/
> IDs sensíveis/dado privado/hash operacional desnecessário sanitizando antes de publicar, infra
> do site containerizada ou servida de forma simples/reproduzível com healthcheck/restart/logs/
> atualização previsível/rollback simples, nenhum banco de dados público servindo um site
> estático, preparo da futura API — pode preparar api.spartagg.com.br no reverse proxy mas NÃO
> publicar o backend enquanto os gates BLOCKED_BY_EMAIL_PROVIDER_CONFIGURATION/
> BLOCKED_BY_RIOT_APPROVAL permanecerem, nunca contornar os gates da 31D, se o PostgreSQL for
> instalado para preparo futuro nunca expor a porta 5432 à internet, bind interno, credenciais
> fortes, volume persistente, healthcheck, migrations controladas apenas, nenhuma importação
> fake de produção, política de backup atual aceita é semanal do provedor, documentar
> explicitamente o risco "dependência de backup de um único provedor", antes de qualquer
> migração futura relevante fazer dump manual + checksum + validação básica de restore, não
> contratar backup adicional nesta etapa, observabilidade básica de site/infra (saúde/logs/
> disco/memória/estado do container) sem stack pesada ainda, todos os secrets fora do Git,
> auditar via git-grep/Docker/Compose/CI/logs/histórico, zero secret em qualquer commit, quando
> publicado validar externamente https://spartagg.com.br (DNS/TLS/redirect/homepage/páginas
> legais/mobile/headers/favicon/robots/sitemap/links/404/performance) mais as variantes http:// e
> www., não regressão obrigatória do Desktop (release-etapa27c-v1 ativa, candidatos/ranking/
> hashes/replay inalterados, EXACT_REPLAY, zero divergências), inspeção básica de segurança da
> infra pública (portas expostas/SSH/TLS/headers/containers/secrets/permissões/banco de dados/
> arquivos públicos) sem pentest destrutivo, documentação cobrindo arquitetura/DNS/VPS/deploy/
> rollback/backup/suporte/páginas/políticas/domínio/HTTPS/bloqueadores atuais/checklist Riot sem
> registrar credenciais, estados finais permitidos: PUBLIC_FOUNDATION_READY/PUBLIC_SITE_LIVE/
> READY_FOR_RIOT_SUBMISSION_PREPARATION/BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING/
> BLOCKED_BY_DOMAIN_CONFIGURATION/BLOCKED_BY_EMAIL_CONFIGURATION/BLOCKED_BY_DEPLOYMENT; ainda NÃO
> permitidos: RIOT_APPROVED/RSO_READY/PUBLIC_API_LIVE; explicitamente fora de escopo: submeter à
> Riot, RSO real, publicar API funcional, republicar Desktop, modo carreira, coach, dado global,
> mudança de motor, trocar a release ativa, auto-contratar serviços. Critérios de aceite
> (condicionados a infra disponível): domínio acessível por HTTPS, site publicado, Privacidade/
> Termos públicos, fluxo de exclusão documentado, disclaimer da Riot presente, contato de suporte
> publicado só se funcional, arquitetura permite riot.txt, VPS minimamente endurecido, banco não
> exposto publicamente, futura API continua bloqueada, nenhum secret no Git, Desktop intacto, CI
> verde, replay continua EXACT_REPLAY. Se domínio/VPS/e-mail ainda não tiverem sido contratados,
> parar antes de contratar e entregar o checklist exato ao responsável.]
>
> [Nota estratégica final, mesma mensagem]: depois da 31K eu não voltaria para desenvolver
> feature nova. A próxima deveria ser a 31L — pacote final de submissão Production para a Riot.
> Modo carreira e coach ficam depois desse marco, para não ampliar o escopo justamente quando
> estamos tentando obter a primeira aprovação.

## Resultado

**`BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING`.**

**FASE 0**: confirmado via `git grep` (nenhuma ocorrência de `spartagg`/`hostinger`/`registro.br`
fora desta etapa), ausência de `~/.ssh/config`, e histórico completo de etapas anteriores (Etapa
30-31J documentam explicitamente que nenhuma infraestrutura pública jamais existiu) — nenhum dos
três recursos (domínio, VPS, e-mail) está provisionado. Nenhuma credencial foi solicitada,
adivinhada ou testada.

**Construído e validado localmente, nada publicado**: `apps/site/` (site institucional Vite
multi-page, 9 páginas, testado no dev server real, zero erro de console em nenhuma página,
navegação mobile testada, screenshots redigidos sanitizados); `Dockerfile.site` (build real via
Docker, imagem gerada com sucesso, digest real do `caddy:2.10-alpine` pinado — não inventado,
obtido via `docker pull` real nesta sessão); `infra/Caddyfile` (validado com `caddy validate` e
smoke-testado num container real: headers de segurança, gzip e 404 customizado confirmados via
`curl`); `infra/docker-compose.yml` (não executado contra infra real). Documentação completa em
`docs/public-foundation-infrastructure.md` (arquitetura, plano de DNS, runbook de hardening de
VPS, runbook de deploy/rollback, política de backup com o risco documentado, checklist exato de
aquisição para o responsável).

Auditoria de secrets: zero ocorrência de padrão de segredo/credencial nos arquivos novos desta
etapa. Não regressão do Desktop: zero arquivo de `apps/api`/`apps/desktop` tocado; typecheck/
lint/test/build completos nos 5 pacotes TypeScript (incluindo o novo `@sparta/site`); Postgres
real confirma `release-etapa27c-v1` `ACTIVE` com `artifactHash`/`configHash` idênticos aos
documentados; replay mais recente em `EXACT_REPLAY`; a única migration com `finished_at IS NULL`
é a linha histórica já documentada da Etapa 28b (não é regressão).

API pública, Postgres de produção, submissão à Riot e republicação do instalador Desktop
permanecem fora de escopo, como especificado — nenhum foi tocado. Ver
`docs/public-foundation-infrastructure.md`.
