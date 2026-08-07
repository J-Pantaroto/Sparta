---
status: IMPLEMENTADA
solicitado_em: 2026-08-08 00:00
implementado_em: 2026-08-08 02:30
---

# Etapa 31L.1 — Remediação dos disclaimers Riot no Site e Desktop

## Pedido original

> ETAPA 31L.1 — Remediação dos disclaimers Riot no Site e Desktop. Corrigir exclusivamente as
> duas pendências de disclaimer identificadas na Etapa 31L: o site publica só o disclaimer
> "Legal Jibber Jabber", falta o disclaimer específico da política de Desenvolvedor de League of
> Legends, e o Desktop não tem nenhum disclaimer da Riot em lugar nenhum. Reler as fontes
> oficiais antes de editar texto. No site, os dois avisos precisam coexistir — rodapé global
> (referência discreta) + página de Termos de Uso (texto completo) — nunca escondidos em
> tooltip/modal que não abre/comentário HTML/página sem link. No Desktop, adicionar o disclaimer
> sem poluir as telas analíticas — criar uma seção "Sobre o Sparta GG" (nome, versão, links
> futuros desabilitados pro site/privacidade/termos, os disclaimers aplicáveis) em Configurações,
> Conta e segurança, ou um footer/modal "Sobre". O disclaimer do Desktop precisa funcionar
> **offline**, sem depender de chamada de rede/API/site publicado. Enquanto spartagg.com.br não
> estiver publicado, nenhum link pode apontar pra localhost ou GitHub como substituto — usar ações
> desabilitadas. Preservar glassmorphism/temas/densidade/acessibilidade já existentes. Cobrir com
> testes automatizados: presença dos dois disclaimers, coexistência, disponibilidade offline no
> Desktop, acessibilidade por teclado da seção Sobre, ausência de link pra localhost, ausência de
> claim de afiliação/patrocínio, nenhuma string obrigatória alterada por acidente. Auditar a
> linguagem do repositório por termos de risco (official/approved/partner/endorsed) distinguindo
> uso técnico legítimo de claim público. Atualizar os 3 documentos do dossiê da Etapa 31L só para
> registrar a correção, sem marcar READY_TO_SUBMIT. Confirmar não regressão do motor/release/
> replay. Validação completa (typecheck/lint/build/test/analyzer/site build/pacote Electron) e
> validação visual real (site dev server + Electron real via CDP). Estado final esperado:
> RIOT_DISCLAIMERS_COMPLIANT, mantendo RIOT_APPLICATION_PACKAGE_READY,
> BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING, BLOCKED_BY_PUBLIC_SITE, BLOCKED_BY_SUPPORT_EMAIL.
> Não usar SUBMITTED_TO_RIOT/RIOT_APPROVED/READY_TO_SUBMIT. Parar antes de domínio/VPS/e-mail/
> submissão real à Riot.

## Resultado

**Site**: `apps/site/termos.html` §11 reescrito para "Avisos legais da Riot Games", com §11.1
(Legal Jibber Jabber, já existente) e §11.2 (política de desenvolvedor de LoL, novo, texto em
inglês verbatim + tradução em português), fonte/data de consulta citadas com link. O rodapé
global (`apps/site/src/scripts/layout.ts`, `RIOT_DISCLAIMER`) passou a ser uma referência curta
de não-afiliação que aponta pros Termos de Uso, presente nas 9 páginas.

**Desktop**: nova aba "Sobre" em Configurações (`apps/desktop/src/renderer/src/features/
AboutSection.tsx`, wired em `SettingsScreen.tsx`) com nome do produto, versão
(`window.sparta.version`), três botões desabilitados ("Em preparação") para site/privacidade/
termos futuros — nunca apontando pra localhost ou GitHub — e os dois disclaimers embutidos como
constantes literais no bundle (funcionam offline, sem fetch).

**Auditoria de linguagem**: busca por `oficial`/`aprovado`/`parceiro`/`endorsed`/`sponsor`/
`partner` em `apps/`. Toda ocorrência é negação explícita de afiliação (o próprio texto do
disclaimer) ou rótulo técnico de proveniência de dado (ex. "Fonte oficial Riot" descrevendo
patch notes vindas da fonte oficial da Riot, não uma claim de que o Sparta é produto oficial) —
nenhuma correção funcional necessária.

**Testes novos**: `AboutSection.test.tsx` (7), `SettingsScreen.test.tsx` (2, incluindo
acessibilidade por teclado da aba Sobre), `layout.test.ts` (4), `disclaimers-content.test.ts`
(13, lendo as 9 páginas HTML reais do disco) — 26 no total, cobrindo presença/coexistência dos
dois textos, disponibilidade offline, ausência de link localhost/GitHub, botões desabilitados
(não âncoras), nenhuma string obrigatória alterada.

**Validação real**: site no dev server (Vite), termos.html e footer confirmados visualmente e
via `getComputedStyle`, zero erro de console. Desktop no **Electron real via CDP** (debug port
temporário, revertido antes do commit — diff líquido zero confirmado por `git diff`), login real,
navegação até Configurações → Sobre, os dois textos renderizados, `backdropFilter: blur(20px)`
confirmando que o glassmorphism da Etapa 31K.1 segue intacto, zero erro de console, zero exceção.

**Dossiê atualizado**: `docs/riot-policy-compliance-matrix.md` (item Disclaimer passou de
`COMPLIANT_WITH_LIMITATION` pra `COMPLIANT`, 13/3/1/2/1), `docs/riot-production-application.md`
§19, `docs/riot-submission-checklist.md` (item marcado `[x]`, nova seção 38 registrando a
correção) — checklist geral continua `DO_NOT_SUBMIT`, agora só por infraestrutura (domínio, site
publicado, e-mail de suporte, revisão final do responsável), não por conteúdo legal.

**Não regressão**: `release-etapa27c-v1` `ACTIVE`, `artifactHash`/`configHash` idênticos aos
documentados desde a Etapa 27c, confirmado direto no Postgres. `pnpm typecheck`/`lint`/`build`/
`test` completos nos 5 pacotes TypeScript (core 635, riot 97, api 353, desktop 138, site 17 =
1240 testes) + analyzer Python 1/1.

**Estado final**: `RIOT_DISCLAIMERS_COMPLIANT` + `RIOT_APPLICATION_PACKAGE_READY` +
`BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING` + `BLOCKED_BY_PUBLIC_SITE` +
`BLOCKED_BY_SUPPORT_EMAIL`. Nada foi submetido à Riot; nenhum domínio/VPS/e-mail provisionado.
