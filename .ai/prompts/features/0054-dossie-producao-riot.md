---
status: IMPLEMENTADA
solicitado_em: 2026-08-07 23:10
implementado_em: 2026-08-08 01:40
---

# Etapa 31L — Dossiê final para submissão Production à Riot

## Pedido original

> ETAPA 31L — Dossiê final para submissão Production à Riot. [Especificação completa de 37
> seções: revalidar políticas oficiais Riot atuais via fontes web (não só histórico do repo),
> produzir matriz de conformidade classificando cada regra como COMPLIANT/COMPLIANT_WITH_
> LIMITATION/NOT_APPLICABLE/BLOCKED/NEEDS_RIOT_REVIEW, escrever descrição canônica curta e
> detalhada do produto, documentar o fluxo real do usuário separando disponível-hoje/dependente-
> de-Production-Key/não-público, explicar Champion Select sob ótica de Game Integrity com o que o
> Sparta NÃO faz explicitamente listado, explicar a natureza das recomendações (múltiplas opções,
> nunca certeza, nunca chance de vitória), registrar que meta global está indisponível, descrever
> pós-game sem causalidade/contrafactual/julgamento de acerto, documentar RSO como preparado mas
> não ativo, montar inventário definitivo de dados com fonte/finalidade/retenção/visibilidade,
> diagramar arquitetura sem revelar secrets, confirmar que a API key nunca fica no Desktop,
> selecionar e confirmar sanitização de screenshots reais, escrever legendas objetivas, listar
> URLs planejadas do site como PLANNED_PUBLIC_URL (nunca alegar que estão online), preparar
> runbook de verificação de domínio (riot.txt com valor exato fornecido pela Riot, nunca
> inventado), confirmar disclaimer oficial vigente e sua localização exata, auditar propriedade
> intelectual de todos os assets, confirmar marca própria sem confundir com produto oficial,
> documentar monetização honesta (nenhuma hoje), excluir explicitamente modo carreira/coach ao
> vivo/Laboratório-como-feature da submissão, resumir segurança e privacidade sem virar relatório
> de pentest, pré-preencher o formulário Production campo a campo sem inventar, inventariar
> exatamente as APIs Riot necessárias com REQUIRED/OPTIONAL/FUTURE, estimar tráfego de forma
> modelada e explicitamente não representando usuários reais, documentar tratamento real de rate
> limit, montar checklist bloqueante DO_NOT_SUBMIT enquanto item obrigatório faltar, fazer revisão
> contraditória de linguagem sob perspectiva de auditor Riot procurando termos de risco (win
> probability, MMR/ELO, counter, IA que decide, etc.), fazer revisão técnica final confirmando
> zeros reais no código (LCU writes, auto-pick, auto-lock-in, informação oculta, claim de win-
> probability, calculadora MMR/ELO alternativa), confirmar não regressão do motor/ranking/scores/
> release/replay, produzir os 4 documentos entregáveis. NÃO enviar a aplicação à Riot nesta etapa.
> NÃO inventar URLs públicas ainda inexistentes. Estados finais permitidos incluem
> RIOT_APPLICATION_PACKAGE_READY, READY_FOR_PUBLIC_SITE_PROVISIONING,
> BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING, BLOCKED_BY_PUBLIC_SITE, BLOCKED_BY_SUPPORT_EMAIL,
> BLOCKED_BY_POLICY_REMEDIATION — nunca SUBMITTED_TO_RIOT/RIOT_APPROVED/PRODUCTION_KEY_GRANTED/
> RSO_READY. Parar com o pacote pronto para revisão final do responsável.

## Resultado

**Etapa 100% documental** — nenhum arquivo de `packages/` ou `apps/` foi tocado, confirmado por
`git status` antes de fechar (só 4 arquivos novos em `docs/`).

**Políticas revalidadas contra fontes oficiais atuais** (não só histórico do repositório): 9
fontes consultadas em 2026-08-07 com URL, data de última atualização informada pela Riot (quando
exposta) e regra extraída — General Policies (11/mar/2025), Game Specific/LoL Developer API
Policy, Legal Jibber Jabber (ago/2018), RSO, mudança da política LCU (24/jan/2019), PUUID/
segurança. Duas fontes (API Terms and Conditions completo e o espelho autenticado das General
Policies) retornaram HTTP 403 por exigirem login no portal de suporte — registrado como limitação
explícita, não ignorado.

**Achado real que corrige uma decisão da Etapa 31K**: o site publica (desde a 31K) só o
disclaimer do Legal Jibber Jabber. A releitura contra a fonte oficial mostrou que essa política
tem um carve-out explícito para "commercial Projects that... use a currently valid Riot API key",
e que a política específica de League of Legends exige **seu próprio** texto de disclaimer,
diferente e não substituível pelo primeiro. Os dois precisam coexistir — registrado como ação
pendente no checklist, não corrigido nesta etapa (documental).

**Auditoria de código, não de memória**: LCU write operations = 0 (único método HTTP em todo
`packages/riot/src/lcu/read-only-client.ts` é `GET`); `RIOT_API_KEY` só em `apps/api` (busca em
todo o repositório); zero handler IPC de escrita ao League Client; zero ocorrência de "win
probability"/"chance de vitória" fora de negação explícita já existente na própria interface;
zero asset da Riot commitado ou embutido no binário (ícones/splash vêm ao vivo da CDN pública).

**4 documentos entregues**: `docs/riot-production-application.md` (descrição canônica, fluxo,
Champion Select sob Game Integrity, natureza das recomendações, RSO, inventário de dados,
arquitetura, screenshots/legendas, IP, marca, monetização, exclusões de escopo, formulário
pré-preenchido), `docs/riot-policy-compliance-matrix.md` (fontes + matriz completa), `docs/
riot-api-inventory.md` (APIs exatas com REQUIRED/OPTIONAL/FUTURE, tráfego modelado, rate limit
real), `docs/riot-submission-checklist.md` (checklist bloqueante, revisão contraditória, zeros
técnicos confirmados, não regressão, estado final).

**Não regressão**: `release-etapa27c-v1` `ACTIVE`, `artifactHash`/`configHash` idênticos aos
documentados, confirmado direto no Postgres. Como nenhum arquivo de código foi tocado, a ausência
de diff fora de `docs/` já é a prova suficiente — não foi necessário reexecutar a suíte completa.

**Estado final**: `RIOT_APPLICATION_PACKAGE_READY` + `BLOCKED_BY_PUBLIC_SITE` +
`BLOCKED_BY_SUPPORT_EMAIL` + `BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING`. O conteúdo do dossiê
está pronto para revisão final do responsável; o que falta é a publicação real do site (mesmo
bloqueio da Etapa 31K) e as duas correções de disclaimer identificadas. **Nada foi submetido à
Riot.**
