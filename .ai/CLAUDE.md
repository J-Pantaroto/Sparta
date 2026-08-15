# Sparta - Contexto para Continuidade

## Etapa 31N: screenshots finais do Desktop no site

O site institucional agora usa quatro derivados WebP das capturas reais posteriores à 31M.1. O
Dashboard Adaptativo é dominante no Hero; Evolução pessoal e Configurações/tema Adaptativo apoiam a
home sem transformá-la em galeria. `/como-funciona` liga estado atual e série temporal;
`/funcionalidades` separa explicitamente leitura pessoal de apresentação. O tema é descrito como
somente visual: nunca altera score, recomendação ou análise. Nenhum gráfico foi recriado.

Os originais de `%TEMP%/sparta-qa-31m1` foram preservados. Os derivados em
`apps/site/public/images/product/` receberam máscaras sólidas `#0b0b0d` somente sobre todas as
repetições do Riot ID (chip, card e sidebar), `-strip` e WebP qualidade 84. Uma inspeção intermediária
achou duas repetições esquecidas na sidebar; os arquivos foram regenerados e reabertos. A guarda
automatizada em `product-assets.test.ts` verifica inventário, legados, strings sensíveis, peso,
dimensões, prioridade/lazy-load e reduced motion. Quatro WebPs somam 197.610 B contra 424.264 B dos
três JPEGs antigos (−53,4%). Relatório completo em `docs/site-product-screenshots-polish.md`.

QA no navegador real: 11 rotas × 390/768/1280/1600 = 44/44 sem overflow ou imagem quebrada; 12/12
cenários de lazy-load; 11 rotas e quatro assets HTTP 200; zero erro de console/CSP. Desktop, API,
auth, banco, Riot, infraestrutura, Caddy, suporte, legal e callbacks permanecem funcionais e sem
alteração. Versão/Prisma/typecheck/lint/build, 1.432 testes TypeScript, analyzer e build Docker do site
passaram.

## Etapa 31M.1: identidade visual dinâmica e evolução pessoal do Desktop

Fecha os três pontos visuais deixados após a 31M. A tela **Evolução pessoal** agora começa por uma
série SVG partida a partida derivada diretamente de `PlayerProfileOverview.performanceTrend`:
`performanceIndex` como leitura principal e KDA, CS/min, visão/min e participação em objetivos como
quatro sparklines auxiliares. Cada observação mantém `matchId`/data/resultado; zero real é mantido;
não há interpolação, suavização nem métrica nova. Abaixo de 3 observações, nenhum gráfico é
desenhado e a UI diz “Histórico insuficiente para medir evolução”. Comparações por bloco e barras
anteriores continuam, mas depois da série temporal. Relatório em
`docs/desktop-dynamic-identity-growth.md`.

A splash escolhida passou de banner repetido a **uma camada ambiente única do `AppShell`**, atrás
do conteúdo, com máscara, vinheta e opacidade controlada; intensidade reduzida a oculta e reduced
motion elimina a transição perceptível. Sem campeão, o estado é deliberadamente **Sparta**, não
Ahri: o contexto usa uma sentinela não persistida e login/shell renderizam `SpartaIdentityBackdrop`
com a geometria Spartan Signal. O bloco vermelho “S” foi trocado pelo símbolo oficial auditado em
`apps/site/public/img/favicon.png`; a cópia necessária ao bundle renderer é byte a byte idêntica
(`62e228ba…29e6`) e tem a origem documentada. Nenhuma imagem foi gerada ou baixada.

QA Electron/CDP real, instância única: 10 telas × 1000/1280/1600 = **30/30 sem overflow**, zero
imagem quebrada, texto inválido, erro de console, exceção ou HTTP >= 400. A interface real aplicou
Viego/Fera Lunar no Adaptativo (`hsl(23 100% 62%)`), sem splash duplicada; temas Espartano,
Obsidiana e Adaptativo, densidade/intensidade, reduced motion, tooltip e Tab real passaram. Uma
regressão de especificidade em `Field.css` que anulava o anel de teclado foi corrigida; o foco
programático do `<h1 tabindex="-1">` de `399d990` continua sem anel. “League não detectado” e
“campeões” corrigidos. “Runa 8128” continua honesta porque não existe catálogo local factual e
adicionar integração Riot seria fora do escopo.

O diff funcional está integralmente em `apps/desktop/src/renderer/`: motor, API, Prisma, auth, LCU,
site, Docker, scoring, pesos, métricas e contratos não foram tocados. Postgres confirmou
`release-etapa27c-v1` `ACTIVE`, ponteiro e hashes congelados iguais, e o bundle mais recente em
`EXACT_REPLAY`, sem divergências/rejeições/dependências.

## Etapa 31M: polimento visual final do Desktop

Leva o Desktop de "visualmente estável" para acabado. O design system já estava maduro (tokens por
função, um CSS por componente, zero classe legada), então o critério foi **medir antes de mexer**:
cada mudança nasceu de um número, não de impressão. Relatório em `docs/desktop-visual-polish.md`.

**A decisão mais importante é a regra de contraste do destaque, e ela não é intercambiável.**
`--color-accent` é dinâmico (derivado da splash da skin) e sua faixa travada (S>=55%, L 45%-62%)
garante que a cor seja _visível_, mas **não** que seja legível como texto: medido sobre
`--surface-2`, um azul (240) em L=45% dá 2,06:1 e mesmo no teto de 62% fica em 4,13:1; o vermelho
Espartano padrão dá 3,94:1. E o accent era usado como cor de texto em 11 lugares. Separado em
`--color-accent` (preenchimento/borda/marcador, nunca texto) e `--color-accent-text` (única
aprovada para texto, mesma matiz clareada até cruzar 4,5:1, derivada em runtime por
`readableAccentText`). Mesmo princípio que o site já aplica — não é cópia de design.

**Duas afirmações erradas em comentários foram derrubadas pela medição**: (1) `--text-on-accent`
dizia que tinta escura é sempre melhor dentro da faixa — na verdade o pior caso cai a 2,04:1, e o
`.sp-skip-link` media 4,14:1; `readableInkOnAccent` agora escolhe entre preto e branco por medição
(pior caso 4,58:1), e a tinta escura precisou ser preto **puro**, porque com `#08080a` o melhor
caso possível ainda reprovava em 4,47:1. (2) O anel de foco prometia "halo escuro por trás" que
nenhuma regra implementava — sobre splash clara ele sumia; o halo agora existe, e o anel deixou de
usar o accent cru (2,06:1 no pior caso) pela variante legível.

**`--text-muted` reprovava AA em toda superfície** (3,38-3,99:1) e é o token dos textos _menores_
do app (10-11px, 102 usos) — a pior combinação possível. `#6f6f7b` → `#8a8a98`, preservando os três
degraus de hierarquia (15,27 / 6,87 / 4,93 sobre `--surface-4`).

**Profundidade**: `.sp-card` só tinha realce interno e nenhuma sombra projetada — lia como adesivo
colado no fundo. Tokens `--elevation-raised`/`--elevation-hover`; `feature` sobe para `--shadow-lg`,
`flat` fica sem sombra, `inset` ganha sombra **interna**; e cards clicáveis ganharam o estado
`pressed` que faltava (só os botões tinham).

**Tracking**: 19 rótulos UPPERCASE semanticamente idênticos usavam **cinco** valores diferentes
(0.04 a 0.12em) — a mesma peça com espaçamento distinto por tela. Unificados em `--tracking-caps`
(0.06em, a moda dos valores existentes). Zero `letter-spacing` literal fora de `tokens.css`.

**3 bugs reais de layout achados pelo QA** (7 de 30 combinações falhavam): (1) `.sp-recent-match__
loadout` escondia **~4 dos 8 itens** silenciosamente (`overflow: hidden` numa coluna de 160px para
264px de conteúdo) — o usuário via meia build achando que via a inteira; agora quebra em duas
fileiras preservando tudo; (2) `.sp-dashboard-matches` sem `grid-template-columns` deixava a
trilha implícita virar min-content e a linha **vazava 110px para fora do cartão**; (3) o
`@media (max-width: 1280px)` nunca poderia corrigir o Dashboard, porque media query enxerga o
_viewport_ e o cartão continua com ~530px mesmo em 1600px — substituído por **container queries**
(Chromium 142), com breakpoints somados dos mínimos reais (924/798/662px). Mais truncamento
faltando no `strong` do histórico de drafts (invadia 17-19px) e "Sincronização" vazando 9px.

**QA no Electron real via CDP**, conta Zekerus#117: 10 telas × 1000/1280/1600 = **30/30 sem
overflow estrutural**, 0 imagem quebrada, 0 `NaN`/`undefined`, **0 erro de console, 0 exceção, 0
HTTP >= 400**. Contraste medido no DOM real (cada texto contra o fundo efetivamente pintado atrás):
**628 elementos nos 3 temas, 0 abaixo de AA**. Temas/densidade/intensidade aplicados pela tela real
de Configurações e confirmados; caminho dinâmico validado (skin real → accent `hsl(218 100% 62%)`,
texto 5,43:1, tinta 5,96:1); Tab real e reduced motion confirmados; 18 screenshots.

**Achado metodológico**: `pkill -f electron` não mata processo Windows — cinco instâncias ficaram
empilhadas e o CDP conectava à mais antiga, servindo bundle velho e produzindo uma leitura falsa.
Detectado ao rastrear a origem de um valor, corrigido via PowerShell e **tudo revalidado do zero**
numa instância única.

**Não regressão estrutural**: o diff inteiro está em `apps/desktop/src/renderer/` — zero arquivo em
`packages/`, `apps/api`, `apps/site`, `infra/`, `prisma/` ou Docker; logo motor, pesos, métricas,
proveniência e contratos não têm como ter mudado. `release-etapa27c-v1` `ACTIVE` com
`artifactHash`/`configHash` idênticos, confirmado no Postgres. **1422 testes** (desktop 171, eram
164; `accent-color.test.ts` novo trava as duas garantias de contraste varrendo 12.960 combinações,
com a luminância reimplementada da especificação em vez de importada do módulo sob teste).

Preservado de propósito: rótulos crus de runa (não existe catálogo local — inventar violaria a
regra de dado real), identidade visual, glassmorphism, os três temas, LCU read-only,
`draftRevision`, congelamento de snapshot e todos os gates de produção/RSO.

## Correção pontual: propagação de pnpm patches no Dockerfile.site

O build de produção do site quebrava na VPS (`ENOENT` em `patches/extract-zip@2.0.1.patch`) porque
`Dockerfile.site` rodava `pnpm install --frozen-lockfile` sem copiar `patches/` antes — a Etapa
0061 (ver "Correções bloqueantes pré-polish" abaixo) tinha corrigido essa propagação só no
`Dockerfile.api`, e `Dockerfile.site` nunca tinha sido revisado porque não estava entre os cinco
bloqueios auditados naquela etapa. `COPY patches ./patches` adicionado ao estágio `build` do site,
no mesmo lugar relativo que a API já usa; o estágio `runtime` (Caddy + `dist/` estático) continua
sem copiar `patches/`, porque não roda nenhum install.

`scripts/dockerfile-patch-propagation.test.ts` deixou de ser específico do `Dockerfile.api` — agora
escaneia **todo** `Dockerfile.*` da raiz (`readdirSync`, não lista fixa) e exige `COPY patches`
antes de qualquer `pnpm install --frozen-lockfile` em qualquer estágio, excluindo deliberadamente
`--frozen-lockfile=false` (usado por `Dockerfile.desktop-dev`, fora do escopo desta proteção).
Confirmado que o teste **falha** sem a correção (revertido isoladamente via `git stash`, reproduziu
a mensagem exata do erro real) e passa com ela — 7 testes no total, um `Dockerfile.*` novo entra na
proteção automaticamente, sem precisar editar o teste.

Validado com `docker build -f Dockerfile.site .` real, com e sem `--no-cache` (checkout limpo):
os dois concluíram sem erro. `typecheck`/`lint`/`test`/`build` completos nos 5 pacotes — **1415
testes** no monorepo (raiz 25, eram 21). Nenhum arquivo fora de `Dockerfile.site`,
`scripts/dockerfile-patch-propagation.test.ts` e documentação foi tocado: `pnpm.patchedDependencies`,
o patch do `extract-zip`, pnpm, Electron, o visual do site, `infra/Caddyfile`, `apps/api`, auth e
DNS continuam intactos. Ver `docs/dockerfile-site-patch-propagation.md`.

## Etapa 31Q: autenticação de produção — e-mail transacional e recuperação de senha

Fecha os dois maiores bloqueios que a auditoria pré-final (Etapa 31 anterior, `docs/desktop-pre-
final-audit.md`) tinha deixado explicitamente pendentes: confirmação de e-mail sem jeito real de
concluir o clique, e recuperação de senha inexistente. Relatório completo em
`docs/password-recovery-and-transactional-email.md`.

**A abstração já existia, só faltava o adaptador real.** `TransactionalEmailProvider`
(Etapa 31D) já tinha interface, `unavailableEmailProvider`, `InMemoryTransactionalEmailProvider` e
o schema de env já reservava `EMAIL_PROVIDER_MODE: "EXTERNAL"` — mas nenhuma classe concreta
existia pra esse modo. Completada, não substituída: `ResendTransactionalEmailProvider` (HTTP
único via `fetchWithPolicy`, nova `IntegrationId: "TRANSACTIONAL_EMAIL"` em `packages/riot/src/
http`) implementa os dois envios. Token de confirmação de e-mail (`email-verification.ts`) já era
sólido — hash SHA-256, uso único, expiração, revogação em cascata, cooldown/limite por hora numa
transação serializável, resposta neutra. Recuperação de senha **não existia em lugar nenhum**;
`PasswordResetToken` (migration nova) espelha exatamente esse desenho, sem inventar um segundo
mecanismo.

**Deep link avaliado e descartado antes de escrever código.** O pedido explicitamente pedia pra
considerar deep link/protocolo do Desktop antes de criar página pública. Descartado por ser a
opção mais frágil, não a mais simples: exige `app.setAsDefaultProtocolClient` (só funciona
_instalado_), tratamento de `open-url`/`second-instance`, e falha se o app não estiver aberto na
máquina que recebeu o e-mail. Duas páginas públicas mínimas (`/confirmar-email`,
`/redefinir-senha`, `apps/site`, Spartan Signal, sem framework, `noindex` e fora do sitemap de
propósito) funcionam em qualquer cliente de e-mail, sem exigir o Desktop aberto. Nenhuma vira área
de conta completa; nenhum `/conta`, sessão web ou histórico de tickets foi criado.

**Redefinição de senha invalida toda sessão existente, sem exceção.** Decisão de segurança
aplicada na mesma transação que troca `passwordHash`: `sessionVersion` incrementa, e como o token
de sessão HMAC já carrega essa versão no payload (`ver`, existente desde o início do projeto),
qualquer sessão emitida antes do reset passa a falhar imediatamente — sem esperar expirar.
Validado contra o Postgres real, não só em teste mockado: um token de sessão emitido antes do
reset, usado depois, devolve `401`.

**Anti-enumeração preservado, mesmo sob pressão pra expor mais estado.** O pedido listava
"provider indisponível" como estado de UI desejável pro reenvio de confirmação — mas adicionar
`deliveryStatus` à resposta do `POST /auth/email-verification/resend`/`/auth/register` criaria um
oráculo de 1 bit (o sinal só apareceria quando a conta existe e está desverificada). Não
implementado ali de propósito; o estado "provider indisponível" continua coberto onde é seguro
mostrá-lo — dentro do `ForgotPasswordScreen`, que já é 100% neutro por natureza.

**Desktop sem redesign**: `ForgotPasswordScreen` (novo, só faz o _pedido_ — o _consumo_ do token
acontece na página pública, não no Desktop) e `EmailVerificationScreen` ganhou "Já confirmei,
verificar novamente" (reconsulta `/auth/me` via `refreshOnboarding()`, já existente; só aparece
quando há `sessionToken`, ou seja, quando o usuário chegou ali _depois_ de logar — logo após o
cadastro, sem sessão, o caminho continua sendo voltar e logar de novo).

**Produção falha o boot sem as duas configurações novas** — `EMAIL_PROVIDER_API_KEY` e
`PASSWORD_RESET_URL_BASE` HTTPS, mesma filosofia que já existia pra `EMAIL_VERIFICATION_FROM`/
`URL_BASE`. `.env.production.example` documenta os nomes reais, sem secrets; remetente
transacional (`contas@mail.spartagg.com.br` — corrigido numa etapa pontual pós-31Q, ver abaixo)
explicitamente distinto de `suporte@spartagg.com.br` (canal humano, não tocado); nenhum valor de
DNS foi inventado — o painel da Resend informa SPF/DKIM reais depois que o domínio for adicionado
lá, ação do owner.

## Correção pontual pós-31Q: domínio do remetente transacional

O domínio real verificado no painel da Resend para produção é o **subdomínio**
`mail.spartagg.com.br`, não o apex `spartagg.com.br` que a Etapa 31Q tinha presumido (a primeira
versão documentava `contas@spartagg.com.br`, sem confirmação do domínio real verificado no
provider). Corrigido em `.env.production.example` (`EMAIL_VERIFICATION_FROM=contas@mail.spartagg.
com.br`) e nos dois documentos que citavam o valor antigo (`docs/password-recovery-and-
transactional-email.md`, `docs/desktop-pre-final-audit.md`, com os espelhos em `.ai/specs/`
sincronizados). `EMAIL_PROVIDER_REPLY_TO=suporte@spartagg.com.br` (canal humano, apex) preservado
sem alteração — reply-to não precisa estar no domínio verificado da Resend, só o `from` precisa.

**Confirmado por leitura do código, não presumido**: confirmação de e-mail e recuperação de senha
usam o **mesmo** `EMAIL_VERIFICATION_FROM` — `defaultEmailProviderForEnvironment`
(`apps/api/src/modules/auth/email-provider.ts`) constrói uma única instância de
`ResendTransactionalEmailProvider` a partir dessa variável (`from: env.EMAIL_VERIFICATION_FROM`),
e as duas rotas (`sendEmailVerification`/`sendPasswordReset`) chamam essa mesma instância; não
existe segunda variável de remetente nem lógica de `from` específica por fluxo em nenhum ponto do
código. `EMAIL_VERIFICATION_URL_BASE`/`PASSWORD_RESET_URL_BASE` **não** foram tocadas — continuam
apontando pro apex `spartagg.com.br` (as páginas públicas do site), que é um domínio diferente do
domínio de envio de e-mail e não precisa estar verificado na Resend.

**Zero mudança de código, DNS, provider ou infraestrutura** — correção isolada em
configuração/documentação. Nenhum teste precisou de ajuste: os fixtures de
`resend-email-provider.test.ts`/`email-provider.test.ts` usam strings de exemplo arbitrárias
(`contas@spartagg.com.br`, `access@example.com`) que testam o repasse do valor de `from` recebido
via construtor, não o domínio real — o comportamento testado (o provider usa exatamente o `from`
passado a ele) continua correto e não depende do valor documentado em
`.env.production.example`.

**QA end-to-end real contra Docker/Postgres** (não simulado): cadastro → token de preview →
confirmação → login → pedido de reset → token de preview → confirmação com nova senha → senha
antiga rejeitada (401) → senha nova aceita → sessão emitida antes do reset rejeitada (401) → reuso
do token de reset rejeitado (400) → sem `LOCAL_EMAIL_PREVIEW_ENABLED`, nenhum token vaza na
resposta neutra mesmo pra conta que existe de verdade no banco.

**4 bugs reais corrigidos no caminho**: (1) boot falhava com "Rotas sem politica de autorizacao"
até as duas rotas novas entrarem em `authorization-policy.ts` como `PUBLIC` — a trava estrutural
da Etapa 31C funcionou exatamente como desenhada; (2) a primeira versão de `confirmar-email.html`
tinha um `style=` inline, que a CSP do site (`style-src 'self'` sem `unsafe-inline`, travada desde
a Etapa 31M) teria descartado silenciosamente em produção — corrigido antes do commit; (3)
`apps/api/vitest.config.ts` não tinha alias pro subpath `@sparta/riot/http` (só pra raiz
`@sparta/riot`), quebrando a resolução dos novos testes — `apps/desktop/vitest.config.ts` já
resolvia isso corretamente, mesmo padrão copiado; (4) `.env` local foi corrompido por um `echo >>`
sem quebra de linha durante um teste manual (concatenou uma variável nova direto no valor de
`AUTH_TOKEN_SECRET`) — percebido e corrigido na mesma sessão, sem efeito além do arquivo local
nunca versionado.

**1411 testes** no monorepo (raiz 21, site 117 — eram 102 —, core 635, riot 98, api 376 — eram
353 —, desktop 164 — eram 157) + analyzer 1/1. `typecheck`/`lint`/`build` completos nos 5 pacotes;
Docker da API reconstruído e reiniciado com healthcheck 200; migration nova aplicada limpa via
`prisma migrate deploy` (25 migrations). Nenhum arquivo de `packages/core`, motor de recomendação,
release ou replay foi tocado — confirmado pelo escopo do diff antes do commit.

**Classificação final**: `EMAIL_PROVIDER`, `EMAIL_CONFIRMATION` e `PASSWORD_RECOVERY` — todos
`NEEDS_CONFIGURATION`. Implementação completa e validada; falta só a credencial real do provider
Resend em produção, decisão e ação do owner, não código. A matriz de `docs/desktop-pre-final-
audit.md` foi atualizada com essa reclassificação, preservando o texto original de diagnóstico
como histórico.

## Correções bloqueantes pré-polish: confiabilidade e segurança

Etapa 0061 concluída em 2026-08-14 sobre
`baa12c2c91cb55ba2f6784b31cb82d1c859b8bf3`. Relatório em
`docs/pre-polish-blocking-fixes.md` e espelho em `.ai/specs/pre-polish-blocking-fixes.md`.

Cinco bloqueios fechados: `Dockerfile.api` copia `patches/` antes dos installs congelados apenas nos
estágios `deps`/`build`; restauração remove sessão somente após 401 autoritativo e preserva
`safeStorage` em offline/timeout/network/5xx; LCU usa `gameId` + `draftRevision` monotônica e limpa
todos os campos observados ao invalidar/trocar sessão; pós-game usa coordenador latest-only com um
`AbortSignal` comum às cinco fontes; todos os IPCs privilegiados validam frame principal, renderer
URL exata e payload, com navegação/window fail-closed.

Gates: install frozen, version/Prisma/typecheck/lint/build, **1.366 testes TS**, analyzer 1/1,
Docker API build/health e QA Electron real. A QA cobriu offline/retry, duas sessões LCU separadas por
desconexão, troca rápida de partida, Configurações, navegação externa e logout; zero erro de runtime
ou HTTP inesperado. Instrumentação/conta/certificado efêmeros removidos. Confirmação de e-mail,
provider e recuperação de senha continuam pendentes, e o Desktop não entra automaticamente no
polish visual.

## Auditoria pré-final do Desktop: bloqueios antes do polish visual

Auditoria diagnóstica concluída em 2026-08-14 sobre a `main`
`5ab38eda6d66d6440845d3f58dca3fb153bb23f8`, sem mudança de código de produto. Relatório completo
em `docs/desktop-pre-final-audit.md` e espelho em `.ai/specs/desktop-pre-final-audit.md`.

**Não iniciar o polish visual final antes de fechar a lista A do relatório.** Principais achados:
o `Dockerfile.api` não copia `patches/` e não reconstrói a imagem atual; o fluxo de confirmação de
e-mail não possui destino web/deep link end-to-end e recuperação de senha não existe; falha offline
no boot apaga sessão potencialmente válida; logout pode alegar revogação sem resposta do servidor;
o draft LCU anterior pode permanecer alimentando recomendações; o pós-game permite resposta de uma
partida sobrescrever outra; linguagem causal ainda aparece fora do comparativo factual; navegação e
origem dos IPCs Electron precisam ser restringidas. Links/status públicos e exclusão de conta também
estão inconsistentes entre Desktop e site.

O visual está estável: 11 telas × 1000/1280/1600 px, mais Obsidiana/compacta/reduzida, sem overflow
estrutural, console error, exception ou HTTP >= 400. Restam apenas itens LOW/POLISH de quebra de
texto, labels crus e marca. `release-etapa27c-v1` continua apontada como `ACTIVE` com hashes
esperados; bundle mais recente `EXACT_REPLAY`, sem divergências/dependências. Gates: version/Prisma/
typecheck/lint/build, 1.343 testes TS e analyzer 1/1 verdes (timeout transitório conhecido de `/docs`
na primeira execução paralela; API 353/353 na repetição). API pública, RSO, provider e dados globais
continuam bloqueados; release Desktop permanece `WITHDRAWN_PENDING_PUBLIC_API`.

## Etapa 31P: Dependabot high #44 (extract-zip) resolvido via patch local

O GitHub sinalizou `extract-zip` `GHSA-jmr9-qjv8-65gv`/`CVE-2026-56876` (CVSS 8.1, path
traversal por symlink com alvo não validado, `<= 2.0.1`) como alerta #44 depois do push da
Etapa 31O. Relatório completo em `docs/dependabot-extract-zip-2026-08.md`.

**Cadeia real, não achismo**: `extract-zip@2.0.1` só existe na árvore via
`electron@39.8.10` → `devDependency` de `apps/desktop` (confirmado: `electron` está em
`devDependencies`, nunca `dependencies`) → usado pelo próprio postinstall do pacote `electron`
(via `@electron/get`) pra descompactar o binário oficial do Electron baixado do GitHub Releases
da Electron. **Classificação: `BUILD_TIME_ONLY`** — roda uma vez em `pnpm install`, nunca em
produção; `devDependencies` não entram no `app.asar` (allowlist estrita desde a Etapa 30A); e o
zip processado é o release oficial do próprio Electron, não um arquivo de origem não confiável
no sentido descrito pelo advisório.

**A falha real, lida no código**: `extract-zip` valida que o **diretório** de cada entrada
(`destDir`) fica dentro da árvore de extração, mas nunca validava o **alvo** de uma entrada
symlink — `fs.symlink(link, dest)` rodava sem checar se `link` (caminho absoluto ou relativo tipo
`../../../../etc/passwd`) escapava do diretório de destino.

**Sem versão corrigida pra atualizar**: `first_patched_version: null` no advisory, confirmado no
registro do npm (`npm view extract-zip versions`) — a última versão publicada é `2.0.1`, de
2020-06-10; o pacote está sem release há mais de 5 anos. Não existe "atualizar pro mínimo
corrigido" possível aqui.

**Correção: patch local via `pnpm patch`** (`patches/extract-zip@2.0.1.patch`, registrado em
`package.json` → `pnpm.patchedDependencies` e no lockfile) — a menor mudança segura possível
dado que não há upgrade disponível. O patch espelha, de propósito, a mesma checagem de
contenção que o próprio `index.js` já usa pra `destDir` (`relativeDestDir.split(path.sep).
includes('..')`), agora aplicada ao alvo **resolvido** do symlink: caminho absoluto ou relativo
que escaparia do diretório de extração faz `extract-zip` lançar erro antes de criar o symlink,
em vez de criar silenciosamente. Nenhuma outra dependência foi tocada — o diff do lockfile é só
o registro do patch e o sufixo `patch_hash=...` nas duas referências de `extract-zip` dentro de
`electron@39.8.10`.

**Teste real do exploit, não só leitura de código**: `scripts/extract-zip-patch.test.ts` (3
testes, suíte raiz) monta um `.zip` mínimo cru (header local + diretório central + EOCD escritos
byte a byte, CRC-32 sem tabela — nenhuma lib de escrita de zip existia no projeto, e não valia
adicionar uma só pra isto) com uma entrada symlink e confirma: (1) alvo relativo que escapa
(`../../../../etc/passwd`) → rejeitado, nada criado; (2) alvo absoluto → rejeitado; (3) alvo
relativo legítimo dentro do diretório de extração → continua funcionando normalmente, provando
que o patch não quebrou o uso real do recurso. `extract-zip` entrou como devDependency explícita
da raiz (versão exata `2.0.1`, a mesma travada pelo patch) só pra esse teste importar o pacote —
não é usado por nenhum código de produto.

**`pnpm audit` continua acusando `extract-zip` como `high`, e isso é esperado**: audit/Dependabot
leem a **versão declarada** no lockfile (`2.0.1`), não o conteúdo patchado — não existe hoje
ferramenta de auditoria que entenda `pnpm.patchedDependencies` como remediação. O risco real (o
código que de fato executa) está fechado; o que pode continuar sinalizado automaticamente é só a
leitura de versão. Confirmado real, não presumido: `pnpm install` reconstruído do zero rodou o
postinstall real do `electron` (que de fato exercita `extract-zip` patchado, descompactando o
binário oficial) sem erro, e o arquivo instalado em `.pnpm/extract-zip@2.0.1_patch_has_.../
index.js` contém o trecho do patch.

**1343 testes** no monorepo (raiz **18** — eram 15 —, site 102, core 635, riot 97, api 353,
desktop 138) + analyzer 1/1, todos verdes. `typecheck`/`lint`/`build` completos nos 5 pacotes.
Nenhum arquivo de `apps/`/`packages/` fora do lockfile/patch/teste novo foi tocado — confirmado
por `git diff --stat` antes do commit.

**Erro real cometido e corrigido na própria sessão**: a primeira versão do teste declarou
`extract-zip` como `devDependency` **direta** da raiz só pra conseguir `import`. Isso criou um
**segundo alerta Dependabot** (#45, mesmo pacote/versão, `manifest_path: "package.json"` em vez
de `pnpm-lock.yaml`) — o oposto do pedido ("nenhum novo alerta relevante"). Corrigido num commit
separado (`d6e7085`): a declaração direta foi removida, e o teste passou a resolver o pacote via
`node:module` `createRequire`, subindo até o `package.json` real do `electron` (devDependency
existente de `apps/desktop`) e criando um `require` ancorado ali — o mesmo caminho de resolução
que o próprio `electron` usa em produção, sem declarar nada novo em manifesto nenhum do
monorepo. Confirmado via API depois dos dois pushes: **#45 foi pro estado `fixed`
automaticamente** (a declaração que o gerou deixou de existir), sem precisar de dispensa manual.

**Estado final confirmado via `gh api repos/.../dependabot/alerts`**: `#44` → `dismissed`
(`tolerable_risk`, comentário registrando a mitigação real); `#45` → `fixed`; **0 alertas
abertos no repositório** (`gh api "repos/.../dependabot/alerts?state=open"` → array vazio).
`DEPENDABOT_HIGH_RESOLVED`.

## Etapa 31O: refino tipográfico e largura de conteúdo do site

Pedido explícito do usuário logo após a 31N: **não** um redesign — passe exclusivo de largura de
texto, tipografia, comprimento de linha, hierarquia e ritmo vertical sobre `apps/site`.
Screenshots e efeitos visuais ficaram deliberadamente de fora (etapa futura). Relatório completo
em `docs/site-typography-width.md`.

**Diagnóstico real, não achismo**: inspeção de `tokens.css`/`site.css`/das 10 páginas HTML
confirmou a causa concreta — `.sp-container--prose` + `.sp-prose` (68ch) era compartilhada por
duas categorias de conteúdo bem diferentes: as 4 páginas legais (densas, escaneadas por título
numerado) **e** o corpo de "Como funciona" (explicativo, lido de ponta a ponta). `.sp-hero__copy`
(texto do herói da home) travava em `46rem` fixo mesmo **não competindo** por espaço com a
captura — confirmado no HTML que os dois são blocos empilhados, não lado a lado, então a trava
deixava até ~500px vazios ao lado em desktop grande. `funcionalidades.html` usava `.sp-container`
(1200px) na seção de pilares, enquanto a seção idêntica da home já usava `.sp-container--wide`
(1400px) para o mesmo componente — inconsistência sem motivo técnico.

**Quatro categorias de largura de leitura, novas em `tokens.css`** — cada uma com propósito de
leitura documentado, não só estético: `--measure-compact` (34ch, selo/legenda/blurb curto),
`--measure-marketing` (62ch, subtítulo/lede — punchy, poucas linhas), `--measure-editorial` (74ch,
corpo explicativo lido linearmente) e `--measure-legal` (86ch, prosa densa **escaneada** por
seção numerada, aceita linha mais larga sem perder conforto porque não é lida linha a linha).
`.sp-container--prose` (legal + `status.html`) passou a usar `--measure-legal`; nova classe
`.sp-container--editorial` (só em `como-funciona.html`) usa `--measure-editorial`; `.sp-prose`
deixou de definir a própria largura (só tipografia agora — evita duas fontes de verdade
competindo na mesma propriedade). `.sp-section__head` 62ch→74ch, `.sp-lede`/`.sp-hero__sub`
60/54ch→62ch, `.sp-cta h2` 22ch→26ch, `.sp-footer__brand p` tokenizado (mesmo valor, 34ch).

**Hero da home**: `max-width: clamp(46rem, 32vw + 22rem, 58rem)` no lugar do `46rem` fixo — o
mínimo preserva o valor antigo em telas menores (nunca mais estreito que antes), cresce com a
viewport, teto em 928px. Medido: 736px→761,6px em 1280px, →928px em 1920px. O título continua
quebrando em duas linhas de propósito (`.sp-hero__accent { display: block }`, a linha crimson de
destaque) — isso é identidade visual, não efeito colateral de largura estreita, e não foi tocado.

**`funcionalidades.html`**: seção de pilares (8 itens) trocou `.sp-container` por
`.sp-container--wide`, alinhando com o mesmo componente já usado na home — sem reconstruir o
grid (`repeat(auto-fit, minmax(232px,1fr))` intocado, "não reconstruir se já funciona"). Medido:
1265px→1400px, cabendo 5 colunas em vez de 4 no mesmo espaço de tela.

**Ritmo vertical reduzido seletivamente**: `--space-9/10/12/14` (os degraus **grandes** — padding
de seção, gap do showcase, margem do rodapé, padding do herói/CTA) caíram 14-21%
(56→48, 72→60, 104→84, 136→108). `--space-1` a `--space-8` (espaço **dentro** de card/botão/linha)
ficaram intocados de propósito — a ideia era cortar o excesso **entre** blocos, não comprimir o
site inteiro; como os quatro tokens grandes já alimentavam várias propriedades de uma vez
(`padding-block` de `.sp-section`/`.sp-section--tight`, `margin-bottom` de `.sp-section__head`,
`padding-block` do herói, `gap` do showcase, `padding` do CTA, `margin-top` do rodapé), a redução
chegou a todas elas sem editar cada regra individualmente.

**Tensão resolvida no pedido**: a mensagem pedia "não adicionar animações" e, ao final, "mais
elementos interativos/transições ao rolar a página" — contradição direta. Resolvido pelo caminho
mais conservador: o site já tinha um mecanismo de _reveal_ ao rolar (`data-reveal` +
`IntersectionObserver`, `layout.ts`, desde a Etapa 31M, com guarda de `prefers-reduced-motion` e
sem esconder conteúdo sem JS), mas cobria só a home. Estendido a 8 seções em 6 páginas internas
(`como-funciona`, `funcionalidades`, `privacidade`, `termos`, `seguranca`, `excluir-conta`,
`status`, `suporte`) — zero código novo, zero biblioteca, zero animação nova, só ampliação de
cobertura de uma animação já existente e já aprovada.

**Nada tocado fora do escopo**: identidade Spartan Signal, paleta, screenshots, máscaras de
conta, header/nav, comportamento do Caddy, rotas, API, autenticação, tickets, Desktop,
infraestrutura, conteúdo legal/factual — confirmado por leitura direta do DOM que os marcadores
`[Revisão jurídica necessária]` seguem presentes e intocados. `.sp-showcase__row` (coluna estreita
ao lado da captura) não foi alterada, por exclusão explícita de screenshots/efeitos desta etapa.

**Validado no dev server real** (Vite) via `getComputedStyle`/`getBoundingClientRect` — não
captura de tela (Browser pane sem composição de frame nesta sessão, mesma limitação já registrada
na Etapa 31M): as 9 páginas públicas reais em 390px (0/9 overflow); home/como-funciona em 360px;
home/como-funciona/funcionalidades/privacidade em 768/1280/1920px; home/funcionalidades em
1440px — **zero overflow em todas as combinações**, valores medidos batendo com o cálculo
esperado em cada caso. Um artefato da própria ferramenta de automação foi contornado durante a
validação (`resize_window` sem navegação completa em seguida deixava expressões `vw` dentro de
`clamp()` presas na largura anterior — resolvido navegando a página depois de cada resize antes
de medir; não é comportamento do site). Reveal confirmado funcionando como desenhado: neste
ambiente `prefers-reduced-motion: reduce` é `true` por padrão, e a guarda pulou a animação
corretamente (conteúdo em `opacity: 1`) nas 8 seções novas, mesmo comportamento já documentado
na 31M. Zero erro de console.

**Nenhum teste novo**: mudança 100% CSS/atributo de apresentação, sem comportamento novo pra
cobrir — os 102 testes já existentes do site (nenhum fixava valor de `ch`/`px`) continuaram
passando sem alteração. **1340 testes** no monorepo (raiz 15, site 102, core 635, riot 97, api
353, desktop 138) + analyzer 1/1, mesmo total de antes da etapa. `typecheck`/`lint`/`build`
completos nos 5 pacotes.

## Etapa 31N: rotas públicas limpas e Central de Suporte

Site já publicado e com infraestrutura funcional (domínio, HTTPS, Caddy, Docker, healthcheck,
`suporte@spartagg.com.br` operacional, MX/SPF/DKIM/DMARC). Esta etapa mexeu **só na arquitetura
de rotas públicas e numa página nova** — nenhum backend criado. Relatório em
`docs/public-routes-and-support.md`.

**Estratégia de URL limpa, e por que não a "óbvia"**: a saída em diretório
(`/como-funciona/index.html`) é a que o pedido preferia, mas o `file_server` do Caddy
canonicaliza diretório para **barra final** — a URL pública viraria `/como-funciona/`, e forçar a
versão sem barra exigiria `try_files` **mais** um redirect de `/x/` → `/x`, senão as duas
responderiam 200 e haveria canônico duplicado. Escolhido então **arquivo plano +
`try_files {path} {path}.html`**: entrega exatamente `/como-funciona`, com **zero mudança de
build**, e sem duplicata (a versão `.html` responde 301 em vez de servir). Trade-off registrado:
as URLs limpas dependem do `infra/Caddyfile` — que vive neste repositório, ao lado do site.

**Open redirect evitado por construção**: o regex do redirect é `^/([^/].*)\.html$`, não
`^/(.+)\.html$`. Com o segundo, `//exemplo.com/x.html` seria capturado como `exemplo.com/x` e o
`Location` sairia `//exemplo.com/x` — protocol-relative, ou seja, open redirect. Testado contra o
Caddy real com `//evil.com/x.html`, `///evil.com/x.html` e `/%2F%2Fevil.com/x.html`: as três
colapsam para `Location: /evil.com/x`, caminho de barra única na própria origem.

**Sem laço, por ordem de diretiva**: `redir` roda **antes** de `try_files` no Caddy. `/pagina.html`
redireciona uma vez; `/pagina` não casa o matcher e é resolvido por reescrita **interna** (200),
que não reentra no redirect. Medido: **1 salto, sempre**. `/404.html` fica fora do redirect de
propósito — é página de erro do `handle_errors`, não rota.

**Central de Suporte** (`/suporte`, nova): 6 categorias dizendo _o que enviar_ (com link para
`/excluir-conta`, `/seguranca` e `/privacidade` quando a página dedicada existe),
`suporte@spartagg.com.br` em destaque e CTA `mailto:` com assunto pré-preenchido. **Sem
`<form>`/`<input>`/`<textarea>`/`<button>`** — travado por teste, porque não existe backend de
tickets e formulário que não envia é pior que nenhum. **Nenhum SLA inventado**: a página declara
explicitamente que não há prazo de resposta comprometido publicamente.

**Rodapé** reestruturado em Produto / Confiança / Conta / Suporte. A grade só vira marca + 4
colunas a partir de **1180px** — abaixo disso a coluna ficaria com ~140px e o e-mail (23
caracteres) transbordaria. O header **não** ganhou "Suporte": 4 itens + CTA já é a hierarquia
certa, e a Central fica no rodapé, que é onde se procura suporte.

**Validação HTTP real, não presumida**: o bloco do site foi extraído do `infra/Caddyfile` byte a
byte (só o endereço trocado para `:8081`, sem TLS) e rodado em container `caddy:2-alpine` sobre o
`dist`. `caddy validate` → _Valid configuration_. 8 legados `.html` → **301** com Location correto;
`/index.html` → **301 → `/`**; 9 rotas limpas → **200**; `/rota-inexistente` → **404** servindo o
404 do site com `noindex`; CSP/HSTS/X-Frame-Options/X-Content-Type-Options presentes na resposta.

**Nota metodológica**: a varredura de layout (10 páginas × 5 larguras = **50/50 sem overflow**,
zero imagem quebrada, zero estilo inline, zero link `.html` no DOM, e-mail sem transbordar) rodou
contra o **dev server**, não contra o container: a CSP de produção tem `frame-ancestors 'none'` e
o navegador se recusa a enquadrar as páginas servidas pelo Caddy. Isso é o comportamento correto e
acabou servindo de confirmação de que o hardening está ativo — markup e CSS são os mesmos.

**Ausências deliberadas, travadas por teste**: nenhuma página linka para `/login`, `/criar-conta`,
`/register`, `/conta` ou `/conta/tickets`, e esses arquivos não existem. Nenhuma página "em breve"
foi criada. API pública continua desligada; autenticação web, sessão, JWT, banco de usuários e
backend de tickets **não** foram implementados. A possibilidade de conta única
(Desktop + site + suporte) e de `/conta/tickets` existe **só na documentação**, sem data.

**Caddy alterado no mínimo**: duas adições (`redir` + `try_files`), nada removido. TLS automático,
HTTP→HTTPS, `www`→apex, todos os headers, CSP, `encode`, `handle_errors`, o bloco reservado da
futura API e `/healthz` preservados — conferido por teste que lê o `Caddyfile`.

**1340 testes** (raiz 15, site **102** — eram 58 —, core 635, riot 97, api 353, desktop 138) +
analyzer 1/1, todos verdes numa única execução. `typecheck`/`lint`/`build` completos nos 5 pacotes.

## Etapa 31M: redesign visual do site público — identidade "Spartan Signal"

Primeira etapa executada com o site **já publicado** em `spartagg.com.br` (confirmado nesta sessão:
HTTP 200, TLS válido; MX `mx1/mx2.hostinger.com` existe). Redesign completo de `apps/site` —
**nenhuma alteração de infraestrutura** (Caddyfile, Dockerfile.site, DNS, MX, API, Postgres, Redis,
auth, RSO, Desktop intocados). Relatório em `docs/site-visual-identity.md`.

**Identidade por geometria, não por arte temática**: ponta de lança (marcador de seção, bullet,
separador, nó de estágio), `--chamfer` cortando canto superior direito e inferior esquerdo (frames
de captura, CTA), linha de formação (réguas que não fecham nas pontas), nós de status, e
`--font-mono` versal em todo rótulo/status — é o que faz o site ler como instrumento em vez de
panfleto. Raio quase zero (`--radius-xs: 2px`).

**A regra de contraste é a decisão de paleta mais importante e não é intercambiável**: Crimson
`#E21D2E` dá **4,2:1** sobre Obsidian — passa AA só em texto GRANDE; Signal `#FF3347` dá **5,6:1** e
passa em texto normal. Por isso `--crimson` é preenchimento/borda/nó/título e `--signal` é link e
texto pequeno. Trocar um pelo outro quebra acessibilidade; está comentado nos tokens. Medido no
navegador: 14 elementos de texto, **0 reprovados** (o limite real apareceu em `.sp-hero__accent`,
46px, 4,24:1 — passa por ser texto grande).

**Três achados reais, todos já no ar:**

1. **`BLOQUEANTE` — o Riot ID estava exposto.** A home afirmava "identidade da conta usada nos
   testes removida das imagens", mas as 3 capturas publicadas mostravam `Zekerus#117` legível (em
   ~24px no Dashboard; no topbar e no rodapé da sidebar nas outras duas). Vazamento + afirmação
   falsa simultâneos. Corrigido com máscara **localizada** por **detecção automática do bounding
   box** do texto claro dentro de janelas estreitas que excluem o monograma do avatar — em vez de
   coordenadas chutadas sobre dado real. Preservados: `Servidor BR1 · americas · Suporte` (região e
   rota, não identificador), números, KDA, datas, campeões, itens, estados. Conferência objetiva:
   **0 pixels quase-brancos restantes** nas janelas de topbar/sidebar.
2. **21 estilos inline eram descartados pela CSP em produção.** A CSP servida pelo Caddy é
   `style-src 'self'` **sem** `unsafe-inline`, então atributo `style=` nunca foi aplicado no site
   publicado — ele renderizava diferente do que o código sugeria, e isso funcionava em dev. Todos
   eliminados; o design system não usa nenhum. Travado por teste, um por página.
3. **75px de overflow horizontal em todas as 9 páginas a 390px.** Achado pela varredura de
   larguras, não por inspeção. `.sp-footer__grid` misturava trilha explícita
   (`minmax(240px, 1.4fr)`) com `repeat(auto-fit, minmax(150px, 1fr))` — combinação que **não
   quebra linha**, o auto-fit segue criando trilhas além do container. Reescrito mobile-first e
   explícito. As demais grades usam `auto-fit` puro, que não tem o problema.

**Achado menor**: `tokens.css` declarava `Manrope` sem nunca carregar a fonte (ela só existe no
Desktop, via Google Fonts). O site sempre renderizou em fonte de sistema alegando outra coisa —
agora a stack é explícita e honesta (a CSP `default-src 'self'` bloquearia fonte externa de todo
jeito).

**Decisão de UX documentada**: o pedido previa "showcase" e "capturas reais" como seções separadas,
mas só existem 3 capturas — duas seções repetiriam imagem. Fundidas em "Produto real": Dashboard no
hero, Champion Select e Pós-game no showcase, **cada captura aparecendo exatamente uma vez**. Para
legibilidade (UI de 1280×820 com texto de ~13px), o hero usa a captura em **0,85 da escala nativa**
e o showcase usa coluna de texto estreita (260–330px) + captura ocupando o resto; abaixo de 1100px
empilha com o texto primeiro.

**Nenhum CTA de download** enquanto a release 0.9.0 segue retirada — travado por teste, junto com
ausência de link morto, de classe órfã e de métrica fictícia.

**Validado por medição, não por olho**: 9 páginas × 5 larguras (360/390/768/1280/1920) = **45/45
sem overflow**, 0 imagem quebrada, 0 estilo inline, header/footer montados; menu mobile alternando
`aria-expanded` false→true e `display` none→flex; **0 erro de console**. O reveal (IntersectionObserver)
tem guarda: o estado escondido só existe sob `html[data-reveal-ready]`, escrito pelo próprio JS —
sem JS, nada fica invisível; confirmado em execução com `prefers-reduced-motion: reduce`, em que o
reveal é corretamente pulado e os 6 blocos ficam em `opacity: 1`.

**Limitação registrada**: screenshot da página construída **não foi possível** nesta sessão (a
Browser pane não estava sendo exibida e o compositor não gera frames nesse estado). A validação
cobriu geometria, contraste, responsividade e comportamento por DOM/CSSOM, mas **não substitui
conferência estética humana** — recomendado abrir o site após o deploy.

**Preservado por compliance**: os dois avisos legais da Riot em `termos.html` §11.1/§11.2 verbatim
(só a apresentação mudou, via `.sp-callout--legal`); a referência de não-afiliação no rodapé; todo
o texto das páginas legais, incluindo os marcadores `[Revisão jurídica necessária]` — a migração
dessas páginas foi mecânica de propósito para o diff provar que o conteúdo não foi tocado.

**Pendência real**: `suporte@spartagg.com.br` foi publicado no rodapé por instrução explícita e com
MX confirmado, mas **MX existir não prova que a caixa existe** — o responsável precisa confirmar que
ela está criada e sendo lida, senão mensagens de suporte se perdem em silêncio.

**1296 testes** TypeScript (core 635, riot 97, api 353, desktop 138, site 58, raiz 15) + analyzer
1/1. `apps/api` reproduziu a flakiness já documentada desde a Etapa 26b sob execução paralela
(`/docs existe em desenvolvimento`) e passou **353/353 isolado**, sem alteração de código.

## Etapa 31L.1: remediação dos disclaimers Riot no site e Desktop — `RIOT_DISCLAIMERS_COMPLIANT`

Pedido explícito do usuário, motivado diretamente pelas duas pendências que a própria Etapa 31L
encontrou: o site publicava só o disclaimer do Legal Jibber Jabber, faltava o disclaimer
específico da política de Desenvolvedor de League of Legends, e o Desktop não tinha disclaimer
nenhum da Riot em lugar algum. Etapa **exclusivamente de correção desses dois pontos** — nenhuma
funcionalidade, motor, UX principal ou infraestrutura tocada além disso.

**Fontes relidas antes de editar texto**: `developer.riotgames.com/docs/lol` (disclaimer
específico de LoL) e `riotgames.com/en/legal` (Legal Jibber Jabber), ambas em 2026-08-08.
Cross-verificado via busca independente que a sentença de marca registrada ("Riot Games and all
associated properties are trademarks or registered trademarks of Riot Games, Inc.") realmente
faz parte do texto oficial do disclaimer de LoL, e não era um artefato do fetch.

**Site** (`apps/site/termos.html` §11, reescrito de "11. Aviso legal" pra "11. Avisos legais"):
§11.1 preserva o texto já publicado desde a Etapa 31K (Legal Jibber Jabber, verbatim). §11.2 é
novo — o disclaimer específico de LoL, também verbatim em inglês + tradução em português — com
uma frase explícita de que as duas políticas são exigências distintas que não se substituem
(o Sparta usa a API Riot com key, não é só um "fan asset project", por isso as duas se aplicam
simultaneamente, achado da própria 31L). Fonte/data de consulta citadas com link real pras duas
páginas. O rodapé global (`apps/site/src/scripts/layout.ts`, `RIOT_DISCLAIMER`, agora exportado
pra teste) virou uma referência curta de não-afiliação apontando pros Termos de Uso, presente nas
9 páginas — nunca escondido em tooltip, modal, comentário HTML ou página sem link.

**Desktop** (`apps/desktop/src/renderer/src/features/AboutSection.tsx`, novo; wired como terceira
aba "Sobre" em `SettingsScreen.tsx`, ao lado de Tema e Análise): nome do produto, versão real
(`window.sparta.version`, já exposta pelo preload desde sempre), três botões `disabled` (não
âncoras) rotulados "Em preparação" pros links futuros de site/privacidade/termos — nenhum aponta
pra `localhost` nem usa o GitHub como substituto, conforme instrução explícita — e os dois
disclaimers embutidos como **constantes literais no arquivo** (mesmo texto exato do site), o que
os torna disponíveis **offline**, sem nenhuma chamada de rede/API. CSS novo (`AboutSection.css`)
reusa só tokens já existentes (superfície, borda, espaço, tipografia) — nenhum token novo, nenhuma
quebra do glassmorphism/tema/densidade da Etapa 31K.1.

**Auditoria de linguagem** (seção 9 do pedido): busca em todo `apps/` por `oficial`/`aprovado`/
`parceiro`/`endorsed`/`sponsor`/`partner`. Toda ocorrência é ou (a) parte da negação explícita do
próprio disclaimer ("não é... aprovado... parceiro da Riot Games"), ou (b) rótulo técnico de
proveniência de dado já existente desde a Etapa 8/19 (ex. badge "Fonte oficial Riot" no resumo de
patch, que descreve de onde vieram as notas oficiais da Riot — não uma claim de que o Sparta é
produto oficial). Nenhuma correção funcional foi necessária; nenhum texto histórico foi alterado.

**26 testes novos**: `AboutSection.test.tsx` (7 — os dois textos verbatim, coexistência, ausência
de rede, ausência de link localhost/GitHub, botões desabilitados não são âncoras, nenhuma
afirmação de afiliação fora de negação, versão exibida), `SettingsScreen.test.tsx` (2 — a aba
Sobre é alcançável e ativável por teclado via `role="tab"` nativo, os textos aparecem sem chamada
de rede), `layout.test.ts` (4 — `RIOT_DISCLAIMER`/`renderFooter` puros, sem link localhost/
GitHub), `disclaimers-content.test.ts` (13 — lê as 9 páginas HTML reais do disco via `fs`, sem
precisar de jsdom pra isso: nenhuma contém `localhost`/`github.com`, os dois disclaimers
coexistem verbatim em `termos.html`, nenhum escondido dentro de comentário HTML).

**Bug de teste, não de produto, corrigido no caminho**: a primeira versão de dois testes usava
`getByText(/Legal Jibber Jabber/)` esperando um único match, mas a frase aparece 2x de propósito
(no rótulo da seção e dentro do próprio texto oficial) — corrigido para `getAllByText` com
`length >= 2`, e a asserção de "nenhuma claim de parceria" foi reescrita pra checar a presença da
frase de negação exata em vez de tentar provar ausência de substrings que legitimamente aparecem
dentro da própria negação.

**`apps/site` ganhou infraestrutura de teste que não existia** (`vitest.config.ts` novo, jsdom
como devDependency nova — necessário porque `layout.ts` roda `mount()` no carregamento do módulo,
que referencia `document`). `pnpm-lock.yaml` mudou só por isso, confirmado por `git diff`.

**Validado real, não só buildado**: site no dev server (Vite), `termos.html` e o rodapé
conferidos via `get_page_text`/`getComputedStyle`, zero erro de console em nenhuma página tocada.
Desktop no **Electron real via CDP** (mesma metodologia da Etapa 31J/31K.1 — `remote-debugging-
port` temporário em `main/index.ts`, revertido antes do commit com diff líquido zero confirmado
por `git diff`; login real via `window.sparta.session.set` com token HMAC assinado pelo mesmo
`AUTH_TOKEN_SECRET` do container Docker): navegação até Configurações → Sobre, os dois
disclaimers renderizados por completo (confirmado por screenshot), `getComputedStyle(...)
.backdropFilter === "blur(20px)"` no card, confirmando que o glassmorphism da Etapa 31K.1
continua intacto sobre a seção nova, botão "Site institucional" com `disabled === true`
confirmado via DOM, **zero erro de console, zero exceção não tratada**.

**Dossiê da Etapa 31L atualizado, só para registrar a correção** (instrução explícita: não
marcar `READY_TO_SUBMIT`): `docs/riot-policy-compliance-matrix.md` — item "Disclaimer" passou de
`COMPLIANT_WITH_LIMITATION` pra `COMPLIANT`, resumo da seção 4 recontado (13 `COMPLIANT`, 3
`COMPLIANT_WITH_LIMITATION`, o resto inalterado). `docs/riot-production-application.md` §19
reescrita para descrever o estado corrigido. `docs/riot-submission-checklist.md` — item de
disclaimer marcado `[x]`, nova seção 38 documentando a correção com evidência, texto do estado
final ajustado pra deixar claro que os bloqueios remanescentes (domínio, site publicado, e-mail
de suporte, revisão final do responsável) são **todos de infraestrutura**, não de conteúdo legal.
Os três espelhos em `.ai/specs/` foram sincronizados byte a byte com `docs/`.

**Não regressão**: nenhum arquivo de `packages/`/`apps/api`/lógica de `apps/desktop` fora dos
tocados (`SettingsScreen.tsx`, `AboutSection.tsx`/`.css`/`.test.tsx`) foi alterado. Confirmado
direto no Postgres real desta sessão: `release-etapa27c-v1` `ACTIVE`, `artifactHash`
(`8878a657…`) e `configHash` (`fa9dbde1…`) **idênticos** aos documentados desde a Etapa 27c,
ponteiro conferindo. `pnpm typecheck`/`lint`/`build`/`test` completos nos **5 pacotes**
TypeScript (core 635, riot 97, api 353, desktop 138, site 17 — **1240 testes** no total) +
analyzer Python 1/1, todos verdes.

**Estado final: `RIOT_DISCLAIMERS_COMPLIANT` + `RIOT_APPLICATION_PACKAGE_READY` +
`BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING` + `BLOCKED_BY_PUBLIC_SITE` +
`BLOCKED_BY_SUPPORT_EMAIL`.** Os dois avisos legais aplicáveis da Riot estão presentes no site e
no Desktop; nenhuma claim pública sugere afiliação/aprovação; o dossiê registra a correção sem
avançar o estado de submissão. Estados não usados, como instruído: `SUBMITTED_TO_RIOT`,
`RIOT_APPROVED`, `READY_TO_SUBMIT`. **Nada foi submetido à Riot; nenhum domínio, VPS ou e-mail
foi provisionado.** Próximos passos, na mesma ordem já registrada pela Etapa 31L: responsável
registra domínio + contrata VPS/e-mail → retomar a Etapa 31K só para publicação real → validação
externa completa do site publicado → revisão final do dossiê pelo responsável → só então
submissão.

## Etapa 31L: dossiê final para submissão Production à Riot — `RIOT_APPLICATION_PACKAGE_READY`

Pedido explícito do usuário: preparar (sem enviar) o pacote completo de submissão do Sparta GG
para uma Production API Key da Riot. Etapa **100% documental** — nenhum arquivo de `packages/`
ou `apps/` foi tocado, confirmado por `git status` antes de fechar (só 4 arquivos novos em
`docs/`, mais os espelhos em `.ai/specs/`). Quatro documentos entregues: `docs/riot-production-
application.md`, `docs/riot-policy-compliance-matrix.md`, `docs/riot-api-inventory.md`,
`docs/riot-submission-checklist.md`.

**Políticas revalidadas contra fontes oficiais atuais, não contra o histórico deste repositório**
(instrução explícita do pedido) — 9 fontes consultadas em 2026-08-07 via web, cada uma com URL,
data de última atualização informada pela Riot (quando exposta) e regra extraída: General
Policies (`developer.riotgames.com/policies/general`, última atualização 11/mar/2025 — registro
de produto, monetização, segurança de API key), Game Specific/Developer API Policy de League of
Legends (`developer.riotgames.com/docs/lol#game-policy` — regras de Game Integrity, casos de uso
não aprovados, texto do disclaimer obrigatório), Legal Jibber Jabber
(`riotgames.com/en/legal`, última atualização ago/2018 — disclaimer de conteúdo de fã e o
carve-out explícito pra produtos comerciais com API key válida), RSO (Riot Sign-On — exige
Production Key aprovada antes de qualquer acesso), mudança da política da LCU API
(`riotgames.com/en/DevRel/changes-to-the-lcu-api-policy`, publicado 24/jan/2019 — contato prévio
obrigatório com a Riot antes de lançar/atualizar app que usa a LCU, restrição a endpoints de uma
lista aprovada), e PUUID/camada de segurança (PUUID é criptografado e específico por API key —
rotação de key invalida o mapeamento). **Duas fontes retornaram HTTP 403** por exigirem login no
portal de suporte da Riot (API Terms and Conditions completo, espelho autenticado das General
Policies) — registrado como limitação explícita que o responsável precisa fechar com a própria
conta antes do envio real, não escondido nem contornado.

**Achado real que corrige uma decisão da própria Etapa 31K**: o site publica, desde a 31K, só o
disclaimer do Legal Jibber Jabber ("Sparta GG was created under Riot Games' 'Legal Jibber
Jabber' policy..."). A releitura contra a fonte oficial nesta etapa mostrou que essa mesma
política declara explicitamente uma categoria separada — _"commercial Projects that both (1)
comply with our API Terms and API Policies; and (2) use a currently valid Riot API key"_ — e que
a política específica de LoL exige **seu próprio** texto de disclaimer ("[Your Product Name] is
not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone
officially involved in producing or managing Riot Games properties."), **não intercambiável** com
o primeiro. Os dois precisam coexistir no site (o Sparta usa a API Riot, não é só um "fan asset
project"), e nenhum disclaimer existe hoje dentro do próprio aplicativo Desktop (confirmado por
busca no código-fonte, zero ocorrência) — as duas correções ficaram registradas como pendência no
checklist, não corrigidas nesta etapa por ser puramente documental.

**Matriz de conformidade completa** (`docs/riot-policy-compliance-matrix.md`) cobrindo 20 regras
— registro do produto, uso de APIs suportadas, HTTPS, segurança de API key, uso da LCU
(`NEEDS_RIOT_REVIEW`: pedir confirmação explícita de que os 3 endpoints de leitura usados estão
na lista aprovada da Riot, já que essa lista não é pública), integridade competitiva, apoio à
decisão vs. decisão automática, múltiplas opções, dados previamente visíveis, dados pessoais,
match history, RSO, identidade, monetização, disclaimer, propriedade intelectual, screenshots,
atualização futura de features. Resultado: 12 `COMPLIANT`, 4 `COMPLIANT_WITH_LIMITATION` (nenhum
por falha de implementação — HTTPS de produção real ainda não provisionado, API Terms completos
não relidos por causa do 403, disclaimer incompleto, todos com ação clara), 1 `NOT_APPLICABLE`
(monetização), 2 `BLOCKED` esperados e corretos nesta fase (registro do produto e RSO — só se
resolvem depois da aprovação da Riot, não antes), 1 `NEEDS_RIOT_REVIEW`. **Zero
`BLOCKED_BY_POLICY_REMEDIATION`** — nenhuma inconformidade irremediável foi encontrada.

**Auditoria de código, não de memória do projeto** (confirmando cada zero técnico exigido pelo
pedido com evidência direta, não com o histórico já documentado em etapas anteriores): único
método HTTP usado em `packages/riot/src/lcu/read-only-client.ts` é `"GET"` (LCU write
operations = 0, confirmado por busca textual no arquivo inteiro); zero handler IPC em
`apps/desktop/src/main/index.ts` envia comando ao League Client (os 6 handlers existentes são
`session:get/set/clear`, `riot-auth:open`, `download-skin`, `lcu-state` — automatic champion
selection = 0, automatic lock-in = 0); `RIOT_API_KEY` só existe em 5 arquivos de `apps/api`,
busca em todo o repositório confirma zero ocorrência em `apps/desktop`; zero ocorrência de "win
probability"/"chance de vitória"/"melhor campeão"/"counter pick"/"calculadora de MMR/ELO" fora de
**negação explícita** já existente na própria interface (`PostGameScreen.tsx`/
`PreGameScreen.tsx` dizem literalmente "não é... chance de vitória"); zero asset de campeão/item/
runa/splash da Riot commitado no repositório ou embutido no binário — tudo buscado ao vivo da CDN
pública da Data Dragon/Community Dragon em tempo de execução (busca por todo arquivo de imagem
versionado: só o ícone próprio do Sparta e 3 screenshots).

**Revisão contraditória de linguagem** (seção 33 do pedido, perspectiva de auditor Riot): todos
os termos de risco listados no pedido (win probability, MMR/ELO, counter, best champion, IA que
decide, informação oculta, meta global) foram buscados no código e no site. Toda ocorrência
encontrada está em posição de **negação explícita** do comportamento proibido — nenhuma correção
funcional foi necessária. Única recomendação editorial (não funcional): qualificar a palavra
"automatic" com "read-only"/"detection"/"no action taken" nas descrições em inglês do Developer
Portal, já aplicado nas descrições finais do dossiê.

**Inventário de dados definitivo** (`docs/riot-production-application.md` §12): 10 categorias de
dado, cada uma com fonte/finalidade/retenção/visibilidade — conta Sparta, Riot ID, PUUID (com a
nota de que é específico por API key), região, histórico de partidas, participantes de partida,
observações de loadout, draft observado, estatísticas agregadas pessoais, catálogo estático da
Data Dragon. Nenhum dado global de outros jogadores fora de uma partida compartilhada.

**Inventário de APIs** (`docs/riot-api-inventory.md`): Account-V1 (2 endpoints), Match-V5 (3
endpoints), Data Dragon, Community Dragon (fallback opcional), LCU (3 endpoints de leitura), RSO
(futuro) — cada um classificado `REQUIRED`/`OPTIONAL`/`FUTURE`, com evidência de onde é chamado
no código. Explicitamente **não solicitadas**: League-V4, Spectator-V5, Tournament-V4/V5,
Clash-V1, Champion-Mastery-V4 — nenhuma é usada em código algum. Estimativa de tráfego modelada
(piloto/100/1000 usuários, baseada nas constantes reais de `riot-sync-service.ts`:
`DEFAULT_MAX_NEW_MATCHES=20`, `MAX_NEW_MATCHES_CEILING=50`), explicitamente **não** representando
usuários reais. Tratamento real de rate limit documentado (429/`Retry-After`/backoff/interrupção
de rodada/cache/dedup/stale por categoria), tudo já implementado e testado, nada prometido sem
existir.

**Checklist bloqueante** (`docs/riot-submission-checklist.md` §32): estado **`DO_NOT_SUBMIT`** —
faltam domínio registrado, site publicado, Privacy/Terms públicos, disclaimer completo (as duas
correções encontradas), suporte funcional, fluxo de exclusão público, `riot.txt`, e revisão final
do responsável. Os itens que dependiam só desta etapa (screenshots sanitizados, site correspondendo
ao produto, descrição final, inventário de API, zero secret no Desktop, zero feature proibida
anunciada) já estão marcados prontos.

**Não regressão**: como nenhum arquivo de `packages/`/`apps/` foi tocado (confirmado por
`git status` antes de fechar), a ausência de diff já é a prova — não foi necessário reexecutar a
suíte completa. Confirmado direto no Postgres real desta sessão: `release-etapa27c-v1` `ACTIVE`,
`artifactHash`/`configHash` idênticos aos documentados desde a Etapa 27c, ponteiro conferindo.

**Estado final: `RIOT_APPLICATION_PACKAGE_READY` + `BLOCKED_BY_PUBLIC_SITE` +
`BLOCKED_BY_SUPPORT_EMAIL` + `BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING`.** O conteúdo do
dossiê está pronto para revisão final do responsável; o que falta não é mais preparação, é
publicação real do site (mesmo bloqueio da Etapa 31K) e as duas correções de disclaimer
identificadas nesta etapa. Estados não usados, como instruído: `SUBMITTED_TO_RIOT`,
`RIOT_APPROVED`, `PRODUCTION_KEY_GRANTED`, `RSO_READY`. **Nada foi submetido à Riot.** Próximos
passos, na ordem correta: responsável registra domínio + contrata VPS/e-mail → retomar a Etapa
31K só para publicação real → validação externa completa do site publicado → aplicar as duas
correções de disclaimer → revisão final do dossiê pelo responsável → só então submissão.

## Etapa 31K.1: glassmorphism no site e no Desktop

Pedido do usuário entre a 31K e a 31L: aplicar glassmorphism tanto no site institucional quanto
no app Desktop. Etapa **100% CSS** — nenhum arquivo TypeScript, rota ou lógica de domínio
tocado. Relatório completo em `docs/glassmorphism.md`.

**Os três ingredientes de vidro, aplicados juntos** (sem os três não lê como "vidro"):
translucidez (fundo com alpha), `backdrop-filter: blur(...)` (o que de fato desfoca o que está
atrás — sem isso translucidez sozinha só suja a superfície) e borda clara + realce interno
(`rgba(255,255,255,0.08)` de borda, `inset 0 1px 0 rgba(255,255,255,0.05)` no topo, luz pegando a
borda do vidro). Um quarto ingrediente silencioso e necessário: **fundo com cor por trás pra
desfocar** — sem isso o blur roda sem produzir efeito visível nenhum.

**Onde foi aplicado, e onde não** (deliberado): superfícies lidas como painel/contêiner
flutuando — cards, tabela, sidebar, topbar, popover de conta, selos pequenos da topbar/sidebar,
cartão de login, herói do Perfil no Desktop; header, menu mobile, cards de recurso, callouts,
passos do fluxo, capturas e linhas de status no site. **Não** em botões, campos de formulário,
badges pequenos ou tooltips — controles interativos pedem contorno nítido pra affordance, e
vidro-sobre-vidro em elemento pequeno borra a leitura (anti-padrão comum de glassmorphism
apressado). O `.sp-hero`/`.sp-hero--feature` do Desktop (splash art de campeão) também ficou de
fora - ali o fundo já é uma imagem real com scrim próprio, desfocar destruiria a arte.

**Desktop**: três tokens novos em `ui/tokens.css` (`--glass-blur` 20px, `--glass-blur-sm` 12px
pra elementos menores, `--glass-border`, `--glass-highlight`). Todo `backdrop-filter` do app
referencia esses tokens, nunca um `px` literal - isso permite desligar o efeito **num só lugar**:
`html[data-visual-intensity="reduced"] { --glass-blur: 0px; --glass-blur-sm: 0px; }`, reusando o
atributo que a Fase 13/14 já usa pra tirar splash art de fundo. Confirmado real no Electron:
alternar o atributo derruba `getComputedStyle(...).backdropFilter` pra `blur(0px)` na hora.

**Site**: não tinha nenhum gradiente de fundo fora do herói - só preto sólido. `base.css` ganhou
um fundo fixo (`background-attachment: fixed`) com dois glows radiais na cor de marca (vermelho),
mesmo padrão que o Desktop já usa desde a Fase 13, adaptado pro site (sem tema por skin).

**Validado real, não só buildado**: site no dev server real (Vite), 9 páginas sem erro de
console, `getComputedStyle` confirmando `blur(18px)` em header/cards, menu mobile abrindo como
painel de vidro real sobre o herói (screenshot). Desktop no **Electron real via CDP** (mesma
metodologia da Etapa 31J - debug port temporário em `main/index.ts`, revertido antes do commit
com diff líquido zero confirmado por `git diff`; login real via `window.sparta.session.set` com
token HMAC assinado pelo mesmo `AUTH_TOKEN_SECRET` do container Docker): Dashboard com o glow do
tema visivelmente desfocado atrás do retrato do jogador no card `feature`, sidebar/topbar
translúcidas, popover de conta como vidro flutuando (`blur(12px)`), Perfil com o mesmo tratamento
no herói analítico, desligamento por `data-visual-intensity="reduced"` confirmado (`blur(0px)`).
**Zero erro de console, zero exceção não tratada** em toda a sessão de validação.

**Não regressão**: etapa 100% CSS - nenhum arquivo de `packages/core`/`apps/api`/lógica de
`apps/desktop` tocado. `release-etapa27c-v1` continua `ACTIVE` com `artifactHash`/`configHash`
idênticos aos documentados, confirmado direto no Postgres (CSS não pode afetar o motor por
construção, não foi necessário gerar recomendação nova). **1215 testes** no monorepo (core 635,
riot 97, api 353, desktop 129, analyzer 1), todos verdes; `typecheck`/`lint`/`build` completos
nos 5 pacotes TypeScript.

## Etapa 31K: fundação pública do Sparta GG — `BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING`

Pedido explícito do usuário: preparar (e publicar, se os recursos já existissem) domínio, site
institucional e infraestrutura base do "Sparta GG" — marca, domínio pretendido
`spartagg.com.br`, contato pretendido `suporte@spartagg.com.br`, infra pretendida "VPS
Hostinger", nenhum dos três decidido como já contratado. Explicitamente fora de escopo: publicar
a API funcional, republicar o instalador Desktop, submeter à Riot. Relatório completo em
`docs/public-foundation-infrastructure.md`.

**FASE 0 (obrigatória antes de tocar em infraestrutura)**: determinar exclusivamente por
configuração/documentação já presente no repositório se domínio/VPS/SSH/e-mail já existem, **sem
nunca tentar descobrir credenciais**. `git grep` case-insensitive por `spartagg`/`hostinger`/
`registro.br`/`suporte@spartagg` em todo o repositório: zero ocorrência fora desta própria
etapa. `~/.ssh/config`: ausente. O histórico de `.claude/CLAUDE.md` (Etapas 30-31J) já registra
que nenhuma infraestrutura pública jamais foi provisionada — o desktop 0.9.0 foi retirado
justamente por depender de uma API pública que nunca existiu. Conclusão: **nenhum dos três
recursos existe hoje**, e nenhuma senha/chave/token foi solicitada, adivinhada ou testada em
nenhum momento desta etapa.

**Site institucional (`apps/site/`, novo workspace pnpm)** — Vite multi-page (9 entry points
HTML, sem framework de UI), layout compartilhado (`src/scripts/layout.ts`) montando header/
footer/disclaimer da Riot em todas as páginas sem duplicar markup. Nove páginas: Home (hero
honesto "Análise pessoal e apoio à tomada de decisão no League of Legends", sem promessa de
vitória/elo/recomendação perfeita, "Download em preparação" como `<span aria-disabled>` nunca um
link funcional, 3 capturas reais sanitizadas), Como funciona (fluxo Conta Sparta → vínculo Riot
→ sincronização → análise), Funcionalidades (só os 8 recursos reais e implementados — Dashboard/
Perfil/Champion Select/pré-game/histórico/pós-game/evolução/conta, explicitamente sem modo
carreira/coach/dado global; Laboratório/Histórico do Motor citados como ferramentas técnicas
internas, fora do foco da página), Privacidade (14 seções, cobrindo identidade do app/dados da
conta/e-mail/vínculo Riot/histórico/identificadores técnicos/logs, política de retenção enquanto
a conta estiver ativa + exclusão em até 30 dias, pontos marcados `[Revisão jurídica necessária]`
em vez de fingir certeza jurídica que não existe), Termos (11 seções + **disclaimer oficial da
Riot verbatim**, confirmado via busca na página legal real da Riot em vez de parafraseado: "Sparta
GG was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot Games.
Riot Games does not endorse or sponsor this project."), Excluir conta (o que é removido/prazo de
30 dias/consequências, sem simular um formulário funcional já que a API pública não existe),
Segurança (8 práticas reais já implementadas, não aspiracionais), Status (só estados públicos
reais — site operacional, o resto "em preparação", nenhum painel interno), 404 (`noindex`).

**SEO técnico e acessibilidade**: `canonical`/`og:*`/`robots` consistentes nas 9 páginas (as 5
páginas legais inicialmente só tinham `canonical`, corrigido pra ter o mesmo conjunto completo
das demais); `robots.txt` + `sitemap.xml` reais; skip-link, `:focus-visible`, `prefers-reduced-
motion`, landmarks semânticos, nav mobile com `aria-expanded` real (testado via JS — o toggle
alterna `aria-expanded`/`display` corretamente). Screenshots: 3 usadas no site (Dashboard,
Champion Select, Pós-game), com a identidade da conta de teste redigida por região de pixel
(Python/PIL) antes de publicar; uma quarta captura (Perfil, com um heading grande exibindo o
nome da conta) foi deliberadamente **descartada** em vez de forçar uma redação visualmente
grosseira — 3 capturas limpas valem mais que 4 com uma malfeita.

**Infraestrutura como código, testada localmente, nada aplicado contra infra real**:
`Dockerfile.site` (multi-estágio: build Node do site estático → runtime só com Caddy + os
arquivos gerados, mesmo padrão de `Dockerfile.api`, imagem-base fixada por **digest real**
obtido via `docker pull` nesta sessão, não inventado) — build real bem-sucedido via `docker
build`. `infra/Caddyfile` (TLS automático, redirect `www`→apex, cabeçalhos de segurança/CSP,
compressão, 404 customizado, bloco `handle /api/*` **reservado e comentado** para quando a API
pública for liberada) — validado com `caddy validate` e **smoke-testado num container real**
contra `:80` puro (sem depender de DNS real): 200 com headers corretos e gzip em página real,
404 real devolvendo a página customizada com status 404 correto (não 200). `infra/docker-
compose.yml` (serviço `site` isolado do `docker-compose.yml` da raiz — que é dev local da API —
com volumes nomeados para persistir certificados TLS entre deploys; API pública e Postgres de
produção **deliberadamente ausentes** deste arquivo enquanto os gates da Etapa 31D continuarem
de pé, para não ter infraestrutura fantasma).

**Documentação completa em `docs/public-foundation-infrastructure.md`**: arquitetura (diagrama
spartagg.com.br → Caddy → site + api.spartagg.com.br reservado/desligado → Postgres não
provisionado), plano de DNS por tipo/hostname/destino/TTL/finalidade (site, `www`, `api`
reservado, e-mail SPF/DKIM/DMARC — nenhum aplicado, todos pretendidos), runbook de hardening
mínimo de VPS (Linux LTS, usuário não-root com chave SSH confirmada **antes** de desabilitar
senha/root, firewall só 22/80/443, Docker, nunca porta 5432 exposta), runbooks de deploy/
rollback (site é estático e sem estado — rollback é `git checkout` + rebuild, sem migration),
política de backup (semanal do provedor, aceita explicitamente, com o risco "dependência de
backup de um único provedor" **documentado, não escondido**), e o **checklist exato de
aquisição** que só o responsável pode executar (registrar o domínio, contratar o VPS, gerar
chave SSH local, apontar DNS, contratar e-mail com SPF/DKIM/DMARC) — nada desses itens foi
presumido como já feito.

**Auditoria de secrets**: `git grep` nos arquivos novos desta etapa por padrões de credencial/
chave/senha — zero ocorrência; nenhum arquivo `.env`/credencial/chave stray criado;
`.dockerignore` já exclui `dist`.

**Não regressão medida** (Docker/Postgres reais já em execução desta sessão, `apps/api`/
`apps/desktop` **não tocados** por esta etapa): `release-etapa27c-v1` `ACTIVE` com
`artifactHash`/`configHash` **idênticos** aos documentados (`8878a657…`/`fa9dbde1…`), ponteiro
confere; snapshot mais recente em **`EXACT_REPLAY`**; a única linha `_prisma_migrations` sem
`finished_at` é a tentativa histórica já documentada da Etapa 28b (`20260727234500_http_cache_
states`, não é regressão). `typecheck`/`lint`/`build`/`test` completos nos **5 pacotes**
TypeScript (core, riot, api, desktop, e o novo `site`); `apps/api` isolado 353/353 (a mesma
flakiness documentada de `/docs existe em desenvolvimento` sob contenção de recursos, já
registrada desde a Etapa 26b, reapareceu na execução paralela e não na isolada); analyzer Python
1/1.

**Estado final: `BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING`.** Código, configuração e
conteúdo prontos e testados localmente; nada publicado porque domínio, VPS e e-mail não existem.
Quando os três itens do checklist existirem, os próximos passos são os runbooks já escritos —
nenhuma auditoria nova necessária. API pública, Postgres de produção, submissão à Riot e
republicação do Desktop seguem fora de escopo, nenhum tocado. Modo carreira e coach ficam
explicitamente adiados até depois da submissão Production à Riot (próxima etapa recomendada:
31L), por decisão estratégica do usuário registrada nesta etapa.

## Etapa 31J: QA visual integrado e acabamento final do Desktop

Revisão visual de acabamento sobre o app inteiro, com validação real no Electron via CDP — não
numa aba de navegador comum. **Nenhuma funcionalidade nova, nenhuma lógica de domínio ou motor
alterada.** Relatório completo em `docs/desktop-visual-qa-31j.md`.

**Metodologia — primeira etapa deste projeto com validação Electron real via CDP dentro da
própria sessão de implementação** (etapas anteriores relatavam essa validação como limitação não
executável): `app.commandLine.appendSwitch("remote-debugging-port", "9222")` adicionado
**temporariamente** em `main/index.ts`, revertido antes do commit (diff líquido zero, confirmado
por `git diff`). Conexão via WebSocket (pacote `ws`, presente no store do pnpm por dependência
transitiva, requerido pelo caminho absoluto já que não está hoisted na raiz) ao target `page`
exposto em `http://localhost:9222/json/list`. Login real: token HMAC assinado com o mesmo
`AUTH_TOKEN_SECRET` do container Docker, injetado via `window.sparta.session.set(token)` — a
mesma API IPC que a tela de login usa de verdade, protegida por `safeStorage`, só preenchida
programaticamente em vez de por formulário (não é bypass: é o mecanismo real de sessão).
Navegação/clique/teclado/viewport via `Runtime.evaluate`, `Input.dispatchKeyEvent`
(`type: "keyDown"`, não `"rawKeyDown"` — só o primeiro dispara o avanço de foco nativo do
Chromium) e `Emulation.setDeviceMetricsOverride`; console/exceções/rede capturados ao vivo via
`Runtime.consoleAPICalled`/`Runtime.exceptionThrown`/`Network.responseReceived`.

**11 telas validadas em matriz representativa** (Dashboard, Perfil, Champion Select, Histórico de
drafts, Pré-game, Partidas e pós-game, Evolução pessoal, Histórico do motor agregado, Laboratório,
Configurações, Conta e segurança): 1000/1280/1600px, os 3 temas (Espartano/Obsidiana/Adaptativo)
aplicados pela tela real de Configurações, densidade e intensidade visual combinadas (Obsidiana +
compacta + reduzida simultâneas sobre o Dashboard), 14 tabs consecutivos de teclado real
percorrendo sidebar → skip-link → topbar sem nunca perder ou prender o foco. Zero overflow
estrutural, zero erro de console residual, zero exceção não tratada, zero 401 silencioso (o
padrão de bug da Etapa 31H não reapareceu) em toda a navegação.

**3 bugs reais encontrados pela própria validação e corrigidos, cada um com teste**:

1. **`<button>` aninhado em `CalibrationLabScreen.tsx`** (lista de candidatas salvas) — a Etapa
   31I colocou `<HashChip>` (que tem os próprios botões de expandir/copiar) dentro do `<button>`
   de seleção de cada linha; HTML não permite `<button>` dentro de `<button>`, e o React acusava
   2 erros de hydration mismatch no console a cada abertura do Laboratório. Corrigido: o `<li>`
   virou o contêiner flex, o botão de seleção cobre só nome+status, `HashChip` é irmão dele fora
   do botão. CSS `.sp-calib-list button` (que sem querer também estilizava os botões de ação da
   lista de releases mais abaixo na mesma tela) trocado por `.sp-calib-list > li > button`,
   escopo correto — efeito colateral positivo: os botões Validar/Ativar/Reverter das releases
   passaram a usar só o próprio estilo do componente `Button`, sem a sobreposição indevida.
2. **Badge "ATIVA" contradizendo o rótulo de status ao lado**, na própria release atualmente
   ativa — mostrava simultaneamente o badge verde "ATIVA" e o texto "Ativa (não é a atual)".
   `RELEASE_STATUS_LABELS.ACTIVE` tinha sido escrito só para o caso de release **superada**
   (status ainda `ACTIVE` no banco, ponteiro já em outra — Etapa 27b), sem considerar o caso em
   que é de fato a atual. Nova `releaseStatusLabel(release)` decide o texto olhando
   `currentlyActive`.
3. **Campo "Novo email" pré-preenchido com o e-mail atual, sem máscara**, em Conta e segurança —
   `AccountScreen.tsx` inicializava `useState(user.email ?? "")`; ao lado, o campo "Email" (só
   leitura) já mostra o mesmo e-mail corretamente mascarado, então o campo de edição parecia ter
   um valor já digitado. Corrigido: estado inicial vazio + `placeholder` explicativo.

**Problemas observados e conscientemente mantidos** (não são bugs críticos, registrados para não
esconder): quebra de linha (não overflow) na lista de "Histórico de drafts" em 1000px; rótulo
bruto "HORDE" (junto de "DRAGON"/"RIFTHERALD"/"TOWER_BUILDING") na timeline do pós-game — vem
direto do tipo de evento do Match-V5, consistente com o princípio já documentado de "só fatos
preservados, sem interpretação" daquela seção.

**Não regressão**: mesma recomendação controlada de sempre (JUNGLE, pick 3, Ahri aliada, Lee Sin
inimigo, bans 55/91) → **5 candidatos idênticos** (Viego 58.7/0.9, Udyr 58.5/0.5, Vi 55.3/0.5,
Nocturne 53.3/0.5, Graves 50.1/0.5); `release-etapa27c-v1` `ACTIVE` com `artifactHash`/
`configHash` **idênticos** aos de antes; snapshot novo → **`EXACT_REPLAY`, 0 divergências**; zero
migrations pendentes (nenhum arquivo de `apps/api` foi tocado nesta etapa).

**1230 testes** no monorepo (core 635, riot 97, api 353, desktop 129, raiz 15, analyzer 1) — 1
arquivo novo (`AccountScreen.test.tsx`, 1 teste) + 1 teste novo em `CalibrationLabScreen.test.tsx`
(mais uma asserção no teste já existente). `typecheck`/`lint`/`build` completos nos quatro
pacotes TypeScript (lint precisou de `HTMLInputElement` novo nos globals do `eslint.config.js`
raiz, mesmo padrão de remediação de `navigator`/`AbortSignal` de etapas anteriores). `apps/api`
isolado reproduziu **1 flakiness já documentada** (timeout em `/docs existe em desenvolvimento`)
na primeira execução, **353/353 na reexecução imediata**, sem nenhuma alteração de código —
registrado, não mascarado, mesmo padrão desde a Etapa 26b. `pnpm --filter @sparta/desktop
package:dir` (electron-builder, sem publicar) empacotou com sucesso, confirmando que o pipeline
de build produz um app funcional com o `main/index.ts` já revertido.

Nenhuma tela foi redesenhada por completo — só acabamento. Modo carreira, coach ao vivo, dado
global, RSO real, serviço de email real, site institucional, domínio, VPS seguem fora de escopo.
Ver `docs/desktop-visual-qa-31j.md`.

## Etapa 31I: redesign do Histórico do Motor e Laboratório de Calibração

Etapa exclusivamente de experiência e visualização, sobre as duas últimas telas "cruas" do
produto. **Nenhuma fórmula, peso, threshold, experimento, lógica de calibração, release ativa,
critério de ativação, replay, hash ou persistência científica foi tocado** — tudo aditivo ou
puramente apresentacional. Relatório completo em
`docs/engine-history-calibration-lab-redesign.md`.

**Auditoria antes de tocar código**: o nome de navegação "Histórico do motor" é ambíguo entre
duas telas. `DraftHistoryScreen.tsx` (nav "Histórico de drafts") é quem lista snapshots
individuais com hash/config/release/replay — o alvo real do pedido de redesenhar o "Histórico do
Motor". `MotorHistoryScreen.tsx` (observabilidade agregada da Etapa 23, uma linha por dimensão)
já usava integralmente o design system atual, tokens corretos (`--space-*`/`--text-*`/
`--border-subtle`), zero barra de progresso repetitiva e um breakpoint responsivo — auditoria
concluiu **manter**, sem alterar código só para justificar a etapa.

**Backend (aditivo)**: `RecommendationSnapshot.configurationSource`/`configurationReleaseId`/
`configurationVersion`/`configHash` já existiam no schema desde a Etapa 27b (colunas nullable) e
nunca eram serializados em `GET /drafts/sessions/:id`. Nova `resolveSnapshotRelease`
(`draft-session-repository.ts`) resolve a release referenciada + se é a atualmente apontada pelo
ponteiro; os quatro campos + resumo de release (`id`/`releaseVersion`/`artifactHash`/`status`/
`currentlyActive`) passam a sair por snapshot. Mudança 100% de leitura — nenhuma query nova,
nenhum campo computado que não estivesse já persistido.

**`ui/HashChip.tsx`** (novo) — disclosure progressivo pra hash/ID técnico: resumido por padrão
(6 primeiros + … + 4 últimos), botão pra expandir/recolher, ação separada de copiar
(`navigator.clipboard`, primeiro uso no repositório — `navigator` entrou nos globals do
`eslint.config.js` raiz). Usado em `DraftHistoryScreen`/`CalibrationLabScreen` pra todo
`configHash`/`artifactHash`.

**`DraftHistoryScreen.tsx` reescrito** — filtros de posição/período 100% client-side sobre a
lista já carregada (`GET /drafts/sessions` só suporta `limit` no servidor; adicionar filtro novo
seria desproporcional pra uma etapa declaradamente visual, decisão documentada no código).
Detalhe em três blocos rotulados, nunca misturados: **Contexto congelado** (posição/aliados/
inimigos/bans/pool como estavam no draft), **Resultado produzido** (ranking numerado com
`ScoreBadge`, grupo, cobertura, razões, riscos — do snapshot persistido, **nunca** comparado com
score atual), **Configuração** (versão, hashes via `HashChip`, release associada com badge
"ATIVA" só quando `currentlyActive === true`). Seção de replay reaproveitando
`ReplayCapabilitySummary`, agora com **tabela real** (`<table>`) de divergência campo a campo
quando `REPLAY_INTEGRITY_FAILED`, agrupada pelo vocabulário real do verificador (`presenca`,
`totalScore`, `dataCoverage`, `rank`, `group`, `metric.<chave>`) — nunca resumida como
vermelho/verde.

**`CalibrationLabScreen.tsx` redesenhado** — banner fixo "Ambiente histórico / não operacional"
com três frases explícitas (nada altera produção automaticamente; métricas são congeladas no
snapshot original; ativar exige o fluxo de release separado). `computeWeightDeltas` mostra só os
pesos que **de fato divergem** entre a release ativa e a configuração candidata em edição — peso
igual nos dois lados nunca aparece; a comparação só existe quando há release ativa (a baseline
embutida varia por cenário do draft, comparar contra "a" baseline fingiria uma configuração única
que não existe). Os três `<pre>{JSON.stringify(...)}</pre>` anteriores viraram cards/tabelas
estruturados usando os tipos reais do domínio (`CalibrationExperimentReport`,
`CalibrationHumanReviewSummary`, `CalibrationExclusionSummary`, `CalibrationReweightedCandidate`)
— cobertura com total/reavaliados/excluídos/motivo traduzido (nunca enquadrado como falha do
modelo), bloco de integridade temporal factual (o `ReplayInputBundle` de cada caso só preserva o
que existia no instante do draft, por construção — sem inventar um "score" de integridade).
`RELEASE_STATUS_LABELS` traduz o estado cru; badge "ATIVA" aparece só quando
`currentlyActive === true` (garantia estrutural do ponteiro único, Etapa 27b — nunca duas
releases marcadas ao mesmo tempo); `HashChip` nos dois hashes de cada release; indicador discreto
quando a release veio do experimento aberto na tela. Confirmações em dois passos de
ativação/rollback (já existentes desde a Etapa 27b) preservadas sem alteração de comportamento.

**Validado real** (Docker reconstruído com a imagem contendo as mudanças, Postgres real, conta
Zekerus#117): `prisma migrate deploy` confirmou **zero migrations pendentes** (etapa 100%
aditiva); `GET /recommendation-engine/active-release` confirmou `release-etapa27c-v1` `ACTIVE`
com `artifactHash`/`configHash` **idênticos** aos de antes; recomendação controlada de sempre
(JUNGLE, pick 3, Ahri aliada, Lee Sin inimigo, bans 55/91) → **5 candidatos idênticos** à linha de
base (Viego 58.7/0.9, Udyr 58.5/0.5, Vi 55.3/0.5, Nocturne 53.3/0.5, Graves 50.1/0.5); snapshot
novo persistido com os campos aditivos corretos (`configurationSource: RELEASE`, `configHash`
batendo, `releaseVersion: release-etapa27c-v1`, `currentlyActive: true`); `verify-replay` no
snapshot novo → **`EXACT_REPLAY`, 0 divergências**.

**Limitação registrada, não escondida**: validação visual em Electron real via CDP **não foi
executada nesta sessão**. Desde a Etapa 31D, `App.tsx` chama `window.sparta.session.get()`
incondicionalmente no primeiro efeito — sem o bridge de preload do processo Electron real essa
chamada lança, e uma aba de navegador comum (mesmo apontando pro dev server) não reproduz mais as
telas pós-login, diferente de sessões anteriores a essa etapa. A validação desta etapa se apoiou
em: leitura/serialização confirmada contra o Postgres/API reais via curl (incluindo os campos
novos ponta a ponta); suíte de testes de componente com `@testing-library/react`/jsdom cobrindo
texto exato renderizado (banner, badge ATIVA, hash resumido vs. completo, filtros, blocos do
detalhe); `typecheck`/`build` do bundle do renderer sem erros. Registrado como limitação
explícita, mesmo padrão de honestidade de quando um recurso depende do League Client aberto.

**1228 testes** no monorepo (core 635, riot 97, api 353, desktop 127, raiz 15, analyzer 1) — 12
novos cobrindo especificamente esta etapa. `typecheck`/`lint`/`build` completos nos quatro
pacotes TypeScript; `apps/api` isolado passou 353/353 numa única execução, sem flakiness desta
vez; infraestrutura de testes não foi alterada. Ver
`docs/engine-history-calibration-lab-redesign.md`.

## Etapa 31H: redesign do pós-game, partidas e histórico pessoal

Escopo exclusivo: pós-game, detalhe de partida, histórico pessoal, comparação factual com o
snapshot pré-game e visualização de métricas observadas. **Nenhum cálculo, inferência, vínculo
Match-V5, snapshot ou motor de recomendação foi tocado** — tudo aditivo. Relatório completo em
`docs/post-game-match-history-redesign.md`.

**Backend (aditivo)**: `MatchParticipantSummary`/`MatchParticipantsOverview`
(`packages/core/src/types/match-participants.ts`) — um jogador de uma partida específica, dos
dois times; **sem campo de nível**, porque a Riot não persiste isso em nenhuma tabela do Sparta
e inventar violaria o princípio de dado real do projeto. `teamId` opcional cobre linhas legadas
anteriores ao backfill de participantes da Etapa 3. `compareMatchToRecentHistory`
(`packages/core/src/aggregation/match-vs-recent-history.ts`) compara uma partida com a média das
partidas **estritamente anteriores** (por `observedAt`) - nunca inclui a própria partida nem
partidas futuras, evitando vazamento temporal por construção. `MatchPerformanceMetrics` ganhou
`goldDiffAt15`/`objectiveEvents` (aditivo, opcional - já existiam internamente em
`generatePostGameAnalysis` e só não saíam no contrato).

**Duas rotas novas**, as duas `OWN_RESOURCE` na matriz de autorização (Etapa 31C):
`GET /matches/:matchId/participants` (os 10 participantes, posse implícita via linha
`MatchParticipant` do próprio usuário, reusa `findMatchLoadoutObservation` por participante em
paralelo, sem parsear `rawJson`) e `GET /players/:puuid/match-history` (filtrável por
posição/resultado/fila/campeão/período, paginado por `limit`/`offset`, reusa o mesmo
enriquecimento por partida de `/me/player-profile` via mapper compartilhado extraído
`match-history-mapper.ts` - o comportamento daquela rota não mudou).

**Frontend**: `MatchHistoryList.tsx` (novo) substitui a antiga lista fixa de 10 partidas numa
barra de 300px - filtros + agrupamento temporal (Hoje/Ontem/Esta semana/Mais antigas/Sem data
registrada, nunca mistura partida sem data com "Hoje") + "Carregar mais". O pós-game virou
histórico em largura total no topo + relatório completo abaixo (a lista antiga não cabia
`RecentMatchRow`, que precisa de ~700px de grade). `MatchParticipantsCard` (os dois times, jogador
do Sparta discretamente destacado, sem julgamento sobre os outros 9), `MatchTimelineCard` (só
fatos com timestamp, zero narrativa causal - "14:23 DRAGON registrado", nunca "X causou Y"),
`RecentHistoryComparisonCard` ("nesta partida" vs "sua média recente" em cards de valor, não mais
barras empilhadas - pedido explícito de reduzir dependência de progress bar). `DraftComparisonSection`
reestruturada em dois blocos rotulados "Antes da partida"/"Observado na partida", mesmo
texto/dado de sempre, só separação visual entre decisão e resultado.

**Bug real corrigido no caminho, achado só na validação real do Electron**: a Etapa 31C (auditoria
de autorização) tornou `/players/:puuid/recent-matches`, `/growth-journey`,
`/champion-performance` e `/champions/:championId/role-evidence` todas `OWN_RESOURCE`, mas as
quatro funções correspondentes em `api-client.ts` nunca foram atualizadas pra mandar o header
`Authorization` - foram escritas quando essas rotas ainda eram públicas por puuid (Fase 1/2). Ou
seja, desde a Etapa 31C, toda chamada real dessas quatro funções vinha devolvendo 401 em
silêncio, e nenhuma etapa entre a 31C e a 31G tinha revalidado Pós-game/Evolução no Electron real
depois do endurecimento - só apareceu porque esta etapa finalmente reabriu o pós-game via CDP de
verdade. Corrigido: as quatro funções passaram a exigir `token` como primeiro parâmetro;
`GrowthJourneyScreen` ganhou a prop `sessionToken`, que nunca tinha recebido nenhuma.
`fetchMatchHistory` (nova nesta etapa) já nasceu correta.

**Validado real** (Docker reconstruído, Postgres real, conta Zekerus#117, 22 partidas
sincronizadas): as duas rotas novas responderam 200 com dado real via curl com token assinado
(10 participantes com times 100/200 corretos e jogador rastreado identificado; histórico
paginado/filtrado correto). Reanálise de uma partida real expôs `goldDiffAt15: -2181` e 24
eventos de objetivo com timestamp reais (antes, ambos `undefined` - confirma o campo aditivo
funcionando ponta a ponta). Electron real via CDP (`electron-vite dev`, não aba de navegador
comum): login real (token HMAC assinado, mesmo `AUTH_TOKEN_SECRET` do container), navegação até
"Partidas e pós-game", histórico com 20 de 22 partidas reais agrupadas em "Mais antigas", abertura
de uma partida real (Vel'Koz SUPPORT, derrota) com os 10 participantes, timeline real
(mortes/ouro/objetivos com timestamp), comparação com a média recente real (21 partidas
anteriores, valores batendo), **zero erro de console em todo o fluxo** (login → navegação →
seleção de partida, escutado via `Runtime.consoleAPICalled`/`Runtime.exceptionThrown`), zero
`NaN`/`Infinity`/`undefined` no texto renderizado, zero imagem quebrada, e `scrollWidth ===
clientWidth` em 1000/1280/1600px (sem scroll horizontal).

**Não regressão**: mesma recomendação controlada de sempre (JUNGLE, pick 3, Ahri aliada, Lee Sin
inimigo, bans 55/91) → 5 candidatos idênticos à linha de base (Viego 58.7/0.9, Udyr 58.5/0.5, Vi
55.3/0.5, Nocturne 53.3/0.5, Graves 50.1/0.5). `release-etapa27c-v1` `ACTIVE` com `artifactHash`
(`8878a657…`) e `configHash` (`fa9dbde1…`) iguais antes e depois. Replay do snapshot novo:
**`EXACT_REPLAY`, 0 divergências**.

**1211 testes** no monorepo (core 635, riot 97, api 348, desktop 115, raiz 15, analyzer 1) - 28
novos cobrindo especificamente o comportamento desta etapa. `pnpm -r test` completo (todos os
workspaces em paralelo) passou sem flakiness desta vez - a contenção de recursos documentada
desde a Etapa 26b não se manifestou nesta execução (executado uma única vez, não é garantia de
que não reapareça). `typecheck`/`lint`/`build` completos nos quatro pacotes TypeScript.

Histórico do motor e Laboratório de calibração não foram tocados, conforme instrução explícita
("pare antes do redesign do Histórico do motor e Laboratório"). Modo carreira, coach ao vivo,
dado global, RSO real, serviço de email real, site institucional, domínio e VPS seguem fora de
escopo. Ver `docs/post-game-match-history-redesign.md`.

## Etapa 31G.1: alerta Dependabot high (js-yaml) resolvido

O GitHub sinalizou `js-yaml` `GHSA-5p4m-2wfm-xmqj` (CVSS 7.5, DoS por consumo quadrático de CPU em
`!!omap`, `>= 4.0.0 < 4.3.1`) logo após o push da Etapa 31G. Relatório completo em
`docs/dependabot-js-yaml-2026-08.md`.

**Exposição real — `BUILD_TIME_ONLY`, com evidência, não presunção.** `js-yaml@4.3.0` só é
alcançado por dois `devDependencies`: `eslint` (via `@eslint/eslintrc`) e `electron-builder` (via
`app-builder-lib`/`dmg-builder`/`builder-util`). `pnpm --filter <pkg> why js-yaml --prod` devolveu
vazio nos quatro workspaces; ausente dos dois SBOM de produção da Etapa 29; nenhum código do
projeto importa YAML; sem `.eslintrc.yml`/`.yaml` no repo (flat config desde a 28a, então o caminho
YAML do ESLint nunca ativa); `electron-builder.yml` é arquivo local autoral sem bloco `publish`
(nada busca YAML remoto); `electron-builder` nem roda no CI. O cenário de ataque do advisório
(`yaml.load(untrustedInput)`) não existe neste projeto — nem em produção, nem no único contexto
onde a dependência de fato executa.

**Correção — atualização transitiva normal, sem override.** `@eslint/eslintrc@3.3.5` declara
`js-yaml: ^4.1.1` e `app-builder-lib`/`builder-util`/`dmg-builder` declaram `^4.1.0` — as duas
faixas já permitiam `4.3.1`, publicada no registro antes deste alerta. `pnpm update js-yaml -r`
bastou. Diff do lockfile: só `js-yaml@4.3.0` → `js-yaml@4.3.1`, nada mais; `package.json` e
`pnpm-workspace.yaml` intocados.

**Validado contra os dois consumidores reais**: `pnpm lint` (roda `eslint` de verdade, resolvendo
`js-yaml@4.3.1`) e `pnpm --filter @sparta/desktop package:win` (exercita o próprio
`electron-builder` que motivou o alerta — instalador gerado com sucesso, `app.asar` com 2587
entradas e **0** ocorrências de `js-yaml`). `pnpm audit` → 0 em todas as severidades, dev+prod e
prod isolado.

**`apps/api` isolado passou 46/46, 336/336, três vezes seguidas** — `pnpm -r test` (paralelo)
reproduziu de novo a flakiness por contenção de recursos já documentada na Etapa 26b/31G: a cada
execução um conjunto **diferente e não sobreposto** de testes de `apps/api` falhava (mais de dez
nomes distintos ao todo, nunca repetido), nunca fora de `apps/api`, que nem depende de `js-yaml`.

**Não regressão**: mesma recomendação controlada de sempre → 5 candidatos idênticos;
`release-etapa27c-v1` `ACTIVE` com `artifactHash`/`configHash` iguais antes e depois; replay
`EXACT_REPLAY`, 0 divergências. Zero arquivo de aplicação tocado — só `pnpm-lock.yaml` mudou, então
Champion Select, pré-game, perfil, dashboard, autenticação e onboarding não têm como ter sido
afetados.

Resultado: **`DEPENDABOT_HIGH_RESOLVED`** — confirmado direto na API do GitHub após o push
(commit `be4b1bd`): alerta #43 em `"state": "fixed"`, `fixed_at: 2026-08-07T01:41:23Z`, **0**
alertas abertos no repositório.

## Etapa 31G: redesign do Champion Select e pré-game

Continuação de uma sessão do Codex que atingiu o limite com ~16 arquivos alterados e não
commitados. Auditoria completa do diff herdado antes de tocar em qualquer coisa: `git status`,
`git diff --check`, revisão arquivo a arquivo, separando mudança funcional legítima de ajuste
acidental de ambiente. Relatório em `docs/champion-select-pre-game-experience.md`.

**Revertido**: `pnpm-workspace.yaml` — o Codex tinha duplicado `onlyBuiltDependencies`/`overrides`
que já existem em `package.json` (campo `pnpm`, desde a Etapa 28a/29). `pnpm install
--frozen-lockfile` funciona idêntico sem a duplicata; sem aviso de config obsoleta. Ajuste de
ambiente local do Codex, não é parte do produto.

**Herdado íntegro**: `selectedChampionLocked` em `LcuDraftSnapshot`
(`packages/riot/src/lcu/draft-snapshot.ts`) — distingue "escolhi mas não travei" de "travado" lendo
`snapshot.actions` do LCU, campo que a Riot já expõe e que o Sparta nunca tinha consumido.
Cancelamento real de requisição: `useAsyncData` cria um `AbortController` por execução do efeito e
aborta no cleanup; `fetchDraftRecommendations`/`fetchPreGameAnalysis` propagam o `signal` até
`fetchWithPolicy` (Etapa 9), que já sabia combinar sinal externo com timeout interno — o
cancelamento chega à rede de verdade, não só ao estado do componente. Canal IPC novo
`sparta:lcu-status` transmite o `LcuReadStatus` real (os nove valores já existentes) só quando
muda; `App.tsx` passou a derivar `leagueConnected` dele em vez de `phase !== null`. Congelamento
visual do snapshot: ao detectar lock-in real (ou clicar "Confirmar" no modo manual), a tela copia
as recomendações correntes pra um `frozenSnapshot` e para de reagir a atualizações — sem isso,
trocar de inimigo depois do lock-in reordenaria cards embaixo de uma escolha que já não pode
mudar. Reescrita quase completa do Champion Select (1210 linhas de diff) e do pré-game (242
linhas): três estados operacionais distintos (League fechado / LCU instável / cliente aberto fora
do champ select), rail de recomendações + painel de detalhe com filtros progressivos, resumo
honesto de escolha fora do snapshot ("nenhum score ou ranking retroativo foi criado"), quadro do
draft no pré-game sem inferir adversário direto sem evidência, guarda de resposta obsoleta em duas
camadas (`AbortController` + comparação de `championId`/`role` no client).

**Corrigido nesta sessão**: import morto (`useMemo`) em `ChampionSelectScreen.tsx`; dois globals
faltando no `eslint.config.js` da raiz (`AbortSignal`/`AbortController`) — o cancelamento real que
o Codex introduziu expôs esse gap, mesma lista fechada que já tinha `RequestInit`/`Response` por
causa do `fetch`.

**Investigado e descartado**: `pnpm -r test` reprovava 2-4 testes de `apps/api` por execução, um
conjunto **diferente** a cada vez — mesmo padrão de contenção de recursos sob paralelismo já
documentado na Etapa 26b. `apps/api` isolado passou **46/46 arquivos, 336/336 testes**, duas vezes
seguidas, sem nenhuma alteração de código (e `apps/api` não tem nenhum arquivo tocado por este
redesign). Uma terceira execução completa de `pnpm -r test` passou os cinco pacotes sem falha.

**Validação real, achado incomum**: Electron real via CDP (`file://…/out/renderer/index.html`, sem
Vite), conta Zekerus#117. Pela **primeira vez neste projeto**, um cliente real do League estava
aberto na máquina de validação — `getLcuState()` leu de verdade `{status:
"OUTSIDE_CHAMP_SELECT", phase: "Lobby"}`, e a tela mostrou "Lobby aberto" corretamente,
confirmando o caminho main→preload→renderer com dado real, não simulado. **Nenhuma ação foi
tomada no cliente real** (sem fila, sem partida) — entrar de fato numa sessão de champion select
ficou fora do alcance desta sessão, mesmo limite documentado em toda etapa anterior. O resto usou
o modo "Simular manualmente" (existente desde a Fase 11): posição Jungle → recomendações reais
(Viego, Udyr, alternativas); dois inimigos adicionados pelo grid (Lee Sin, Ahri); "Confirmar" →
"Snapshot preservado" imediato; pré-game com "Inimigos revelados 2/5", "Cobertura dos dados 22%",
"Confronto direto: Ainda sem dado" (correto — inimigo manual sem `role`, nada inferido); build
sugerida presente. **1000/1280/1600px** sem scroll horizontal em nenhuma combinação; foco por
**Tab real** (`Input.dispatchKeyEvent`) pousando num `<button class="sp-card...
sp-card--interactive">` com anel de 2px; temas Obsidian (compacto/reduzido) e Adaptativo
(confortável/completo) aplicados e confirmados no `dataset` do `<html>`; **zero erro de console,
zero imagem quebrada, zero `NaN`/`Infinity`/`undefined`** em toda a sessão.

**Não regressão**: mesma recomendação controlada desde a Etapa 27b (JUNGLE, pick 3, Ahri aliada,
Lee Sin inimigo, bans 55/91) → **5 candidatos idênticos** à linha de base (Viego 58.7/0.9, Udyr
58.5/0.5, Vi 55.3/0.5, Nocturne 53.3/0.5, Graves 50.1/0.5). `release-etapa27c-v1` `ACTIVE` com
`artifactHash`/`configHash` **iguais** antes e depois; replay `EXACT_REPLAY`, 0 divergências.

`typecheck`/`lint`/`build` completos; **1177 testes** no monorepo (core 629, riot 97, api 336,
desktop 100, raiz 15) + analyzer Python. Conta de teste local teve `emailVerifiedAt` definido
direto no Postgres pra sair de `EMAIL_UNVERIFIED` (Etapa 31D) — manutenção de fixture local em
`NODE_ENV=development`, não mudança de código nem bypass de produção. Referências:
`docs/champion-select-pre-game-experience.md`.

## Etapa 31F: shell, dashboard e sistema visual v2

O shell autenticado agora possui sidebar hierárquica/recolhível, topbar contextual, status compactos
de API/League e menu de conta sem duplicação. O dashboard deixou as três consultas legadas e usa
exclusivamente `GET /me/player-profile`, com hero factual, seis índices, tendência por período e
métrica, partidas, campeões, ações e estados operacionais. Sincronização usa `POST /players/sync`
sem identidade ou conclusão enviada pelo renderer.

O sistema visual oferece Espartano, Obsidian e Adaptativo, densidade confortável/compacta e arte
completa/reduzida; semântica de cores permanece fixa e accent de campeão só atua no Adaptativo.
Validação: 1.171 testes TypeScript e 1 do analyzer, typecheck/lint/build, pacote Electron inspecionado em
1000/1280/1600 px e Obsidian compacto/reduzido. Sem dependência nova. Recomendação controlada gerou
cinco principais e uma alternativa; `release-etapa27c-v1`/hashes permaneceram intactos; replay real
`EXACT_REPLAY`, zero divergências/dependências. Referências:
`docs/shell-dashboard-visual-system.md` e `.ai/specs/shell-dashboard-visual-system.md`.

## Etapa 31E: perfil analítico pessoal e fundação visual

O Perfil agora é uma superfície analítica real, alimentada exclusivamente pelo proprietário da
sessão em `GET /me/player-profile`. O contrato `PlayerProfileOverview` separa identidade, rank,
oito métricas versionadas, evidência por posição, tendência, campeões, partidas/loadouts, insights,
cobertura, atualização e proveniência. Zero observado é preservado; ausência, parcialidade,
amostra pequena e desatualização têm estados distintos. Rank, ícone e nível permanecem
indisponíveis enquanto League-V4/perfil correspondente não estiver integrado.

A fundação reutilizável inclui hero, cartões de índice, badges de cobertura, gráfico SVG nativo,
cartões de campeão, partidas recentes e insights. O gráfico usa escala fixa 0–100, não inventa
pontos, interrompe linhas em lacunas e tem equivalente textual. Não há comparação global,
nacionalidade inferida, dependência visual nova nem alteração em autenticação/onboarding,
histórico, pesos, ranking, recomendação, release ou replay.

Validação local: 1.155 testes TypeScript e o teste do analyzer aprovados, além de typecheck, lint,
build e API reconstruída/saudável. A recomendação controlada retornou cinco escolhas principais e
uma alternativa sem persistência histórica; `release-etapa27c-v1` manteve os mesmos hashes; o
replay real permaneceu `EXACT_REPLAY`, com zero divergências. Referências:
`docs/player-profile-overview.md`, `docs/design-system.md` e
`.ai/specs/player-profile-overview.md`.

## Etapa 31C: identidade/autorização endurecidas; RSO bloqueado

Estados combinados: `AUTHORIZATION_HARDENED`, `BLOCKED_BY_RIOT_APPROVAL` e
`BLOCKED_BY_OWNER_DECISIONS`. Toda rota possui classificação executável e o boot falha se surgir
rota sem política. Recursos pessoais derivam o proprietário do token e identificadores cruzados
recebem 404; laboratório/administração ficam invisíveis em produção.

Vínculos existentes migram exclusivamente para `UNVERIFIED_LEGACY`. Produção aceita apenas
`VERIFIED_BY_RSO`; local/teste preservam operação controlada sem declarar verificação. Foram
preparados provider desacoplado, transação `state` one-time, callback, associação, revogação e
reauth, mas nenhum adapter/segredo/credencial real foi criado. O pacote Riot e políticas públicas
são rascunhos não enviados, com domínio, responsável, contato, retenção e exclusão marcados como
decisões pendentes. Não provisionar/publicar/submeter/restaurar desktop na próxima etapa sem ordem
explícita.

Referências: `docs/identity-authorization-riot-readiness.md`,
`docs/route-authorization-audit.md` e `docs/riot-production-application-package.md`.

Migration local aplicada: vínculo anterior em `UNVERIFIED_LEGACY`, nenhuma associação duplicada,
release `release-etapa27c-v1`/hashes intactos e cinco verificações recentes em `EXACT_REPLAY`.

## Etapa 31B: infraestrutura pública preparada, não provisionada

Parecer combinado: `READY_FOR_INFRASTRUCTURE_APPROVAL`, `BLOCKED_BY_RIOT_APPROVAL` e
`BLOCKED_BY_OWNER_DECISIONS`. Relatório executável em
`docs/public-api-infrastructure-readiness.md`; operações futuras em
`docs/runbook-public-api-operations.md`. Nenhum recurso cloud, registry, domínio, gasto, migration
externa, imagem ou deploy foi criado.

Auditoria medida: API 120,8 MiB, Postgres 44,7 MiB, Redis 8,9 MiB, banco 18,7 MB e imagem 513 MB.
Redis e analyzer não são consumidos pela API atual; `/health` continua liveness e o novo `/ready`
testa Postgres, declarando Redis `not_used`. `.env.production.example` não contém valores reais; a
validação exige HTTPS, CORS explícito, segredo forte, PostgreSQL, docs desligados e chave Riot
definida. O tipo da chave não é inferível pelo formato: o gate operacional ainda precisa confirmar
que é a Production Key aprovada.

Development Key não sustenta produto público; Account-V1/Match-V5 e RSO exigem aprovação/Production
Key. O vínculo atual por Riot ID não prova propriedade e há rotas pessoais sem ownership uniforme:
staging público fica bloqueado até decisão e correção coordenada. GCP São Paulo gerenciado foi
recomendado, com Lightsail como menor custo e ECS/Fargate como maior controle; nenhuma opção foi
escolhida automaticamente.

O desktop segue `WITHDRAWN_PENDING_PUBLIC_API`. `release-etapa27c-v1`, artifact/config hashes e
replay `EXACT_REPLAY` permanecem intactos. A próxima etapa só pode ser 31C após autorização explícita
e fechamento dos bloqueios; não iniciar 31D/31E/31F/32.

## Etapa 30B: desktop 0.9.0 publicado parcialmente — `PARTIALLY_PUBLISHED`

Tag anotada `v0.9.0` publicada apontando exatamente para
`aa2366b3e5bb4b3e5227dcdec43eaf8c6977ba77`, sem força. GitHub Release:
<https://github.com/J-Pantaroto/Sparta/releases/tag/v0.9.0>, título `Sparta Desktop 0.9.0`,
prerelease, não draft e não latest. CI aprovado `31039393695`.

Seis anexos, e somente eles: `Sparta-Setup-0.9.0-x64.exe`, `checksums.txt`,
`sparta-release-manifest.json`, `sbom-api.json`, `sbom-desktop.json` e `release-notes.md`. O
blockmap não foi publicado. Os SBOMs são documentos de transparência, não publicação da API.

Todos os anexos foram baixados da própria release e comparados byte a byte. O instalador remoto
confirmou SHA-256 `24105e665e4cb94e41638ff7f85aed479b0a87c9442443a5d965baa6a2b228f9`,
FileVersion/ProductVersion `0.9.0` e `NotSigned`; a varredura remota não encontrou segredo e a
cópia temporária foi removida.

`API_PUBLICATION_STATUS=BLOCKED_BY_MISSING_INFRASTRUCTURE`. Nenhuma imagem, registry, Docker
remoto, migration externa ou deploy foi criado. `release-etapa27c-v1` segue `ACTIVE`, hashes
inalterados; replay `EXACT_REPLAY`, zero divergências/dependências. Etapa 31 não iniciada. Registro
completo em `docs/release-publication-0.9.0.md`.

## Etapa 30A: candidato 0.9.0 corrigido — `READY_FOR_DESKTOP_PUBLICATION`

Correção feita na origem e candidato regenerado do zero a partir de
`18ea00544fcfdf8cffb884ad8d7524ffee04db2f`. O build do `@sparta/riot` limpa `dist` e exclui
testes/fixtures; o electron-builder exclui de forma geral fixtures, mocks, snapshots, testes,
TypeScript, source maps, `.env`, logs e caches inclusive nas dependências do workspace. A inspeção
automatizada abre o `app.asar` real com `@electron/asar`, procura caminhos e payloads proibidos e
aprovou 2.584 entradas com zero achados.

Descoberta de artefatos agora é estrita: exige exatamente o instalador e blockmap canônicos da
versão corrente, rejeita antigos/ambíguos e valida FileVersion, ProductVersion, ProductName e
CompanyName no binário. Treze testes novos protegem o ASAR e o inventário. Pipeline limpo passou
typecheck, lint, build, 1.089 testes TypeScript e 1 teste Python; manifesto, SBOM, checksums e os
dois inventários foram regenerados.

Instalação antiga → atualização nova → execução → desinstalação foi exercitada no mesmo caminho
com espaços e acento. O ASAR instalado foi substituído pelo novo, a árvore ficou 75/75 sem
excedentes, atalhos não duplicaram, o app carregou por `file:` sem Vite e teve zero erro de
renderer/preload/console. A desinstalação removeu pasta, atalhos e registro.

Não regressão operacional: API local recriada com
`sha256:1268f2921b44c8abb085afb0e89527a4204c9bd66f66de4445ff10874a1badc4`; o mesmo input e sessão
preservaram `sessionId`/`snapshotId` com `UNCHANGED` e os cinco candidatos/scores/coberturas.
Replay `EXACT_REPLAY`, zero divergências; `release-etapa27c-v1`, `artifactHash` e `configHash`
inalterados; zero fallback real, erro de hash ou log de erro/fatal.

Estado final do desktop: **`READY_FOR_DESKTOP_PUBLICATION`**. Estado da API:
**`BLOCKED_BY_MISSING_INFRASTRUCTURE`** — não existe registry, ambiente, servidor, domínio, backup
ou rollback real. Nada publicado: sem tag, GitHub Release, imagem remota, instalador remoto ou
Etapa 31. Relatório: `docs/release-publication-0.9.0.md`.

## Etapa 30: publicação 0.9.0 bloqueada no checkpoint pré-publicação

Auditoria completa em `docs/release-publication-0.9.0.md`, executada antes de qualquer mutação
externa. **Nada foi publicado**: sem tag `v0.9.0`, GitHub Release, upload de instalador, imagem
remota ou deploy da API.

Git e CI conferem em `c3b5c6f`; hashes do instalador/SBOM/blockmap conferem; instalador é 0.9.0,
Publisher `J-Pantaroto`, `NotSigned`; imagem local bate com o manifesto; banco local tem 21
migrations, `release-etapa27c-v1` como única ativa e bundle mais recente em `EXACT_REPLAY`.

**Bloqueador do instalador:** o `app.asar` contém as fixtures sintéticas `match-detail.json` e
`match-timeline.json` do próprio `@sparta/riot`, duplicadas em `src/mappers/__fixtures__` e
`dist/mappers/__fixtures__`. Não há segredo nem dado real, mas são arquivos de teste indevidos e
contradizem a allowlist/documentação. Corrigir exige novo empacotamento, novos hashes/manifesto,
revalidação completa e aprovação de novo commit; não modificar o candidato congelado em silêncio.

**Bloqueador documental:** `docs/release-candidate.md` ainda aponta artefatos 0.1.0 e o espelho em
`.ai/specs/` está ainda mais antigo. Regenerar ambos apenas junto do candidato sucessor.

**API bloqueada:** não existe registry, ambiente GitHub, deployment, secret/variável de deploy,
servidor, domínio, backup ou rollback real. O Compose local usa `NODE_ENV=development` e não é
produção. Não inventar infraestrutura. Se um candidato corrigido for aprovado sem API pública, a
GitHub Release deve começar como prerelease, não latest.

## Etapa 29: release candidate 0.9.0 congelado — `READY_FOR_PUBLICATION`

Parecer final em `docs/release-readiness.md`: **`READY_FOR_PUBLICATION`**, sem nenhum
`PUBLICATION_BLOCKER`. **Nada foi publicado** — sem GitHub Release, sem registry, sem distribuição
do instalador. Isso autoriza publicar; a publicação é decisão separada, por
`docs/runbook-publication.md`.

**Versão oficial 0.9.0, não 1.0.0.** O escopo local está completo, mas os dados globais (matchup,
meta, builds, runas) dependem de Riot Production Key, o instalador não é assinado, e contratos
públicos ainda se movem — o `ReplayInputBundle` foi 1.0.0 → 2.0.0 uma etapa atrás. 1.0.0
comunicaria escopo fechado e estabilidade de contrato; nenhum dos dois é verdade.
`scripts/sync-version.mjs` faz do `package.json` da raiz a **fonte de verdade única** e propaga para
5 `package.json`, o `pyproject.toml` e **dois literais em código** (a versão do OpenAPI e a que o
bridge do preload expõe ao renderer). `pnpm version:check` entrou no CI.

**Manifesto só de fonte real** (`scripts/release-manifest.mjs` → `artifacts/releases/0.9.0/`):
`git`, `docker image inspect`, o arquivo em disco e o Postgres. Campo sem fonte faz o gerador
**falhar** — manifesto com valor inventado é pior que ausente, porque parece verificado. A
assinatura é lida do **binário**, não do log do empacotador. Limitações vêm de
`release/known-limitations.json`, versionado.

**Reprodutibilidade medida, não alegada** (`docs/release-reproducibility.md`). Determinísticos:
`app.asar`, `Sparta.exe`, os SBOM, a árvore de 2604 entradas do asar e **o conteúdo extraído do
instalador** — 75 arquivos, byte a byte iguais em duas gerações. Não determinísticos: o `.exe` do
NSIS e a imagem. Causa verificada, não suposta: no instalador o `TimeDateStamp` do PE é **idêntico**
(é o stub pré-compilado) e o que muda em `0xDA18` é o tamanho do fluxo comprimido — entrada igual,
saída diferente, logo é o compressor; na imagem, só as 6 camadas da base coincidem, porque cada
`COPY`/`RUN` grava mtime. Daí as regras nos runbooks: publicar a imagem **por digest**, e verificar
o instalador pelo **conteúdo extraído**, não pelo hash do `.exe`.

**Documentação**: `docs/user-guide.md` e `docs/release-notes.md` (matchup/meta/builds/runas globais
aparecem como **inexistentes** nesta versão, não como temporariamente indisponíveis; SmartScreen
explicado sem eufemismo), `docs/runbook-publication.md` (API antes do instalador, publicação por
digest, smoke tests com resultado esperado explícito) e `docs/runbook-rollback.md` (critérios
objetivos de aborto em tabela, rollback por digest e não por reconstrução, migration aditiva vs
destrutiva sem prometer reversão automática). Comandos exercitados localmente, nenhum contra
infraestrutura externa.

**Instalação exercitada como usuário real**, em processo **não elevado** (tarefa agendada com
privilégio `LIMITED`): caminho padrão por usuário sem pedir administrador, caminho com espaço e
acento, 1 atalho de cada, app abrindo de `file://…/app.asar` sem Vite. Atualização por cima
preservou os dados locais, **removeu** um arquivo obsoleto plantado e não duplicou atalho.
Desinstalação removeu pasta, atalhos e registro; preservou os dados do usuário por desenho e não
tocou no League.

**Smoke test com os artefatos congelados**: 5 candidatos idênticos à linha de base, `SAVED`, bundle
`replay-input-bundle/2.0.0` com configuração embutida, `EXACT_REPLAY` com 0 divergências,
`release-etapa27c-v1` `ACTIVE` conferindo com o manifesto em id/versão/`artifactHash`/`configHash`,
0 fallback, `SIGTERM` em 1296 ms com exit 0, 10 telas com 0 erro de renderer/preload/main.

**Dois defeitos reais corrigidos**: (1) os dados do usuário iam para `%APPDATA%\@sparta\desktop` —
o Electron deriva `app.getName()` do `name` do package.json empacotado (`@sparta/desktop`) e a barra
do escopo vira subpasta; `app.setName("Sparta")` antes do `whenReady`, e corrigir **agora** não
custa nada, depois de publicado custaria abandonar o perfil de quem já instalou; (2) o
`electron-builder` não limpa `dist-installer/`, e o instalador do 0.1.0 sobreviveu — o manifesto do
0.9.0 registrou **ele** e o SHA-256 dele.

**Duas limitações novas, descobertas pela validação e registradas em vez de silenciadas**: o rótulo
de replay antes da primeira verificação (`FULL_DERIVATION_REPLAY_UNAVAILABLE` cobre dois estados; o
`reason` distingue, o rótulo visível não) e a instalação a partir de terminal elevado indo para
Program Files (o instalador declara `asInvoker` e nunca pede elevação — só herda token já elevado).
Nenhuma reclassificada para baixo para permitir concluir a etapa.

## Etapa 28b: hardening final e candidato de release local

Fecha, com resultado **medido**, cada risco que a 28a tinha registrado como aberto. Relatório em
`docs/security-audit.md` §11–18; inventário do candidato em `docs/release-candidate.md`; política de
migrations em `docs/database-migrations.md`.

**Electron 37 → 39.8.10**, feito isolado e antes de tudo. Zera os 17 advisories que a 28a marcou
`ACCEPTED_RISK`, e a revalidação foi no **app empacotado**, não no dev server: `window.open` externo
devolve `null`; `ipcRenderer`/`require`/`process`/`Buffer`/`global`/`module` todos `undefined`; CSP
aplicada; 0 erro de console. Nenhum controle foi afrouxado para a atualização passar.

**Dockerfile multi-stage: 1,58 GB → 513 MB, boot 3444 ms → 836 ms.** Três estágios sobre a mesma
imagem-base fixada por digest (`node:20-slim@sha256:2cf067cf…`). O detalhe que faz a diferença é
`rm -rf node_modules` **antes** do `pnpm install --prod` — sem isso a store virtual do pnpm sobrevive
e as devDependencies continuam na imagem, com o `--prod` mudando só os links.

**Redação de log** (`apps/api/src/http/log-redaction.ts`): o PUUID no caminho vira rótulo opaco com
sal de processo (`pid_3907b354893f`), estável dentro da execução para correlacionar requisições e sem
nenhuma subsequência do original. O serializador não coleta headers, e o `redact` do pino cobre
`authorization`/`cookie`/`set-cookie` — as duas camadas se reforçam em vez de uma depender da outra.

**Um índice criado, três recusados.** `MatchParticipant.riotAccountId` tem `EXPLAIN ANALYZE` antes e
depois (`Seq Scan` 14.75 → `Index Scan` 9.53). As outras três FKs sem índice não ganharam: nas
cardinalidades reais o planejador escolhe varredura sequencial de qualquer jeito.

**O achado da 28a sobre a migration revertida estava errado.** `_prisma_migrations` tem **duas**
linhas para `20260727234500_http_cache_states`: uma tentativa que nunca terminou
(`applied_steps_count = 0`, marcada revertida) e a aplicação bem-sucedida 92 s depois (`= 1`). A
coluna `ApiCacheEntry.collectedAt` existe. Schema consistente, nada a corrigir — a linha revertida é
registro honesto e fica onde está.

**Instalador Windows configurado e exercitado, não publicado.** `apps/desktop/electron-builder.yml`:
NSIS x64 por usuário, `files` como allowlist mais exclusões explícitas, sem bloco `publish`. O `asar`
foi conferido entrada a entrada — 0 `.ts`/`.tsx`/`.map`/`.test.*`/`tsconfig*`/`.env*`, 0 referência a
`src/`. Instalação silenciosa em `C:\…\Sparta Validação` (acento e espaço), `ExitCode 0`, atalhos e
entrada de desinstalação criados; o app instalado abriu de `file://…/app.asar` (sem Vite) e passou as
**10 telas** com 0 imagem quebrada, 0 `NaN`/`undefined`, 0 erro de console/main/preload. **Não
assinado**, confirmado no binário (`Get-AuthenticodeSignature` → `NotSigned`) — o log do
electron-builder imprime "signing with signtool.exe" mesmo sem certificado, e a linha é enganosa.

**Dois bugs reais no caminho**: (1) o `electron-builder` não subia — `app-builder-lib` faz
`require()` de `@noble/hashes@2`, ESM-only (`ERR_REQUIRE_ESM`); resolvido com override **escopado**
(`app-builder-lib>@noble/hashes`) para o pin não vazar; (2) o ícone do instalador estava sendo
ignorado pelo git — a regra genérica `build/` casava com `apps/desktop/build/`, e num clone limpo o
`package:win` produziria o instalador com o ícone padrão do Electron.

**Inventário** (`scripts/release-inventory.mjs` → `docs/release-candidate.md`): commit, versão do
app, Electron, digest da imagem-base e da construída, SHA-256 dos artefatos, as 21 migrations e SBOM
de produção (API 140 pacotes, desktop 28, com licença). O gerador não lê `.env`, não lê variável de
ambiente do projeto e não consulta o banco.

**Não regressão**: mesma recomendação controlada contra a API reconstruída do zero →
**5 candidatos idênticos** em score, cobertura, rank, categoria, motivos e alertas (Viego 58.7/0.9,
Udyr 58.5/0.5, Vi 55.3/0.5, Nocturne 53.3/0.5, Graves 50.1/0.5). `release-etapa27c-v1` continua
**`ACTIVE`** com `artifactHash` e `configHash` iguais; snapshot novo com bundle
`replay-input-bundle/2.0.0` e `verify-replay` em **`EXACT_REPLAY`, 0 divergências**.

**Sob falha, medido no container**: reinício preserva a release ativa; cache `MISS` → `HIT` dentro do
TTL; Postgres derrubado dá 500 com corpo genérico e o `PrismaClientKnownRequestError` só no log (sem
vazar `prisma`, `postgres`, `5432`, tabela, `DATABASE_URL` ou stack), com a API de pé; `SIGTERM`
encerra em 864 ms com exit code 0. Ressalva: derrubar o Postgres inteiro exercita o caminho de erro
sanitizado, **não** o fallback do provider — a rota de leitura consulta o repositório direto; o
fallback está coberto por teste automatizado.

`pnpm audit` volta **0** em dev e em produção. 8 testes novos; **1076** no monorepo (core 620, riot
96, api 285, desktop 73, raiz 2). Nada publicado: sem GitHub Release, sem distribuição externa, sem
publicação automática.

## Etapa 28a: auditoria de segurança e prontidão para release

Auditoria completa com a release ativa, corrigindo só o comprovado e de baixo risco. Relatório em
`docs/security-audit.md` (inventário, severidade, evidência, correção, risco aceito, adiados).

**Dependências**: 14 high → 4 high via `pnpm.overrides` só com patch/minor (`fast-uri`,
`find-my-way`, `@fastify/static`, `brace-expansion`, `postcss`). As 4 restantes são **todas do
Electron** e exigem major 37 → 39 — adiadas com análise de alcance: cada uma depende de uma API que
o Sparta não chama ou de conteúdo web hostil, que a CSP e as novas guardas impedem.

**Dois bugs reais achados na própria auditoria, ambos meus.** (1) `setErrorHandler` estava
registrado **depois** dos `register`: no Fastify cada contexto encapsulado herda o handler
existente quando é criado, então ele **nunca chegava às rotas** — a primeira versão da correção de
sanitização era ilusória, e só apareceu porque escrevi o teste antes de dar o item por resolvido.
(2) `request()` injetava `Content-Type: application/json` em **toda** requisição: era a causa comum
das três ocorrências de `FST_ERR_CTP_EMPTY_JSON_BODY` (26b, 27c e as duas pendentes). Corrigido no
ponto central, e os contornos `body: "{}"` foram removidos.

**API**: erro de schema virou 400 sanitizado (era 500 com o dump do zod, expondo o schema interno);
erro interno devolve mensagem genérica com o detalhe indo pro log; cabeçalhos de endurecimento em
toda resposta; `/docs` publicado só com `NODE_ENV === "development"` — **opt-in**, para ambiente
sem `NODE_ENV` não ganhar documentação por omissão.

**Electron**: `sandbox: true` explícito, `setWindowOpenHandler` negando por padrão, guarda de
`will-navigate`. Verificado como já seguro: bridge com allowlist de 9 métodos, sem `ipcRenderer`/
`require`/`process` no renderer, e `download-skin` com https + allowlist de host + `basename()`.

**Containers**: deixou de rodar como **root** (`USER node`); lockfile copiado com
`--frozen-lockfile` (o build resolvia dependências do zero, e a imagem podia divergir em silêncio
do conjunto auditado); `HEALTHCHECK`; `restart: unless-stopped`; encerramento controlado em
`SIGTERM`/`SIGINT` (antes a transação em curso ficava para o timeout do Postgres).

**A release ativa não mudou**: mesmo contexto controlado antes e depois deu ranking **idêntico**
(Viego 58.7 / Udyr 58.5 / Vi 55.3 / Nocturne 53.3 / Graves 50.1), `artifactHash`/`configHash`
inalterados, e replay `EXACT_REPLAY` com 0 divergências tanto no snapshot novo quanto no da linha
de base. **Build empacotado exercitado** a partir de `out/`, sem dev server, em caminho com espaço
e acento — 0 erro de console, 0 imagem quebrada, bridge com exatamente os 9 métodos.

**Adiado**: Electron major, devDeps na imagem (que cresceu de 1,06 GB para 1,58 GB com o
`--frozen-lockfile`; resolver exige multi-stage, que não é mudança de baixo risco), PUUID em log de
acesso, FKs sem índice, migration revertida com arquivo presente, imagem-base sem digest,
configuração de instalador. 1066 testes. Ver
`.ai/prompts/features/0034-auditoria-seguranca-prontidao.md`.

## ESTADO OPERACIONAL ATUAL: `release-etapa27c-v1` está ATIVA

**A configuração operacional do Sparta não é mais a baseline.** Autorizada explicitamente pelo
usuário depois da Etapa 27c, `release-etapa27c-v1` foi ativada e **mantida ativa** — a primeira
release do projeto a ficar no ar de forma sustentada. As 11 validações pedidas passaram.

Pré-ativação registrado: baseline em uso, `READY_FOR_ACTIVATION`, `artifactHash`
`8878a657…`, `configHash` `fa9dbde1…`, `validatedArtifactHash == artifactHash`, validação
`VALID`, equivalência `MATCH`, 0 releases ativas.

Pós-ativação: 1 release `ACTIVE` com o ponteiro apontando pra ela; `artifactHash`/`configHash`
**idênticos** aos de antes (inclusive os internos do `artifactJson`); cache invalidado
(`cacheInvalidated: true`, depois `MISS` → `HIT`); `GET /recommendation-engine/active-release`
devolvendo `RELEASE` **sem** as tabelas de baseline; recomendação real `SAVED`; **9 conferências
cruzadas** entre snapshot e bundle todas `t`, incluindo a configuração efetiva byte a byte igual
nos dois; bundle em `replay-input-bundle/2.0.0`; e o replay offline em **`EXACT_REPLAY` com 0
divergências** — exatamente o cenário que deu 10 divergências na ativação da 27b.

**Independência de fontes externas provada por três vias**: (1) a API foi reiniciada, zerando o
cache em memória, e o replay seguiu exato; (2) o snapshot da 27b tem `configHash` `2cefcade…` e a
release dona desse hash **ainda existe no banco** (`ROLLED_BACK`) — se o verificador resolvesse
configuração por hash, ele a acharia, mas devolve `MISSING_EFFECTIVE_CONFIGURATION`; (3)
estruturalmente, `verifySnapshotReplay` só consulta `recommendationSnapshot`, `draftSession` e
`replayInputBundleRecord`.

Zero fallback, zero `hash_mismatch`, zero erro, 10/10 HTTP 200, zero `NaN`/`Infinity`/`undefined`.
Electron com "Release ativa" exibida, "Fallback para baseline em uso" **ausente**, 0 erro de
console e 0 imagem quebrada.

**Efeito operacional**: o ranking sob a release (Viego 58.7 / Udyr 58.5 / Vi 55.3 / Nocturne 53.3
/ Graves 50.1) difere do da baseline (60.4 / 54.3 / 51 / 49.6 / 46.8) — os pesos calibrados
valorizam mais `TEAM_COMPOSITION`. A diferença agora é **reproduzível**: o mesmo resultado sai do
replay offline a partir só do bundle.

Estado: `release-etapa27c-v1` `ACTIVE` (ponteiro confere), `release-etapa27b-v2` `ROLLED_BACK`,
`release-etapa27b-validacao` `VALIDATION_FAILED`, candidata `APPROVED_FOR_FUTURE_RELEASE`. Ver
`.ai/prompts/features/0033-ativacao-release-etapa27c-v1.md`.

## Etapa 27c: replay autossuficiente para configurações promovidas

Corrige o achado bloqueante da ativação da `release-etapa27b-v2` (seção abaixo): o
`ReplayInputBundle` passa a preservar a **configuração efetiva completa**, não só o `configHash`.

**`replay-input-bundle/2.0.0`** ganha `effectiveRecommendationConfiguration`. Opcional no tipo só
porque bundle v1 legitimamente não o tem; a validação exige presença quando o schema é v2.
**A canonicalização é versionada**: acrescentar o campo incondicionalmente mudaria o `contentHash`
de todo bundle v1 **já persistido**, que passaria a falhar integridade — backfill silencioso pela
porta dos fundos. O ramo v1 devolve a mesma string de antes; só o v2 acrescenta a configuração,
canonicalizada por `canonicalConfigurationContent` (a mesma que produz o `configHash`) mais
`version`/`configHash` à parte.

**A causa raiz era o tipo do registro.** `ReplayImplementation` agora exige a configuração como
**segundo parâmetro obrigatório** — antes ela era opcional em `replayRecommendationEngineV1` e o
tipo do registro a apagava, produzindo fallback silencioso para a baseline. Não existe mais como
chamar o replay sem dizer com qual configuração; o compilador achou sozinho os pontos que o tipo
antigo escondia.

**`resolveBundleConfiguration` tira a configuração só do bundle**: v2 usa a embutida (inclusive a
baseline embutida, **direta**, não recalculada das constantes atuais — senão um ajuste futuro
delas mudaria em silêncio o replay de um snapshot antigo); v1 sem `configHash` é anterior à 27b,
quando release não existia; v1 **com** `configHash` é desambiguado pelo próprio bundle,
recalculando a baseline do cenário e comparando o hash. Bate → era baseline, replay exato. Não
bate → era release. **Não** se busca o artefato pelo hash, o que reintroduziria fonte externa no
caminho de verificação. Isso funciona porque a baseline varia por cenário: os dois bundles de
baseline reais têm hashes distintos, e o de release tem outro.

**`MISSING_EFFECTIVE_CONFIGURATION`** (status + capacidade
`FULL_DERIVATION_REPLAY_MISSING_CONFIGURATION`) classifica honestamente o bundle v1 de release:
distinto de `INVALID` (nada corrompeu) e de `UNAVAILABLE` (os inputs de derivação estão lá). O
replay **não roda** — executar a baseline produziria as mesmas 10 divergências enganosas.
`reweightAvailable` continua `true`. Seis rejeições novas cobrem hash da configuração, coerência
origem/`releaseId`, parâmetros e compatibilidade; configuração adulterada invalida o bundle antes
de qualquer execução.

**Bug real corrigido no caminho**: `validateRelease` no cliente do desktop fazia `POST` sem corpo
com `Content-Type: application/json` — 400 `FST_ERR_CTP_EMPTY_JSON_BODY` antes de a rota rodar,
mesmo defeito da 26b. Introduzido por mim na 27b, só exposto ao exercitar a validação pelo caminho
real; o botão "Validar" nunca teria funcionado. As duas ocorrências pendentes em
`generateDraftComparison`/`revealDraftReviewResult` seguem fora de escopo.

**Validado real**: em **conta isolada** (criada, exercitada e removida sem resíduo), o cenário
exato que causou o rollback — recomendação sob release ativa — replayou com **`EXACT_REPLAY` e 0
divergências**; com os pesos da release **adulterados no banco** e depois com a release
**deletada**, o replay seguiu exato; ciclo ativação → rollback pela API com o replay do snapshot
da release continuando exato **depois** do rollback. No universo real de 16 bundles: **13 pré-27b
e 2 de baseline → `EXACT_REPLAY`**; o único de release → `MISSING_EFFECTIVE_CONFIGURATION` com **0
divergências** (eram 10). Ranking da baseline **idêntico** ao anterior. Electron com 0 erro de
console, 0 imagem quebrada, 0 `NaN`/`undefined`.

Ao fim desta etapa a conta real seguia na baseline, com `release-etapa27c-v1` apenas em
`READY_FOR_ACTIVATION` — mas ela **foi ativada depois**, sob autorização explícita do usuário, e
**continua ativa**: ver a seção no topo deste arquivo. `release-etapa27b-v2` continua
`ROLLED_BACK` (terminal). 24 testes novos (620 em `packages/core`; 1052 no monorepo). Sem
migration — o bundle é JSONB. Ver `docs/replay-input-bundle.md` e
`.ai/prompts/features/0032-replay-autossuficiente-configuracao.md`.

## Ativação real de `release-etapa27b-v2`: ativada, reprovada no replay, revertida

Autorizada explicitamente pelo usuário depois da Etapa 27b. A ativação **funcionou como
projetado**; o que reprovou foi uma consequência estrutural que só aparece com uma release de fato
ativa — nenhuma validação anterior podia tê-la visto, porque todas rodaram com a baseline em uso
(a ativação da 27b foi exercitada numa conta isolada onde nenhuma recomendação nova foi gerada e
replayada).

**Achado bloqueante: o `ReplayInputBundle` não preserva a configuração efetiva, só o
`configHash`.** `verifyReplayBundle` chama `implementation(bundle)`, e o tipo do registro
(`ReplayImplementation = (bundle) => ...`) **apaga** o segundo parâmetro opcional `configuration`
que `replayRecommendationEngineV1` aceita desde a 27a — ele é sempre `undefined` na verificação, e
o motor reconstrói com `selectWeights(draft)`, a **baseline**. O snapshot, porém, foi produzido com
os pesos da **release**. O contrato do bundle não tem campo para a configuração: guarda só
`algorithmVersions.recommendationConfiguration = <configHash>`, e um hash **identifica** mas não
**reconstrói**. Com qualquer release ativa, todo snapshot novo fica irreplayável — quebra a
garantia central da Etapa 26.

**Medido na conta real**: snapshot de origem `RELEASE` → `REPLAY_INTEGRITY_FAILED` com **10
divergências**; snapshot `BUILT_IN_BASELINE` (pós-rollback) → `EXACT_REPLAY` com **0**. A prova de
causa: os valores `reconstruido` das divergências (Viego 60.4, Udyr 54.3, Vi 51, Nocturne 49.6) são
**exatamente** os scores que a baseline produz, medidos na recomendação gerada logo após o
rollback. Divergiram score **e** cobertura (0.9 vs 0.7; 0.5 vs 0.2), porque a release pontua
métricas que as tabelas de blind/lane revelada da baseline zeram.

**Tudo o mais passou**: ativação atômica (200, transação serializável); 1 ponteiro / 1 release
`ACTIVE` / ponteiro apontando pra ela; `artifactHash` e `configHash` **idênticos** antes e depois e
`validatedArtifactHash == artifactHash` (artefato jamais tocado); cache invalidado nas duas
transições, com a resolução seguinte vindo `MISS` e nunca `HIT` de valor velho; configuração
operacional alternando `BUILT_IN_BASELINE` → `RELEASE` → `BUILT_IN_BASELINE`; recomendação real
`SAVED`; as **7 conferências cruzadas** de origem/releaseId/versão/`configHash` entre coluna, JSON
da configuração, `algorithmVersions` do snapshot e do bundle todas `t`; logs com **0** fallback, 0
`hash_mismatch`, 0 `resolve_failed`, 0 erro, 0 HTTP 4xx/5xx (9/9 em 200), 0
`NaN`/`Infinity`/`undefined`.

**Rollback** imediato conforme instruído, motivo gravado em `rolledBackReason` e no evento
append-only. Estado final: **0 ponteiros, 0 releases `ACTIVE`, configuração operacional
`BUILT_IN_BASELINE`**, replay de volta a `EXACT_REPLAY`. `release-etapa27b-v2` fica em
`ROLLED_BACK` (terminal pelo grafo da 27a) — reativar exige artefato novo, o que é correto: o
artefato está íntegro, mas o **sistema** ainda não sabe replayar o que ela produz.

**Correção necessária antes de qualquer reativação**: embutir a configuração efetiva no
`ReplayInputBundle` (novo campo, dentro da canonicalização e do `contentHash`, nova
`schemaVersion`; bundles antigos seguem válidos como baseline) e repassá-la ao motor no replay. A
alternativa — alargar o tipo do registro e carregar a configuração pelo `configHash` — é mais
barata mas reintroduz dependência de fonte externa no caminho de verificação, exatamente o que a
Etapa 26 evitou. Nenhuma das duas foi implementada: o pedido era ativar e validar, e a instrução em
caso de falha crítica era reverter e registrar. Ver
`.ai/prompts/features/0031-ativacao-release-etapa27b-v2.md`.

## Etapa 27b: persistência e operação segura de releases (encerra a Etapa 27)

A 27a deixou o domínio puro pronto (configuração efetiva, baseline explícita, artefato imutável,
equivalência laboratório×motor, hashes, máquina de estados). Esta etapa constrói a camada
operacional em volta dele **sem contaminar `packages/core`** — que continua em 596 testes,
inalterado, sem nenhum acesso a banco, cache, ambiente ou provider.

**Migration `20260803150000_recommendation_engine_releases`**: `RecommendationEngineRelease`
(artefato completo + ciclo de vida + autoria + validação), `RecommendationEngineActivePointer`
(uma linha por conta; **ausência = baseline**, é o que garante "só uma ativa" estruturalmente) e
`RecommendationEngineReleaseEvent` (append-only). Mais cinco colunas **nullable** de eco da
configuração em `RecommendationSnapshot` — snapshot antigo fica nulo e **nunca** é preenchido
retroativamente (medido: 15 snapshots, 0 com `configHash`).

**`candidateId` vs `candidateRevisionId`**: o primeiro é o `lineageId` (identidade estável entre
revisões, sem FK); o segundo é a revisão **exata** congelada pelo artefato, e é o único com FK.
Candidata alterada depois não muda release nenhuma.

**`status = "ACTIVE"` não significa "é a ativa agora".** O grafo da 27a só permite `ACTIVE →
ROLLED_BACK`, então uma release superada por outra mais nova continua com esse status até ser
revertida. Quem é a ativa agora é o **ponteiro** — `ReleaseRow` expõe os dois fatos separados
(`status` e `currentlyActive`), e rollback só aceita a release efetivamente apontada.

**Provider** (`active-configuration-provider.ts`): `resolve`/`invalidate`, cache por conta com TTL
de 30 s, recanonicalização e comparação de hash **antes do uso**, fallback pra última configuração
válida conhecida quando o banco falha e pra baseline sem ela. Nunca devolve configuração inválida
nem pesos vazios, e nunca lança. Resolvido **uma vez por avaliação** dentro de
`buildEvaluationContext`, junto das outras fontes mutáveis: a mesma instância congelada alimenta
motor, snapshot, bundle e observabilidade — nenhuma consulta dentro de função de score.

**Decisão sobre a baseline**: o provider **não** a resolve — devolve só `BUILT_IN_BASELINE`, e quem
tem o `DraftState` chama `buildBaselineConfiguration`. A baseline depende do cenário do draft
(blind/lane revelada/meio do draft usam tabelas diferentes), e resolvê-la no provider exigiria
passar o draft inteiro pra um componente cujo trabalho é só ler a release ativa. `GET
/recommendation-engine/active-release` sem release ativa devolve as **três tabelas reais**, uma por
cenário, em vez de fabricar "a" baseline única que não existe.

**`configHash` entra em `algorithmVersions`** (chave `recommendationConfiguration`), que já é
`Record<string,string>` livre — nenhum tipo do core mudou. Consequência deliberada: trocar de
release força snapshot novo mesmo com draft idêntico, porque o hash do input canônico muda.

**Ativação e rollback**: transação **serializável** com reivindicação atômica por `updateMany`
condicional no status (mesmo padrão de `PENDING → RUNNING` da 25b). Ativação exige
`READY_FOR_ACTIVATION`, revalida `validatedArtifactHash === artifactHash`, grava
`previousReleaseId`, e invalida o cache **depois do commit**. Rollback restaura o ponteiro pro
anterior **sem reconstruir parâmetro nenhum** (o artefato anterior já está persistido e imutável);
sem anterior, apaga o ponteiro e volta à baseline. As rotas de ativação/rollback aceitam só
`releaseId` (na URL) e `reason` — o schema zod não tem campo de peso, então peso no corpo é
ignorado por construção.

**Bug real encontrado só na validação contra o Postgres real**: `decideCandidate` (25b) grava a
decisão na **coluna** `status`, mas o `configJson` congelado guarda o status da **criação** (que a
25b só permite ser `DRAFT`/`READY`). A primeira versão lia o JSON e reprovava toda candidata
aprovada com `INVALID_CANDIDATE_STATE`. Nenhum teste sintético pegaria — o fixture monta o
candidato já com o status certo. Corrigido sobrepondo a coluna (autoritativa).

**Interface**: dois blocos novos no Laboratório do motor, sem redesenhar a tela — "Configuração
operacional atual" (só leitura: a release ativa com pesos reais, ou "Fallback para baseline em uso"
com as três tabelas) e "Releases" (preparar/validar/ativar/reverter, com **confirmação em dois
passos**). **Zero campos de peso** em qualquer tela de release.

**Validado real** (Docker reconstruído, Postgres real, Zekerus#117): baseline confirmada em uso;
**3 snapshots pré-27b replayados pelo motor novo com `EXACT_REPLAY` e zero divergências** — prova
direta de que o resultado operacional anterior foi preservado exatamente, mais forte que comparar
scores à mão; release validada até `READY_FOR_ACTIVATION` com equivalência laboratório×motor
**`MATCH` em 2 casos reais, 0 divergências**; `NO_EXACT_REPLAY_CASES` bloqueou corretamente um
experimento cujo único caso não tinha bundle; transições inválidas → 409/404/401; ativação e
rollback exercitados numa **conta isolada** (baseline → v1 → v2 → rollback restaura v1 → rollback
volta à baseline), removida por completo depois; **4 ativações concorrentes → 1 sucesso e 3
conflitos**, 1 ponteiro, 1 evento; hash adulterado caiu pra baseline sem chegar ao motor; cache
`MISS` → `HIT` e invalidação refletida na hora; Electron com 0 erros de console, 0
`NaN`/`undefined`, 0 imagens quebradas.

**A candidata real permanece `APPROVED_FOR_FUTURE_RELEASE`.** A release dela ficou em
`READY_FOR_ACTIVATION` ao fim desta etapa — mas foi **ativada depois**, sob autorização explícita
do usuário, reprovou na integridade do replay e foi revertida; hoje está em `ROLLED_BACK`. Ver a
seção no topo deste arquivo. A configuração operacional continua sendo a baseline.

22 testes novos em `apps/api` (263 no total do pacote; core 596, riot 96, desktop 73). Ver
`docs/release-operations.md`.

## Etapa 27a: domínio de releases operacionais (domínio puro)

A Etapa 25 deixou o laboratório aprovar uma candidata (`APPROVED_FOR_FUTURE_RELEASE`) e a Etapa 26
deixou reproduzir os inputs históricos exatos de um snapshot — mas nada ainda transformava uma
candidata aprovada num artefato operacional ativável. `packages/core/src/release/` (cinco
arquivos novos) fecha esse contrato, **sem** migration, tabela, provider, rota, tela ou ativação
real — isso fica pra Etapa 27b. Decisão arquitetural explícita do pedido: `packages/core`
continua sem acesso a banco/cache/env; a 27b será quem resolve a configuração ativa, valida/
aplica fallback e injeta no motor. O core só recebe uma configuração **já resolvida**.

**`effective-configuration.ts`** — `EffectiveRecommendationConfiguration` (versão, `configHash`,
pesos por métrica, métricas desligadas, regras pós-agregação, origem `BUILT_IN_BASELINE`/
`RELEASE`, compatibilidade do motor). `WeightableMetricKey` é uma união literal própria — derivar
do tipo largo de `calibration/engine-candidate.ts` devolveria o próprio tipo largo, já que aquele
export é intencionalmente amplo. `buildEffectiveConfigurationFromCandidate` deriva de uma
`CalibrationCandidate` aprovada, reaproveitando `resolvePostAggregationThresholds` da Etapa 25a.

**`recommendation-engine.ts` ganhou `input.configuration?` opcional** (aditivo — sem ela, caminho
idêntico a sempre). Com ela, pesos vêm de `engineWeightsFromConfiguration` e os thresholds pós-
agregação passam a ler da configuração em vez de constante fixa. Nova `buildBaselineConfiguration
(draft, options)` exportada — a baseline continua **dependente do cenário do draft** de propósito
(blind/lane revelada/meio do draft usam tabelas diferentes; só uma release já calibrada usa pesos
uniformes, mesma premissa que o laboratório já assume desde a Etapa 25 ao reponderar).

**Achado real: não associatividade de ponto flutuante.** A primeira versão quebrou "baseline
explícita reproduz exatamente o resultado atual" silenciosamente na última casa decimal
(`dataCoverage: 0.7999999999999999` vs `0.8`). `normalizeAvailableWeights` (pré-existente,
intocada) soma pesos com `Object.keys(weights).reduce(...)`, e a ordem de inserção de chaves de
`selectWeights` difere entre os três cenários e da ordem canônica de reconstrução — somar as
mesmas parcelas em ordem diferente muda o resultado em ponto flutuante. Corrigido preservando a
ordem de inserção original (nunca tocando `normalizeAvailableWeights`, fora de escopo alterar):
`buildBaselineConfiguration` grava `metricWeights` na ordem de `Object.keys(weights)` do cenário,
e `engineWeightsFromConfiguration` reconstrói na mesma ordem de `Object.keys(configuration.
metricWeights)` (chave ausente entra por último, valendo zero). Round-trip agora é bit a bit
idêntico — provado por teste `toEqual` na resposta inteira do motor.

**`release-artifact.ts`** — `RecommendationReleaseArtifact` congela candidata (id/revisão exata),
experimento (`ReleaseExperimentEvidence`, reaproveita `CalibrationExperimentReport` da Etapa 25b
inteiro), configuração efetiva, versões e compatibilidade. `artifactHash` exclui `createdAt`;
inclui tudo o mais, com filtros do experimento canonicalizados (ordem não importa).

**`laboratory-equivalence.ts`** — roda o motor operacional de verdade (`replayRecommendationEngineV1`,
ganhou parâmetro opcional `configuration`, mudança aditiva em `calibration/replay-verifier.ts`)
alimentado pelo `ReplayInputBundle` real (Etapa 26) de cada caso, e compara contra o ranking que
o laboratório persistiu. Prova que a reponderação por métrica congelada (Etapa 25, aproximada)
concorda com o motor de verdade executado com dado histórico real — não só consigo mesma. Ignora
candidatos `NOT_RECOMMENDED` do laboratório (o motor nunca os devolve). `draftStateFrom` exportado
de `replay-verifier.ts` pra reuso.

**`release-validation.ts`** — `validateReleaseArtifact`, nove estados checados em ordem (`VALID`,
`INVALID_CANDIDATE_STATE`, `EXPERIMENT_NOT_COMPLETED`, `CONFIG_HASH_MISMATCH`,
`UNSUPPORTED_PARAMETER`, `INCOMPATIBLE_ENGINE_VERSION`, `ARTIFACT_HASH_MISMATCH`,
`LABORATORY_RESULT_MISMATCH`, `NO_EXACT_REPLAY_CASES`) — a checagem mais cara (equivalência com o
motor) só roda depois de todas as estruturais passarem. Reaproveita `validateCalibrationCandidate`
(Etapa 25a) pra `UNSUPPORTED_PARAMETER` em vez de duplicar a classificação de capacidade de
replay. Nunca ajusta resultado divergente pra fazer bater.

**`release-state-machine.ts`** — `DRAFT → VALIDATING → {VALIDATION_FAILED,
READY_FOR_ACTIVATION} → ACTIVE → ROLLED_BACK`, mais `REJECTED` alcançável de
`VALIDATION_FAILED`/`READY_FOR_ACTIVATION`. `ACTIVE` só a partir de `READY_FOR_ACTIVATION`;
`ROLLED_BACK` só a partir de `ACTIVE`; `READY_FOR_ACTIVATION` exige `validation.status ===
"VALID"` explicitamente passada — o grafo permitir a transição não basta. Guarda extra de
`ARTIFACT_CHANGED` quando o hash do artefato não bate com o hash validado (artefato não pode ser
alterado depois de pronto).

**Não implementado nesta subetapa** (conforme escopo): migration, tabela, provider, rota, tela,
ativação real, rollback real, invalidação de cache, ou qualquer alteração da configuração
efetivamente usada pela API hoje. As duas ocorrências pendentes do bug de `POST` sem corpo em
`generateDraftComparison`/`revealDraftReviewResult` (sinalizadas na Etapa 26b) continuam fora de
escopo, não tocadas aqui.

68 testes novos em `packages/core` (24 configuração efetiva, 8 no motor + baseline explícita, 7
artefato/hash, 7 equivalência laboratório×motor, 11 validação dos 9 estados, 13 máquina de
estados) — 596 no total do pacote (996 agregados no monorepo: core 596, riot 96, desktop 73,
api 241). Cobrem a lista completa pedida: baseline reproduz resultado atual (com o bug de ponto
flutuante corrigido), configuração candidata reproduz o laboratório via bundle real (não só
métrica congelada), peso muda `configHash`/`artifactHash`, nome não muda, threshold de derivação
rejeitado, versão incompatível rejeitada (candidata com versão não reconhecida vs. artefato com
manifesto desatualizado — dois casos distintos), artefato adulterado falha, zero casos exatos
impede prontidão, release validada chega a `READY_FOR_ACTIVATION`, não fica ativa sozinha,
transição inválida bloqueada, `core` sem I/O, mesma entrada produz o mesmo ranking, baseline
preserva scores/ordenação anteriores.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos nos quatro pacotes TypeScript,
sem regressão em nenhum teste pré-existente. Ver `docs/release-domain.md`.

## Etapa 26b: superfície de leitura e verificação do ReplayInputBundle (encerra a Etapa 26)

A Etapa 26a entregou o domínio puro e uma primeira passada desta sessão já tinha fechado o núcleo
de risco (contexto único de avaliação, captura atômica snapshot+bundle na mesma transação — ver
logo abaixo). Esta segunda passada fecha o que faltava: **cinco** estados de capacidade (não três),
três rotas, o resumo na interface e observabilidade sanitizada.

`describeSnapshotReplayCapability` (`packages/core/src/calibration/replay-verifier.ts`) ganhou
`FULL_DERIVATION_REPLAY_INVALID` (bundle verificado e **reprovado** — `INVALID_BUNDLE` por
violação estrutural/hash, ou `REPLAY_INTEGRITY_FAILED` por o reconstruído divergir do persistido)
e `FULL_DERIVATION_REPLAY_UNSUPPORTED_VERSION` (`UNSUPPORTED_ALGORITHM_VERSION`/
`UNSUPPORTED_BUNDLE_SCHEMA`). Antes, os dois caíam dentro de `REWEIGHT_ONLY`/`UNAVAILABLE` — um
bundle inválido (sinal de problema real) ficava indistinguível de "não tínhamos os inputs". O
relatório ganhou `reweightAvailable` como campo **próprio**, separado do `capability`: mesmo num
estado `INVALID`/`UNSUPPORTED_VERSION`, o chamador ainda sabe se a reponderação da Etapa 25
continua funcionando como fallback.

**Três rotas novas** (`apps/api/src/modules/drafts/replay-bundle-repository.ts` +
`replay-bundle-routes.ts`), autenticadas e isoladas por conta: `GET
/draft-sessions/:sessionId/replay-capability`, `GET
/recommendation-snapshots/:snapshotId/replay-bundle-summary`, `POST
/recommendation-snapshots/:snapshotId/verify-replay`. Nenhuma expõe o `contentJson` completo — só
capacidade, schema, versões, hash, tamanho, datas, última verificação e dependências ausentes.
`verify-replay` é a única que reconstrói de fato: lê **exclusivamente**
`RecommendationSnapshot`/`PersistedRecommendation`/`ReplayInputBundleRecord` (os três registros
imutáveis da 26a — nenhuma tabela mutável entra) e persiste o resultado em
`ReplayInputBundleRecord.lastVerification`, sem reescrever bundle nem snapshot. As duas rotas
`GET` **nunca** disparam verificação nova — só leem o que já foi persistido, pra ficarem baratas e
sem efeito colateral.

**Interface**: `ReplayCapabilitySummary.tsx` (novo, compartilhado) — a frase da capacidade,
schema/motor/tamanho/captura quando há bundle, botão "Verificar replay". Reaproveitado sem
redesenhar nenhuma tela: o detalhe de sessão em "Histórico de drafts" e o caso aberto no
"Laboratório do motor" (Etapa 25b).

**Observabilidade**: captura (`persistDraftAnalysis`, `apps/api/src/modules/drafts/routes.ts`)
loga `replay_bundle_captured`/`_capture_failed` com schema, `contentBytes`, duração da
canonicalização e da persistência; verificação loga `replay_bundle_verified` com schema, status,
contagem de divergências e duração — nunca o conteúdo do bundle nem as divergências detalhadas.

**Dois bugs reais encontrados só na validação pela UI real do Electron (não pelo curl inicial,
que não reproduzia o problema)**: (1) o cliente do desktop (`services/api-client.ts`) sempre manda
`Content-Type: application/json`, mesmo em `POST` sem corpo — o Fastify recusa isso com
`FST_ERR_CTP_EMPTY_JSON_BODY` (400) **antes** de a rota rodar. `verifySnapshotReplay` passou a
mandar `body: "{}"`. As outras duas ocorrências do mesmo padrão no arquivo
(`generateDraftComparison`, `revealDraftReviewResult`) ficaram fora do escopo desta etapa,
sinalizadas à parte pra correção separada. (2) o botão "Verificar replay" fica dentro do
`<button>` do `InteractiveCard` pai (mesmo padrão que o botão de revisão humana da Etapa 24 já
usa) — sem `event.stopPropagation()`, o clique também alternava o card e escondia o resultado que
acabara de chegar. Os dois corrigidos.

**Validado real** (Docker reconstruído, Postgres real, conta Zekerus#117): nova recomendação via
`POST /drafts/recommendations` gravou snapshot+bundle atomicamente (confirmado por query direta —
1 bundle por snapshot, 0 duplicados); as três rotas responderam corretas tanto pro snapshot novo
(com bundle) quanto pro snapshot da sessão `cs-teste-etapa16-aaa`, anterior à 26a (sem bundle,
`REWEIGHT_ONLY`, motivo "Os inputs de derivação não eram preservados nesta versão" — nunca
corrompido); `POST verify-replay` no snapshot novo devolveu `EXACT_REPLAY` com **zero
divergências** — o motor reconstruído offline só a partir do bundle reproduziu exatamente
`totalScore`/`dataCoverage`/`rank`/`group`/cada métrica do resultado operacional. A independência
de fontes mutáveis está coberta por teste automatizado (alterar `PlayerChampionStats` depois da
captura não muda o replay do bundle original) — não repetida contra o Postgres real pra não tocar
dado pessoal de verdade. No Electron real (dev, CDP): 0 erros de console vindos do código novo, 0
`NaN`/`Infinity`/`undefined`, ranking/scores/cobertura/grupos idênticos ao anterior.

Testes por pacote, todos passando isoladamente: `packages/core` 526 (42 em
`replay-input-bundle.test.ts`, +4 desta etapa), `packages/riot` 96, `apps/desktop` 73, `apps/api` 241. A suíte agregada via `pnpm -r test` mostrou flakiness intermitente sob contenção de recursos
rodando os quatro pacotes em paralelo — não reproduzível isolando cada pacote, e não é regressão
desta etapa. `typecheck`, `lint` e `build` completos nos quatro pacotes TypeScript. Ver
`docs/replay-input-bundle.md`.

## Etapa 26a: domínio do ReplayInputBundle (captura prospectiva)

A Etapa 25 provou que o snapshot permite **reponderar**, mas não reproduzir como as métricas foram
**produzidas**. `packages/core/src/calibration/replay-input-bundle.ts` +
`replay-verifier.ts` (`replay-input-bundle/1.0.0`) criam o contrato do que será capturado junto de
cada snapshot **novo**. Migration, rota, API e tela vieram na Etapa 26b (acima).

**A auditoria do grafo real mudou três coisas do contrato esboçado no pedido**: (1) não basta o
candidato — `analyzeTeamComposition` e `analyzeDraftStrategy` leem tags e capacidades de aliados e
inimigos, então `referencedChampions` cobre todo campeão consultado, com papel explícito e uma
entrada por campeão; (2) `evaluatedAt` é **input**, não metadado — `assessExecutionRisk` o usa para
recência, então ele **entra** no `contentHash`, ao contrário de `capturedAt`; (3) nenhum catálogo é
endereçável por conteúdo (tags e capacidades são linhas mutáveis semeadas de arquivos
regeneráveis), o que obriga a **embutir** os campos normalizados.

O bundle **não carrega `puuid`** nem qualquer dado pós-partida — não existe campo onde
coubessem. Canonicalização ordena o que é conjunto (pool, aliados, inimigos, bans, candidatos,
campeões referenciados) e **preserva** o que é ordenado (`recentMatches`, porque a forma recente
pondera por índice). O hash é injetado: `packages/core` roda no renderer e não pode usar
`node:crypto`; sem a função, a verificação é pulada e **declarada**.

`replayEngines` é um registro explícito: versão histórica ausente devolve
`UNSUPPORTED_ALGORITHM_VERSION` e **nunca** cai no motor atual. `verifyReplayBundle` recebe só
bundle, snapshot e registro — nenhum parâmetro por onde um repositório entraria — e relata
divergência com esperado/reconstruído/delta, sem corrigir. Tolerâncias: 0.05 ponto de score,
1e-6 de cobertura. Snapshot antigo fica `REWEIGHT_ONLY` ou
`FULL_DERIVATION_REPLAY_UNAVAILABLE`, nunca corrompido, e **não há backfill**.

38 testes (905 no total). Ver `docs/replay-input-bundle.md`.

## Etapa 25b: laboratório de calibração utilizável (persistência, API e tela)

Migration `20260731100000_calibration_lab`: **três tabelas novas e isoladas**
(`CalibrationCandidateConfig`, `CalibrationExperiment`, `CalibrationExperimentCase`). Nenhuma
tabela existente foi alterada e **nenhuma linha delas é lida pelo motor**.

**Revisão em vez de edição**: mudar peso, threshold ou métrica desligada cria linha nova com
`revision + 1` e marca a anterior com `supersededAt`. O `configHash` define o que é alteração
funcional — renomear atualiza o rótulo e não cria revisão, então experimento já executado
contra aquele hash continua válido.

**Execução**: só snapshots **não substituídos** da própria conta (a análise que valia quando a
sessão terminou; ticks intermediários contariam a mesma decisão várias vezes). Não consulta
estatística atual, catálogo atual, resultado, timeline nem revisão pós-resultado — a query da
revisão humana nem seleciona as colunas pós-resultado.

**Concorrência sem lock aplicativo**: `PENDING → RUNNING` é um `updateMany` condicional, atômico
no Postgres; duas chamadas simultâneas dão uma reivindicação e um `409`. Falha apaga os casos da
tentativa e grava `FAILED` sem relatório — não existe resultado parcial consultável. `COMPLETED`
nunca é reescrito; mesmo `inputHash` devolve o existente com `reused: true` e `200`.

Doze rotas autenticadas sob `/calibration/*`, todas isoladas por conta e validando configuração
e filtros no backend. Tela **Laboratório do motor** (grupo Análise) edita só o que é
reproduzível, lista os parâmetros bloqueados com a dependência ausente, executa, mostra o resumo
e abre casos lado a lado — **sem exibir resultado da partida**.

**Aprovação é documental**: exige experimento concluído, registra quem/quando/qual, e a resposta
declara `activation: "NOT_ACTIVATED"`. Não existe endpoint de ativação.

18 testes de rota (867 no total). **Não validado**: execução ponta a ponta contra a API em
execução com a conta real — exigiria reconstruir a imagem Docker da API. Ver
`docs/engine-calibration-lab.md`.

## Etapa 25a: laboratório offline de calibração do motor (domínio puro)

Antes de mexer em peso, o Sparta ganhou um lugar para **testar** uma mudança de peso contra o
histórico real, sem tocar no motor. `packages/core/src/calibration/` (`calibration-lab/1.0.0`)
não tem migration, rota, tela nem execução operacional — isso é a Etapa 25b.

**A auditoria encontrou a restrição que define o desenho**: `PersistedRecommendation` congela as
métricas _já calculadas_, os pesos efetivos e o score, mas **nada** preserva `PlayerChampionStats`,
`ChampionTag`, capacidades ou agregados de matchup _como estavam no instante do draft_ — essas
tabelas são recalculadas a cada sync e sobrescritas. Reexecutar uma derivação com o dado de hoje
leria um histórico maior do que o jogador tinha, e produziria uma comparação que parece válida e
não é. Apresentado ao usuário, ele escolheu o **caminho A** (só replay historicamente honesto) e
rejeitou usar dado atual como substituto.

Por isso a capacidade de reprodução é **declarada por parâmetro** e verificada na validação:
`EXACT_REWEIGHT` (pesos e inclusão/exclusão de sinal congelado), `EXACT_POST_AGGREGATION`
(`primaryCount`, `alternativeCount`, pisos de score/cobertura, curva de penalização de risco),
`REQUIRES_HISTORICAL_DERIVATION_INPUT` (os onze parâmetros de derivação: formação/elegibilidade do
pool, disponibilidade, desempenho pessoal, forma recente, familiaridade, risco, matchup, tags,
capacidades, estratégia e proveniência) e `UNSUPPORTED` (meta global, resultado como rótulo).
**Thresholds não são uma categoria só**: a curva de penalização é aplicada a um risco _já
congelado_ (pós-agregação), enquanto `maxFamiliarityRiskRelief` e `executionRiskDerivation` mudam
como esse risco é produzido (exigem histórico ausente). Configuração com parâmetro não reproduzível
é **rejeitada antes de executar**, com a dependência nomeada — não se roda um experimento inteiro
pra marcar tudo como impossível. Configuração inválida também não é normalizada em silêncio.

O contrato é `CalibrationCandidate` (pesos por `RecommendationMetricKey`, `disabledMetrics`,
`postAggregationThresholds`, `status`), e o replay tem quatro status: `EXACT_REPLAY`,
`REPLAY_INTEGRITY_FAILED` (divergência), `REPLAY_UNSUPPORTED_VERSION` e
`REPLAY_MISSING_HISTORICAL_INPUT` (ausência) — divergir e faltar não são a mesma coisa.

**A verificação de integridade é real, não circular**: a penalização é recalculada de forma
independente a partir da métrica `EXECUTION_RISK` congelada, e não obtida como resíduo. Medido
contra o Postgres real (só leitura): **11 de 11 candidatos de 2 snapshots reconstruídos com
diferença zero**, com penalizações não triviais e todas distintas (0.4, 1.5, 1.8, 3.5, 4.6).
Tolerância documentada: 0.05 ponto. Um único candidato reprovado exclui o caso inteiro.

Reponderar usa a disponibilidade **histórica**: ligar um sinal indisponível no snapshot não cria
valor nem recebe peso efetivo, e não existe 0 nem 50 de preenchimento. Cobertura histórica e
cobertura candidata são campos **separados**. A comparação reporta top-1, sobreposição do top 5,
deslocamento médio/mediano/máximo, estabilidade do conjunto recomendado (Jaccard),
promovidos/rebaixados, entradas e saídas do grupo principal, transições principal↔alternativa,
inversões conforto × estratégico e a escolha real — **estabilidade não é qualidade e mudança não é
melhoria**, e vitória/derrota não existem em nenhum tipo do módulo. Revisão humana entra só como
contagem pré-resultado, nunca como nota. Segmentação por dez dimensões. Promoção máxima
expressável: `APPROVED_FOR_FUTURE_RELEASE`.

**Nenhuma linha do motor operacional mudou.** 69 testes (849 no total). Ver
`docs/engine-calibration-lab.md`.

## Etapa 24: revisão humana auditável do motor

Antes de mexer em peso, fórmula ou threshold, o Sparta passou a permitir **revisão humana
estruturada** dos casos reais. Nada disso existia: busca por `DraftReview` no repositório
retornava zero.

`draft-review/1.0.0` tem escala qualitativa (`STRONG`/`ADEQUATE`/`WEAK`/`INSUFFICIENT_DATA`/
`NOT_APPLICABLE`) com definição por nível, seis dimensões cegas, quatro pós-resultado e 13 tags de
problema — todas documentadas e publicadas em `GET /draft-reviews/form`. **A escala nunca vira
número**: não há nota geral, percentual de acerto nem versão vencedora.

**O modo cego é do backend, não do CSS.** Enquanto `resultRevealedAt` é nulo o repositório não
consulta partida, relatório pós-game nem estatística, e o contexto devolvido é do tipo
`BlindReviewContext`, que não tem campo de resultado — vazar exigiria mudar o tipo, e a mudança
aparece no diff. Medido na API real: revelar antes da fase cega → **409**; reescrever a fase cega
depois de submetida → **409**; pós-partida sem revelar → **409**.

**Correção não sobrescreve**: cria revisão nova com `supersedesReviewId` + `correctionReason`, e a
anterior recebe `supersededAt` com o conteúdo intacto (medido: as duas coexistem, a antiga com
`strategicExplanation: WEAK` preservado). O agregado só conta revisões atuais — o mesmo caso nunca
é contado duas vezes.

Sessão sem snapshot vigente no lock-in recusa avaliação de ranking (`422 RANKING_NOT_ASSESSABLE`);
sessão sem partida vinculada continua válida como revisão só-pré-resultado, com o motivo, sem
inventar desfecho. Toda contagem do resumo sai com denominador.

**Nenhum peso, fórmula, threshold ou ranking mudou**; nenhum snapshot foi recalculado; nenhuma
recomendação de calibração é gerada. Ver `docs/draft-review.md`.

## Etapa 23: avaliação longitudinal e observabilidade do motor

`buildLongitudinalRecommendationReport`
(`recommendation-observability/1.0.0`) agrega sob demanda uma observação por
`DraftSession` vinculada com segurança ao Match-V5. A API seleciona somente o
snapshot vigente no `lockedInAt`; snapshots substituídos ou criados depois
dele não entram. Não há tabela longitudinal: os registros imutáveis continuam
a única fonte de verdade.

O relatório preserva grupos `PRIMARY`, `ALTERNATIVE` e `NOT_IN_SNAPSHOT`,
rank, score, cobertura, risco, posição analisada/observada, patch, fila,
resultado e versões. Contagens mantêm numerador, denominador e amostra; zero
real permanece disponível e cada ausência é independente. Faixas de leitura
são versionadas e não calibradas.

As versões de recomendação, estratégia, risco e pós-game permanecem
segmentadas. Amostra pequena ou ausência de sobreposição de patch, posição,
grupo ou pool torna a comparação direta indisponível. Vitória e derrota nunca
viram acerto/erro, causalidade ou ajuste. Rotas autenticadas:
`GET /players/:playerId/recommendation-observability`, `/versions` e
`/roles/:role`. O desktop ganhou “Histórico do motor”. Ver
`docs/recommendation-observability.md`.

## Etapa 20: impacto teórico das mudanças do patch

`TheoreticalPatchImpact` (`theoretical-patch-impact/1.0.0`) interpreta cada
unidade estruturada da revisão oficial por campeão, preservando dimensão,
direção, magnitude opcional, explicação, evidência, indisponibilidade,
cobertura, IDs, revisão, hash e versões. A mudança da Etapa 19 continua
`OFFICIAL`; a relação teórica é `DERIVED`; `META_STRENGTH` continua
`UNAVAILABLE`.

O algoritmo puro usa somente `PatchChange`, escalares anterior/novo e
capacidades rastreáveis da mesma habilidade na Etapa 14. Não lê win rate,
histórico pessoal, regras por campeão ou `changeType` como direção. Bugfix
fica `UNKNOWN`; texto, séries e ausência de capacidade ficam indisponíveis;
compensações permanecem separadas ou `MIXED`. Magnitude só compara o mesmo
escalar: `<10% MINOR`, `10%-25% MODERATE`, `>25% MAJOR`.

Consultas: `GET /patches/:patch/impacts` e o campo `theoreticalImpact` em
`GET /patches/:patch/champions/:championId`. Resumo do patch, pool pessoal e
detalhe secundário do Champion Select apresentam o contexto fora de
`POST /drafts/recommendations`.

Validação real da revisão 1 do patch 26.14: 10 campeões alterados, três com
sinais seguros (Corki e Yunara em `SCALING`, Jayce em `MOBILITY`) e 18
unidades indisponíveis. Garen preserva o nerf oficial, mas fica sem impacto
teórico seguro. Nenhum score de força foi criado. Score, pesos, ranking,
pool, risco, matchup, snapshots e meta continuam inalterados. Ver
`docs/theoretical-patch-impact.md`.

## Etapa 19: Patch Intelligence com notas oficiais da Riot

`PatchRelease`, `PatchChange` e `StructuredPatchDelta`
(`patch-intelligence/1.0.0`) preservam a evidência oficial, URL, locale,
publicação/coleta, disponibilidade e proveniência. O coletor aceita somente
notas em `leagueoflegends.com/.../news/game-updates/*-notes`, reutiliza a
política HTTP da Etapa 9 e mantém uma hora `FRESH` mais sete dias de fallback
`STALE`.

O parser `riot-patch-notes-parser/1.0.0` usa classificação editorial
explícita, mantém compensações como `ADJUSTMENT`, bugfix como `BUGFIX` e
ambiguidade como `UNCLASSIFIED`; direção numérica isolada nunca classifica.
Escalares explícitos podem ser estruturados, enquanto séries, fórmulas e
texto permanecem literais. O hash canônico ignora coleta, whitespace,
atributos visuais e IDs gerados pelo site.

`PatchRelease` + `PatchReleaseRevision` + `PatchImportAttempt` (migration
`20260728163000_patch_intelligence`) separam identidade, revisões imutáveis e
falhas. `patches:check` não persiste; `patches:import` é idempotente. O patch
oficial 26.14 está no banco local: 21 mudanças, 10 campeões associados com
segurança, três itens não resolvidos preservados, revisão 1; reimportação
`UNCHANGED`.

Consultas: `GET /patches`, `/patches/current`, `/patches/:patch` e
`/patches/:patch/champions/:championId`. O Champion Select mostra resumo,
indicador secundário e detalhe oficial fora do ranking. Patch Intelligence
não toca `META_STRENGTH`, score, pesos, pool, risco, matchup ou elegibilidade
global. Ver `docs/patch-intelligence.md`.

## Etapa 18: decisão e contrato da fonte global de meta

Decisão registrada como `SELF_AGGREGATION_CANDIDATE`: a candidata para o meta
de partidas ranqueadas é agregação própria sobre APIs oficiais da Riot,
somente depois de Production Key, uso estatístico, retenção, população do
piloto, privacidade e orçamento serem explicitamente aprovados. GRID,
PandaScore e Abios têm ofertas legítimas de esports, mas não representam a
ladder segmentada por elo/região/fila. Scraping foi rejeitado.

O core expõe `GlobalStatisticsProvider`, contratos
`global-statistics-contract/1.0.0` e o provider operacional padrão
`UnavailableGlobalStatisticsProvider`. Ele não faz I/O, não lê ambiente, não
usa fixtures e devolve valor `null`, amostra 0 e contexto explícito.
Elegibilidade continua `eligible: null`, sem thresholds. `GLOBAL_MATCHUP`,
`META_STRENGTH`, taxas e loadouts globais permanecem indisponíveis; nenhum
ranking, score, risco, estratégia ou snapshot foi alterado. Ver
`docs/adr/0002-global-meta-source.md`.

## Etapa 17: inteligência pessoal de builds, runas e feitiços

`aggregatePersonalLoadoutEvidence` (`personal-loadout-evidence/1.0.0`) agrega
sob demanda somente `MatchObservation` por jogador, campeão e posição
normalizada. Inventário final usa multiconjunto canônico (ignora slot e item
0, preserva duplicatas e IDs desconhecidos); runas preservam árvores, ordem,
perks, fragmentos e parcialidade; feitiços invertidos compartilham o par
canônico, mas todas as ordens observadas continuam expostas.

Patch, fila, período e recência são filtros factuais. Configurações fora do
patch solicitado ficam em histórico `STALE`, nunca como atuais. Cada parte tem
disponibilidade e amostra independentes; resolução de catálogo indisponível
não elimina o ID observado. Ordenação: frequência, última utilização e
assinatura, sem usar vitória como critério.

Rota protegida:
`GET /players/:playerId/champions/:championId/roles/:role/loadout-evidence`.
O path só aceita o puuid da conta autenticada. A seção “Seu histórico com este
campeão” aparece no detalhe da recomendação e no pré-game, consultada fora do
payload do motor. Score, ordem, cobertura, risco, estratégia, pool e snapshots
permanecem invariantes. Sem migration nem fonte externa. Ver
`docs/personal-loadout-evidence.md`.

## Etapa 16: persistência de drafts e recomendações

`DraftSession` e `PickRecommendation` existiam no schema desde o início e **nunca tiveram uma
linha de código** que lesse ou escrevesse nelas (0 linhas no banco real). As formas antigas não
sustentavam esta etapa — `draftStateJson` era blob sem contrato, sem ciclo de vida, sem origem,
sem vínculo com partida; e as recomendações penduravam direto na sessão, sem execução imutável
entre as duas. Foram substituídas (migration `20260728120000`), sem migração de dados.

`DraftSession` passa a ter `source` (`LCU`/`USER`), `status`, `roleSource`, `knownDraftJson`
(contrato estruturado, **não** o payload bruto do LCU), `externalSessionId` e `linkedMatchId`.
`RecommendationSnapshot` + `PersistedRecommendation` guardam cada execução com `inputHash`,
input canônico, versões, cobertura e todos os candidatos com ranking, grupo, pesos efetivos,
métricas estruturadas, motivos, limitações e análise estratégica.

**Identidade**: o LCU não expõe id estável de sessão, então a chave técnica é gerada pelo desktop
ao _entrar_ no champion select e descartada ao sair — não deriva de campeão nem de horário, e uma
entrada nova nunca reaproveita a anterior.

**Dedup**: o hash SHA-256 do input canônico ignora ordem de arrays, instante da análise e campos
de interface. Medido na API real: `SAVED` → `UNCHANGED` (mesmo input, zero escrita) → `SAVED`
(inimigo revelado). O anterior recebe `supersededAt` e nunca é reescrito; tudo numa transação.

**Ciclo de vida** com transições explícitas: sessão encerrada não volta para `ACTIVE` (medido:
abandonar → 200, lock-in depois → 409), e `COMPLETED` exige `matchId` (sem ele, 422
`MATCH_LINK_UNAVAILABLE`). Vínculo só por identificador confiável; nunca por campeão, horário,
resultado ou posição. **Nenhum draft retroativo foi criado a partir do Match-V5.**

**Escolha sem julgamento**: `RANKED` / `NOT_IN_SNAPSHOT` / `NO_SNAPSHOT`. Medido: confirmar um
campeão fora do ranking grava `NOT_IN_SNAPSHOT`, sem classificar como erro.

**Falha não derruba nada**: a gravação é efeito colateral pós-análise; erro devolve
`persistence: FAILED` sanitizado com a recomendação inteira intacta.

Os pesos efetivos passaram a sair do motor (`effectiveWeights`) — o valor já existia dentro de
`recommendFromPersonalPool`, só não era exposto. **Nenhum peso, threshold ou fórmula mudou.**
Nova tela "Histórico de drafts" (mínima e factual, sem avaliação de acerto). Ver
`docs/draft-persistence.md`.

## Etapa 15: análise estratégica do draft 5×5

`analyzeDraftStrategy` (`draft-strategy/1.0.0`) é o único motor estratégico
usado pelo ranking atual e pelo pré-game. Ele recebe candidato, picks
conhecidos, `ChampionCapabilityProfile` e `ChampionTag`; remove duplicatas,
inclui o candidato uma vez, mantém o adversário direto separado e nunca
completa picks desconhecidos.

As 19 dimensões estratégicas usam primeiro a evidência específica da Etapa 14.
Somente engage, peel, frontline, pickoff, waveclear e scaling admitem fallback
genérico explícito da tag. Fonte específica e fallback não somam; conflito
fica visível. Ausência de evidência continua indisponível. Alcance oficial é
preservado numericamente e só valores >= 450 contam como perfil à distância.

`TEAM_COMPOSITION` compara os aliados conhecidos sem/com o candidato e
distingue lacuna preenchida, recurso adicionado, reforço e lacuna conhecida
remanescente. `ENEMY_COMPOSITION_ANSWER` usa relações gerais versionadas entre
ameaças e respostas; não contém nomes de campeão nem afirma counter completo.
Dimensões indisponíveis saem da média e picks desconhecidos reduzem cobertura,
não score. Os pesos gerais e todos os demais componentes permanecem iguais.

Principais, alternativas e pré-game carregam o mesmo
`DraftStrategicAnalysis`. Cards mostram resumo; detalhes expõem campeões,
evidências, ameaças, respostas, lacunas e cobertura, separados de dificuldade
e risco pessoal. Respostas antigas continuam aceitas sem criar `50`. Não há
migration nem persistência de sessão. Ver `docs/draft-strategic-analysis.md`.

## Etapa 14: capacidades rastreáveis dos campeões

`ChampionCapabilityProfile` é um catálogo técnico separado de `ChampionTag`.
O extrator `champion-capability-extraction/1.0.0` lê somente os recursos
completos oficiais `champion/{championKey}.json` da Data Dragon 16.14.1 em
`pt_BR`, preservando passiva/habilidade, ID, nome, trecho oficial, regra,
versão, locale, disponibilidade e cobertura.

As 23 dimensões existem independentemente. A versão atual só disponibiliza
presença textual explícita de controle, mobilidade, proteção e o
`stats.attackrange` objetivo; ausência de termo fica `UNAVAILABLE`, nunca
`false`. Hard CC não cria confiabilidade, dash não cria engage, escudo/cura
não cria peel e classe Tank não cria frontline.

O manifesto revisável `data/seeds/champion-capabilities.json` cobre 173
campeões. Cobertura média de 19,15% é apenas proporção de dimensões utilizáveis
e não entra em score. Geração/verificação:
`champion-capabilities:generate`/`champion-capabilities:check`. Consulta:
`GET /catalog/champions/:championId/capabilities`. Na Etapa 14 o ranking e o
pré-game permaneceram inalterados; a Etapa 15 passou a consumir o manifesto
somente nos dois componentes estratégicos. As nove dimensões de `ChampionTag`
continuam preservadas. Ver `docs/champion-capabilities.md`.

## Etapa 13: dificuldade e risco pessoal de execução

O ranking preserva `info.difficulty` da Data Dragon como fato oficial 0-10,
com patch, recurso e valor original, e o normaliza linearmente para 0-100 pelo
algoritmo `champion-difficulty-normalization/1.0.0`. Esse dado vive nas colunas
próprias de `Champion` e é exposto por `ChampionTag.officialDifficulty`,
separado da dimensão estratégica e curável `ChampionTag.difficulty`. Ausência
continua `UNAVAILABLE`; não existe dificuldade média ou neutra substituta.

`PERSONAL_EXPERIENCE` usa somente quantidade de partidas na posição e recência
observada. `EXECUTION_RISK` combina essa evidência com a dificuldade oficial,
sem usar win rate ou desempenho, e pode descontar no máximo 8 pontos do score
base. Candidato manual sem histórico continua elegível e recebe risco baseado
na dificuldade mais a ausência conhecida de partidas. Sem dificuldade, o
risco não altera score nem ordem.

Os três sinais aparecem em `metricDetails`, na recomendação principal e nas
alternativas. Respostas antigas recebem campos `UNAVAILABLE`, nunca valores
inventados. Migration `20260728033000_champion_execution_risk`; 173/173
campeões do manifesto e do Postgres possuem valor bruto e normalizado. Fórmulas
e limites em `docs/champion-execution-risk.md`.

## Etapa 12: pool pessoal por posição e cinco recomendações

O Champion Select usa um pool explícito por conta Riot, campeão e posição:
observações Match-V5 normalizadas (`PERSONAL_OBSERVED`) unidas a inclusões
manuais (`USER_PROVIDED`). A tabela `PlayerChampionPoolEntry` preserva origem,
estado e timestamps; observações prevalecem sobre inclusão manual e não podem
ser apagadas ou desabilitadas pela interface.

`recommendFromPersonalPool` produz até cinco principais e três alternativas,
sem duplicatas ou preenchimento heurístico, com rank, origem, amostra,
cobertura, métricas e limitações independentes. Candidato manual sem histórico
mantém os sinais pessoais indisponíveis e confiança ausente; os pesos
disponíveis são normalizados só para ele. Pesos, thresholds, fórmulas e scores
dos candidatos observados elegíveis não mudaram. `ChampionTag.roles` e
elegibilidade global continuam fora do pool.

Rotas autenticadas: `GET/POST /players/pool`,
`PATCH /players/pool/:championId` e `POST /drafts/recommendations`. O desktop
aceita temporariamente a resposta antiga sem inventar alternativas. Ver
`docs/player-champion-pool.md`.

## Etapa 11: experiência pessoal e elegibilidade global por posição

`PlayerChampionRoleEvidence` agrega exclusivamente
`MatchObservation.normalizedRole` da Etapa 10 e expõe partidas, V/D, última
partida, patches, filas e normalização. `GlobalChampionRoleEligibility`
permanece `UNAVAILABLE`, com `eligible: null`; nenhuma partida, Smite,
classe, tag ou curadoria manual cria elegibilidade global.

`ChampionTag.roles` é sempre vazio, inclusive para os dois valores MID
legados do manifesto. O alias `preferredRoles` continua legível, mas aponta
para `observedRoles` pessoal. Pool, pesos e scores não mudaram. Rota:
`GET /players/:puuid/champions/:championId/role-evidence`. Detalhes em
`docs/champion-role-evidence.md`.

## Etapa 10: observações reais de partida

Os `rawJson` Match-V5 agora são reprocessados por
`match-observation/1.0.0` em entidades relacionais: sete slots finais de
item, seleções e fragmentos de runa, dois slots de feitiço e posição
observada. ID zero é slot vazio; ID desconhecido continua preservado; ausência
não vira lista vazia, zero ou MID.

A auditoria real encontrou quatro divergências entre matchmaking e os campos
observados. A política usa `teamPosition`, depois `individualPosition`; a
atribuição de matchmaking permanece separada e auditável. Isso representa
somente a posição pessoal do jogador com o campeão naquela partida e não
altera `ChampionTag.roles`, scores, pool ou elegibilidade global.

Migration `20260728010000_match_observations`, backfill local idempotente,
rota autenticada `GET /matches/:matchId/observation` e card factual no
pós-game. No banco real: 22 partidas/220 participantes na primeira execução e
zero atualizações na segunda; 1.540 slots de item, 1.320 perks, 660 fragmentos
e 440 feitiços, sem duplicatas. Não havia catálogo local de itens/runas/spells,
então nomes ficaram indisponíveis e os IDs foram preservados. Detalhes em
`docs/match-observations.md`.

Este arquivo é um handoff para outro agente de desenvolvimento continuar o projeto Sparta sem precisar redescobrir a base inteira.

## Convenções deste repositório (ler antes de qualquer feature nova)

Desde 2026-07-25, `.ai/` segue uma estrutura fixa pra rastrear pedidos de feature — vale pra
qualquer agente de IA que trabalhe neste repositório (Claude/Codex/Agents, todos apontando pra
`.ai/` via symlink):

- **`.ai/prompts/features/`** — um arquivo por feature solicitada (`NNNN-slug.md`), com
  cabeçalho de status (`PENDENTE`/`EM_ANDAMENTO`/`IMPLEMENTADA`/`BLOQUEADA`/`IGNORADA`/`CANCELADA`).
  Formato exato em `.ai/prompts/features/README.md`. Criar o arquivo com `status: PENDENTE`
  **ao receber** o pedido, antes de implementar.
- **`.ai/CHANGELOG.md`** — todas as features, mais recente primeiro. **Ao concluir** uma
  feature: atualizar o status do arquivo de prompt pra `IMPLEMENTADA` (com `implementado_em`
  real) e adicionar uma entrada nova no topo do changelog com a data/hora real da execução.
- **`.ai/specs/`** — espelho de `docs/*.md` (specs técnicas), só leitura rápida pra agentes de
  IA; `docs/` continua sendo a fonte de verdade — atualize o espelho se `docs/` mudar de forma
  relevante.
- **Testes automatizados por feature/bug-fix**: ver regra 11 em "Regras de implementação"
  abaixo — sempre que necessário/possível, cada feature nova ou correção ganha teste
  automatizado cobrindo o comportamento (não só rodar a suíte existente).

## Pendências desta sessão (ler primeiro)

### Etapa 9: resiliência HTTP, erros externos e estados de cache

Todas as chamadas ativas foram auditadas e documentadas em `docs/http-resilience.md`. A política
compartilhada em `packages/riot/src/http/` agora concentra timeout, cancelamento, retry seguro,
jitter, `Retry-After`, validação e erros sanitizados. Riot, Data Dragon, Community Dragon,
assets, API local e LCU usam esse contrato.

Cache persistido e no renderer distingue `MISS/FRESH/STALE/EXPIRED`, guarda datas reais e só
serve stale por recurso. A fonte original permanece na proveniência (`OFFICIAL` não vira
`CACHE`). Conta Riot/autenticação, LCU e draft atual nunca usam stale. O LCU tem estados
específicos e limpa posição, ordem e draft imediatamente ao perder observação.

Validado com 472 testes, typecheck dos quatro projetos TypeScript, lint e build de produção do
Electron.

Uma sessão anterior fez uma auditoria completa do repositório (real vs mock vs so-tipo), aprovou um plano de evolução em 5 épicos (Riot Sync, Player Intelligence, Draft Intelligence, Post-Game Coach, Growth Journey) e implementou todas as 5 fases, além de um refinamento visual do desktop e correções de infra/segurança. Uma sessão seguinte **conectou o desktop às rotas reais da API** (Dashboard/Perfil/Champion Select/Pós-game/nova tela Evolução, removendo `mock-data.ts`) e implementou as **Sub-fases 6a e 6b** (tela de Configurações + tema com campeão/skin real + configuração "quantas partidas analisar"). Uma sessão seguinte implementou a **Sub-fase 6c (ordem de pick automática via LCU)**, encerrando a Fase 6. Uma sessão seguinte implementou a **Fase 7 (auditoria e documentação dos algoritmos de scoring)**. Uma sessão seguinte implementou a **Fase 8 inteira** (Sub-fase 8a: motor de build de campeão + seletor de time inimigo; Sub-fase 8b: polimento visual do desktop) e validou tudo contra a conta real Zekerus#117. Essa validação real encontrou um bug real (corrigido, ver abaixo) e motivou o pedido desta sessão: **Fase 9 (linguagem visual real - badges/barras nas telas de análise)**, implementada em duas sub-fases (9a: componentes compartilhados + Dashboard + Champion Select; 9b: Perfil + Pós-game + Evolução), encerrando a Fase 9. A validação real da 9b encontrou mais um bug real (corrigido, ver abaixo). **Depois do merge da 9b, o usuário pediu explicitamente validação contra o app Electron real empacotado (não só o dev server aberto numa aba de navegador comum)** — essa validação descobriu e corrigiu um bug real grave e pré-existente (ver "Bug real corrigido: preload nunca carregava de verdade" abaixo), presente desde o início do projeto. Depois de abrir o app real pro usuário avaliar, ele deu **feedback de UX ao vivo** (capturas do próprio Sparta + referências de apps reais de LoL) que motivou a **Fase 10 (polimento de UX + robustez de ícones de campeão)**, com liberdade explícita do usuário pra usar outras fontes/APIs como fallback e não se limitar ao escopo inicial ("não é mais protótipo, é programa real"). Uma sessão seguinte configurou o **`gh` CLI autenticado** (instalado via winget, device flow) - PRs/merges/CI agora são feitos pelo terminal, não mais pelo navegador. Uma nova rodada de feedback do usuário (as mudanças visuais ainda pareciam pequenas, botões sem estilo, download de skin quebrado, Champion Select acessível livremente sem sessão real, falta de detecção de posição/lane, telas resumidas demais) motivou a **Fase 11 (detecção real de posição/lane via LCU + gating do Champion Select + correções de polimento)**. Depois do merge da 11, o usuário reportou que **o módulo de temas continuava instável, sem baixar nem aplicar o tema** - a investigação achou dois bugs reais e independentes (ver "Bug real corrigido: módulo de temas" logo abaixo), ambos corrigidos na **Fase 12**. Depois veio a **Fase 13** (o tema veste o app). A partir daí o usuário pediu uma **modernização completa de UI/UX** tendo Mobalytics, Blitz e iTero como referência de princípios - isso virou a **Fase 14**, implementada em seis subfases (A a F), uma por PR. Tudo isso **já está mergeado em `main`**.

### Etapa 2: contrato de origem, disponibilidade e confiança

Pedido do usuário depois da auditoria (Etapa 1). O problema medido: o valor `50` aparecia na
tela em quatro situações diferentes — cálculo neutro de verdade, ausência de dado, fallback
artificial, e componente não implementado (`patchMeta` é `null`, então `meta` é sempre 50). As
quatro viravam a mesma barra amarela.

1. **`packages/core/src/types/provenance.ts`** (novo) — `DataProvenance` com dois eixos
   independentes: origem (`OFFICIAL`/`OBSERVED`/`CALCULATED`/`DERIVED`/`INFERRED`/`CACHE`) e
   disponibilidade (`AVAILABLE`/`PARTIAL`/`STALE`/`UNAVAILABLE`). Todo campo opcional de
   propósito: o que não se aplica fica ausente, nunca placeholder. `ConfidenceScore` numérico
   (0-1) coexiste com o `Confidence` categórico da Fase 2; a conversão é lossy e documentada.
2. **`packages/core/src/types/recommendation-metric.ts`** (novo) — `RecommendationMetric` com
   `value: number | null`. `unavailableMetric` **não aceita valor**: o invariante "indisponível
   nunca tem número" é garantido pelo tipo. 15 chaves (7 ainda não produzidas pelo motor), pra
   travar desde já os conceitos que não podem ser fundidos — matchup pessoal vs global,
   dificuldade do campeão vs risco de execução, etc.
3. **`packages/core/src/draft/recommendation-metrics.ts`** (novo) — adaptador **único** entre o
   bloco numérico atual e o contrato. `PickRecommendation` carrega os dois por enquanto:
   `metrics` (entrada do `totalScore`) e `metricDetails` (o que a UI consome). Ponto de término
   definido: quando o motor produzir métricas ausentes, este módulo vira o produtor.
4. **`ui/MetricRow.tsx`** (novo) — indisponível renderiza **sem barra** (trilho tracejado +
   motivo), desatualizado dessatura e marca. `apps/desktop/vitest.config.ts` é a primeira
   configuração de teste do renderer (jsdom + testing-library).

**Nenhum cálculo mudou.** As 8 métricas continuam `AVAILABLE`, inclusive `LANE_MATCHUP` e
`META_STRENGTH`, cujo 50 na verdade significa "não temos" — converter isso é a etapa seguinte.
A diferença é que essas duas saem **sem `provenance`**: declarar origem seria inventar.

**Bug real achado na validação**: rodando contra a API em execução (build anterior ao
contrato), o Champion Select quebrou inteiro em `metricDetails is not iterable`. Desktop e API
são implantados separadamente — isso não é hipotético. Corrigido com
`ensureRecommendationMetrics` aplicado uma vez em `services/api-client.ts`; sem `metricDetails`
e sem `metrics`, devolve lista vazia, nunca valores inventados.

Validado no Electron real (CDP, Zekerus#117): contra a API antiga, 8 métricas pelo caminho de
compatibilidade; contra a reconstruída, `metricDetails` nativo com proveniência correta por
métrica. Os estados PARTIAL/STALE/UNAVAILABLE **não** foram vistos no app real — nenhuma
métrica os produz ainda; estão cobertos por teste de componente. Ver `docs/data-provenance.md`.
24 testes novos (230 no total).

### Etapa 8: proveniência das ChampionTag

As nove dimensões de gameplay (`engage`, `peel`, `frontline`…) alimentam o motor de draft e o
pré-game, mas **a Riot não publica nenhuma delas**: são derivadas das `tags` de classe e das
notas `info` do `champion.json`. Até aqui não havia como saber de que versão da fonte, de que
versão do algoritmo, nem o que era leitura de classe e o que era curadoria.

**Auditoria** (registrada em `.ai/prompts/features/0008-...`):

- O arquivo versionado era um array plano sem metadado nenhum. `source: "manual" | "derived"`
  era por **entrada inteira**, não por dimensão.
- O gerador lia a versão real da Data Dragon e **a descartava** — só imprimia no console.
- **Fallback fixo de versão achado**: `prisma/seed.ts` criava `Champion` com `version: "seed"`,
  string inventada.
- `pre-game-analysis.ts` declarava um `championTagProvenance` **constante** com o
  `algorithmVersion` do **pré-game**, não o da derivação: a versão anunciada estava errada por
  construção.

1. **`types/champion-tag-provenance.ts`** (novo) — reusa `DataProvenance` para origem/versões e
   acrescenta o eixo que faltava: `reviewState` (`UNREVIEWED`/`PARTIALLY_REVIEWED`/`REVIEWED`)
   com `reviewedDimensions` nomeadas uma a uma. **Sem nenhum campo numérico de confiança**:
   `REVIEWED` diz "alguém olhou", não "está calibrado". `DataProvenance` ganhou só `locale`.
2. **`draft/champion-tag-manifest.ts`** (novo, puro) — o arquivo virou
   `{ metadata, champions }`. Metadados compartilhados (versão real da Data Dragon, locale,
   recurso, versão do algoritmo, data de geração) em vez de repetidos em 173 entradas. Cada
   entrada guarda os valores efetivos e, em `review.overrides`, **quais dimensões** foram
   revisadas, com motivo e data quando conhecidos. O estado de revisão é **derivado** das chaves
   de `overrides`, nunca declarado — não tem como divergir.
3. **Curadoria por dimensão** — regenerar preserva cada dimensão sobrescrita e re-deriva as
   outras. O formato anterior congelava a entrada inteira, então um campeão curado nunca recebia
   correção nem em dimensão intocada. Editar sem registrar o override é **avisado**, não
   descartado em silêncio.
4. **Gerador** — grava a versão real da fonte e do algoritmo, valida as dimensões (finitas,
   0-1), detecta campeão novo/sumido, e ganhou `champion-tags:check`, que **não escreve** e sai
   com código 1 quando o arquivo está desatualizado. `generatedAt` só muda quando algo funcional
   muda: rodar duas vezes produz o arquivo byte a byte idêntico.
5. **Persistência** — migration `20260727220000` com 7 colunas **todas nullable**. Linha
   gravada antes desta etapa fica nula e o repositório a serve **sem proveniência** (origem não
   informada), nunca classificada como derivada ou revisada. O seed passou a ser idempotente de
   verdade (2ª execução: 0 gravações) e a única fonte dele é o arquivo versionado. O
   `version: "seed"` foi removido.
6. **Consumo** — o motor de recomendação não lê proveniência (mesmas dimensões, mesmo score,
   provado por teste). O pré-game declara a versão **só quando todas as tags usadas concordam**
   e expõe `selectedChampion.profileProvenance`. A tela mostra uma linha discreta no rodapé de
   um card só.

**Nenhum valor de dimensão mudou**: medido campeão a campeão antes/depois da regeneração real
(173 campeões, **0 dimensões alteradas**) e entre arquivo e banco depois do seed (**0
divergências**). As métricas do Viego no app real continuam 67/65/64/50/50/43, iguais à Etapa 7.

Validado contra o Postgres e o Electron reais: 173 linhas históricas sem proveniência
respondendo normalmente **antes** do seed (`profileProvenance` ausente, sinal `DERIVED` sem
versão inventada); depois do seed, 171 `UNREVIEWED` e 2 `REVIEWED` (Ahri e Orianna, 11 dimensões
cada), todas com `16.14.1` / `champion-tag-derivation/1.0.0`; o app real exibindo "Perfil
derivado das classes da Data Dragon, sem revisão específica deste campeão. Fonte: champion.json
16.14.1." 0 imagens quebradas, 0 `NaN`/`undefined`.

**Não validado no app**: os estados `REVIEWED`/`PARTIALLY_REVIEWED` **na tela** — o desktop só
confirma campeão a partir de um card de recomendação, e os dois campeões curados (Ahri, Orianna)
não estão no pool de Zekerus#117. Ambos foram validados contra a API real e por teste de
componente. Ver `docs/champion-tags.md`.
54 testes novos (450 no total).

### Etapa 7: o pré-game vira real e derivado do draft atual

`POST /drafts/pre-game-analysis` era a última rota 100% estática do produto: devolvia quatro
listas de frases fixas (`allyStrengths`, `allyWeaknesses`, `enemyThreats`, `winCondition`) e
**nem lia o body**. O desktop mostrava um card "Orientação geral" com três dicas fixas.

**Auditoria antes de implementar** (registrada em `.ai/prompts/features/0007-...`):

- A rota é `async () => ({ ... })` — nenhum `request`, nenhum parse, nenhuma consulta.
- **Não existia tipo `PreGameAnalysis`** em lugar nenhum do repositório, nem produtor nem
  consumidor tipado.
- `analyzeTeamComposition` (motor de draft) devolve `0` em toda dimensão quando não há nenhuma
  tag. Lá o zero alimenta um score e nunca é exibido; reusá-lo aqui produziria a frase "o time
  não tem linha de frente" com zero campeões conhecidos. **Por isso o pré-game não reusa essa
  função** — `summarizeKnownComposition` deixa a dimensão **ausente** em vez de zero.
- Confirmado que o jogador continua fora de `draft.allies` (contrato da Fase 16) e entra na
  composição exatamente uma vez.

1. **`packages/core/src/draft/pre-game-analysis.ts`** (novo, puro) — `generatePreGameAnalysis`
   devolve `{ok:true, analysis}` ou `{ok:false, reason}`. Contrato com `status`, `dataCoverage`,
   `coverageBreakdown`, `selectedChampion`, `summary`, cinco seções (`laneContext`,
   `alliedComposition`, `enemyComposition`, `selectedChampionFit`, `knownRisks`),
   `unavailableSignals`, `generatedAt` e `algorithmVersion`. Cada `AnalysisSignal` carrega
   `status`/`tone`/`strength`/`confidence`/`provenance`/`evidence`/`unavailableReason`.
   `now` entra como parâmetro pra a saída ser determinística.
2. **Linguagem proporcional à evidência** — dimensão só vira frase fora da faixa 35-55, e o
   texto muda com a cobertura: "ainda não foi identificada entre 3 dos 5 campeões conhecidos"
   com draft aberto, "a composição apresenta pouca linha de frente" com o time fechado.
   `ChampionTag` sai sempre como `DERIVED` e o texto usa "indica"/"apresenta perfil de".
3. **Bug real achado pelo teste**: `fit_fills_gap` ("necessidade atendida") comparava a média
   **com** o jogador contra a média **sem** ele — matematicamente impossível de disparar: um
   aliado em 0 e o jogador em 100 dão média 50, abaixo do limiar de 55. Passou a comparar a
   média sem o jogador com o **valor do próprio campeão**.
4. **Rota** — orquestra e nada mais: valida o payload, resolve nomes pelo catálogo real
   (`findChampionNamesByIds`, novo), carrega `findAllChampionTags`, resolve o matchup pessoal
   (`findPersonalLaneMatchupHistory` + `aggregateMatchupData`) **só** quando há adversário
   direto, chama o motor. `422` `PLAYER_ROLE_UNAVAILABLE` / `SELECTED_CHAMPION_UNAVAILABLE`
   antes de qualquer consulta; campeão fora do catálogo também é `SELECTED_CHAMPION_UNAVAILABLE`
   (analisar exigiria inventar um nome, e o motor casa tags por nome).
5. **Desktop** — o card "Orientação geral" foi **removido**; a tela consome o contrato inteiro.
   Enquanto carrega, **nada** da análise anterior é exibido (mesma decisão da Etapa 6: com o
   draft mudando ao vivo, mostrar o resultado do draft antigo como atual é pior que um spinner).
   `ApiError` ganhou `payload` pra o cliente ler o `code` estruturado do 422.
6. **Compatibilidade** — `fetchPreGameAnalysis` reconhece a resposta antiga num único ponto e a
   **recusa** ("Análise contextual indisponível nesta versão da API"). O formato antigo não é
   traduzido; não existem dois motores.

Sem migração, sem tabela nova, sem fonte externa nova, sem persistência (`DraftSession`/
`PickRecommendation` seguem sem código). Ver `docs/pre-game-analysis.md`.
70 testes novos (396 no total).

### Etapa 6: posição desconhecida não vira MID

Ausência de posição era convertida em `MID` em nove pontos do fluxo. O efeito não era cosmético:
o Sparta consultava o histórico da posição errada, montava o pool errado e aplicava a tabela de
pesos errada, tudo sem nenhum sinal disso na tela.

**Representação escolhida**: `DraftState.playerRole?: Role` (opcional), não `null` nem
`"UNKNOWN"` — o domínio já usa ausência opcional pro que não se aplica desde a Etapa 4, e um
literal `"UNKNOWN"` poderia vazar pra dentro de um `Record<Role, ...>` e ser indexado como se
fosse posição. `playerRoleSource?: "LCU" | "USER"` distingue detecção de escolha manual, e
`ProvenanceSourceType` ganhou `USER_PROVIDED`: escolha do usuário não é observação do cliente
nem dado oficial da Riot.

| Local                  | Fallback removido                                                        |
| ---------------------- | ------------------------------------------------------------------------ |
| `App.tsx`              | `playerRole: "MID"` no estado inicial                                    |
| `App.tsx`              | `role: member.position ?? "MID"` em aliado/inimigo do LCU                |
| `ChampionSelectScreen` | `role: "MID"` no inimigo escolhido à mão                                 |
| `match-mapper.ts`      | `TEAM_POSITION_TO_ROLE[...] ?? "MID"` no histórico Match-V5              |
| `player-role.ts`       | `Record<string, Role>` fazia o TS crer que sempre havia retorno          |
| `schemas.ts`           | `playerRole` obrigatório — o cliente **tinha** que mandar algo           |
| Seletor da UI          | `<Select>` sem valor vazio: o navegador pré-selecionava a 1ª opção (TOP) |

1. **Mapeamento do LCU** — novo `toRole` rejeita `unselected`, `unknown`, string vazia, só
   espaços e qualquer valor fora da tabela. Um vocabulário novo da Riot produz ausência, não MID.
2. **Motor** — `recommendPicks` devolve `[]` antes de escolher pool ou pesos quando não há
   posição. **Nenhum peso, threshold, fórmula ou ordenação mudou.**
3. **API** — `POST /drafts/recommendations` responde **422** `PLAYER_ROLE_UNAVAILABLE` sem
   consultar estatísticas. `playerRole` virou opcional no zod justamente pra o request poder
   expressar "não identificada" e a API responder isso.
4. **Cliente** — `fetchDraftRecommendations` lança `PlayerRoleUnavailableError` antes de enviar.
   A dupla proteção é deliberada: uma API anterior a esta etapa aceitaria o request e usaria MID
   internamente.
5. **Persistência** — participante sem posição observada é descartado (mesma regra já usada pra
   campeão fora do catálogo): a linha existiria sem conseguir dizer a que posição pertence, e
   `MatchParticipant.role` alimenta as estatísticas por posição.
6. **Estado obsoleto** — sair do champion select limpa a posição de origem `LCU` (escolha
   `USER` sobrevive a um tick sem posição); trocar de posição **descarta os cards anteriores
   antes** de exibir os novos — o `useAsyncData` preserva o último `data` durante o loading pra
   evitar flicker, o que aqui significaria mostrar as recomendações do papel antigo como atuais.

**Validado**: API real devolvendo 422 estruturado sem posição e Viego normalmente em JUNGLE.
Electron real (CDP, Zekerus#117) em modo manual: seletor abrindo **vazio**, "Posição ainda não
identificada" com 0 cards; JUNGLE → 1 card (Viego); trocar pra MID → **0 cards e Viego some**;
voltar pra vazio → espera de novo. 0 `NaN`/`Infinity`/`undefined`.

**Não validado**: a detecção real dentro de um champion select de verdade (precisa do League
aberto) — mesmo limite das Fases 6c, 11 e 16; coberta por teste com fixture. E um desktop
anterior a esta etapa continua enviando `MID` artificial, que a API não tem como distinguir de
uma escolha real — limitação documentada, sem heurística pra adivinhar.
29 testes novos (326). Ver `docs/data-provenance.md`.

### Etapa 5: participação em objetivos com dado real

A Etapa 4 deixou `objectiveParticipation` honestamente indisponível. Esta etapa passa a
calculá-lo do payload Match-V5 **já persistido**, sem integração externa nova.

**Auditoria que definiu a fórmula** (22 partidas, 220 participantes, patch 16.14):
`challenges` e `teams[].objectives` existem em 100% delas. Dragão e barão batem em todos os
220 casos; o **Arauto não**. Na partida `BR1_3263128214` nenhum dos dois times tem
`riftHerald.kills > 0` e mesmo assim um participante tem `riftHeraldTakedowns: 1` — e o
`teamRiftHeraldKills` dele é `0`, ou seja, o payload se contradiz internamente.
`riftHeraldTakedowns` e `objectives.riftHerald.kills` não estão na mesma base de contabilidade.

**Decisão**: a métrica é `(dragonTakedowns + baronTakedowns) / (dragões + barões do próprio
time)`. O Arauto fica de fora, documentado. Incluí-lo exigiria aceitar numerador maior que
denominador ou mascarar com clamp — nenhuma das duas produz um percentual verificável.

1. **`packages/core/src/aggregation/objective-participation.ts`** (novo) —
   `computeObjectiveParticipation`, pura. Time sem dragão nem barão fica `UNAVAILABLE` (não há
   denominador, e `0%` diria "não participou de nada" quando não houve nada de que participar).
   Só um dos dois campos de takedown presente também fica indisponível: somar um subconjunto
   contra um denominador que conta os dois subestimaria o percentual sistematicamente.
   Numerador > denominador **não é truncado** — sai como está, marcado `PARTIAL` com o motivo.
2. **Mapper do Match-V5** lê `teams[].objectives` pelo `teamId` real do participante (objetivo
   do inimigo nunca entra no denominador) e grava a razão mais os **absolutos**
   (`objectiveTakedowns`/`teamObjectiveKills`, migration `20260726150000`, ambos nullable).
3. **Backfill local** (`pnpm --filter @sparta/api backfill:objective-participation`) reprocessa
   o `Match.rawJson` já gravado, sem nenhuma chamada à Riot, e recalcula os `PlayerChampionStats`
   das contas vinculadas no fim — sem isso a métrica ficaria no `MatchParticipant` sem chegar ao
   perfil nem ao score até o próximo sync.
4. **Score**: o componente `objective` volta a participar pelo peso original (15% em JUNGLE e
   SUPPORT). Nenhum peso recalibrado; a normalização das Etapas 3 e 4 segue intacta.

**Achado real**: a primeira versão do backfill não era idempotente — comparava a **razão**
persistida com a recalculada, e `1/6` não faz round-trip exato pelo `double precision` do
Postgres, então uma linha era reescrita a cada execução. A comparação passou a usar os
inteiros, que são exatos e determinam a razão por completo.

**Medido na conta real (Zekerus#117)**: Viego JUNGLE **61,4 → 67,2** com `dataCoverage`
**0,85 → 1,0**; Vel'Koz SUPPORT cobertura 0,85 → 1,0 com `objective 53,6`; Thresh com **0%
real** (participou de 0 do único objetivo do time). Backfill: 220 participantes atualizados,
25 sem denominador, 0 inconsistentes, segunda execução com 0 escritas.

Validado no Electron real (CDP): Perfil com "Part. objetivos 100% · parcial · 4 de 5 partidas"
e a barra do componente de volta; Pós-game com "1 de 2 (50%) dos dragões e barões do seu time",
factual, sem leitura estratégica. **Não validado**: patch sem `challenges` (só existe 16.14 no
banco) e o caso `PARTIAL` por numerador maior que denominador — ambos cobertos por teste com
fixture. Ver `docs/data-provenance.md`. 37 testes novos (301).

### Etapa 4: ausência versus zero nas estatísticas

Depois de resolver o `50` ambíguo (Etapas 2 e 3), o mesmo problema existia com `0`: zero medido
e ausência de dado chegavam idênticos na tela e, pior, no score.

**Falso zero de maior impacto**: `objectiveParticipation` nunca foi extraído de fonte nenhuma —
o mapper do Match-V5 simplesmente não preenche esse campo. Medido no banco real: **0 de 220**
participantes têm o dado. A agregação (`averageAvailable`) era obrigada a devolver `0`, a coluna
era `NOT NULL`, e `scoreChampionPerformance` pontuava esse zero com **15% do peso** em JUNGLE e
SUPPORT — exatamente os papéis que Zekerus#117 joga. Contra a conta real: Viego JUNGLE
**52 → 61,4**, Vel'Koz SUPPORT **46 → 53,7**, ambos com `dataCoverage 0,85`.

1. **`StatCoverage`** (`types/domain.ts` + construtores em `types/stat-coverage.ts`) — valor
   agregado passa a carregar `sampleSize`, `availableSampleSize` (`null` = cobertura
   desconhecida) e `status`, reusando o `AvailabilityStatus` da Etapa 2 em vez de criar um
   segundo mecanismo. Média parcial usa **só as observações válidas** como denominador.
2. **`normalizeWeightsByAvailability`** (`scoring/weight-normalization.ts`, novo) — a regra da
   Etapa 3 virou função compartilhada; `normalizeAvailableWeights` (draft) e
   `scoreChampionPerformance` agora usam a mesma. Componente sem dado sai do cálculo e o peso é
   redistribuído; `ChampionPerformanceScore.dataCoverage` registra quanto do modelo participou.
3. **Timeline** — `csAt10/csAt15` ficam `undefined` quando a partida não chegou no minuto (a
   guarda que `goldDiffAt15` já tinha desde a Fase 1). `deathsBefore10/15` continuam `number`:
   contagem de eventos, `0` = não morreu.
4. **Bug real corrigido no caminho**: o filtro `stats.killParticipation > 0` em
   `player-insights.ts` (workaround do falso zero, desde a Fase 2) também descartava
   participação zero **legítima** — time com abates, jogador sem participar de nenhum. Virou
   `!== null`, que resolve os dois lados.
5. **`extractParticipantTeams`**: `teamId ?? 0` criava um time fantasma (a Riot usa 100/200) que
   entrava na conta de aliados/inimigos do `goldDiffAt15`. A entrada é descartada.
6. **Migration `20260726120000`** — colunas de participação viram nullable, mais
   `killParticipationSamples`/`objectiveParticipationSamples`. **Nenhum dado existente
   alterado**: de dentro do agregado não dá pra provar que um `killParticipation: 0` histórico é
   artificial, e as linhas se recalculam sozinhas no próximo sync. Já o `0` legado de
   `objectiveParticipation` é provadamente artificial e é servido como indisponível — regra
   centralizada no repositório, espelhada no cliente pro caso de API antiga.

**Dois achados extras**: `round(dataCoverage)` esmagava `0,85` pra `0,8` (`round` é da escala
0-100 dos scores); e faltava `globals: true` no vitest do renderer, então o
`@testing-library/react` nunca registrava o cleanup automático e o DOM acumulava entre testes
desde a Etapa 2.

Validado no Electron real (CDP, Zekerus#117): Perfil mostrando "Part. abates 47% · ref. 62%" ao
lado de "Part. objetivos **Indisponível**" com o motivo; `objective` fora das barras de
componente; Pós-game com timeline real íntegro; 0 `NaN`/`Infinity`/`undefined` em 4 telas.
**Não validado**: partida encerrada antes dos 10 minutos (remake) — não existe nenhuma no banco
real; coberta por teste com fixture. Ver `docs/data-provenance.md`. 35 testes novos (264).

### Etapa 3: matchup e meta indisponíveis sem dado real

`PERSONAL_MATCHUP` passou a usar exclusivamente partidas do jogador autenticado, com o mesmo
campeão, adversário e posição. Quando existe amostra, a métrica carrega valor (inclusive 50
legítimo), tamanho da amostra, confiança e proveniência `CALCULATED`; sem confronto observado
ou sem inimigo de rota, fica `UNAVAILABLE` com motivo. `GLOBAL_MATCHUP` não usa o banco local
como pseudo-meta e permanece explicitamente indisponível até haver fonte global real.

`META_STRENGTH` também fica `UNAVAILABLE` enquanto não houver Meta Intelligence observada para
o patch. O motor não usa ausência como 0 ou 50: `normalizeAvailableWeights` remove somente a
métrica indisponível por candidato, normaliza os pesos restantes e expõe `dataCoverage` como a
soma dos pesos originais que tinham dados. Cobertura e confiança estatística são conceitos
separados; a Champion Select mostra a cobertura sem aumentar a densidade do painel.

Compatibilidade continua centralizada em `ensureRecommendationMetrics`: `LANE_MATCHUP` existe
apenas como alias legado e respostas antigas com `matchup: 50`/`meta: 50` viram indisponíveis,
nunca evidência inventada. `docs/data-provenance.md` e `docs/draft-recommendation.md` registram
o contrato. Testes novos cobrem ausência, 50 calculado, proveniência, normalização, cobertura
individual e os caminhos legados.

### Fase 16: o draft real vem do League Client

Até aqui o Sparta lia da sessão de champion select **só** a posição do jogador e a ordem de
pick. Aliados, inimigos e banimentos ficavam de fora: o time inimigo tinha que ser marcado à
mão num grid de ~170 ícones, no meio do champion select. `myTeam`/`theirTeam`/`actions` já
estavam tipados em `read-only-client.ts` desde a Fase 6c e nunca foram consumidos.

1. **`packages/riot/src/lcu/draft-snapshot.ts`** (novo) - `deriveDraftSnapshot` monta
   aliados, inimigos, banimentos, o inimigo da própria rota e o campeão do jogador a partir da
   sessão. Decisões: `championId: 0` (ainda não escolheu) é descartado; bans só quando a ação
   está `completed`, dos dois times (um ban derruba o campeão pra todo mundo); e o **próprio
   jogador fica fora de `allies`** - aliado ali significa companheiro de time, e incluir a si
   mesmo faria a análise de composição contar o candidato duas vezes (o motor já injeta o
   campeão avaliado). O campeão do jogador sai em `selectedChampionId`. `isSameDraftSnapshot`
   evita propagar ticks idênticos - sem isso o renderer refaria a busca de recomendações a
   cada 2.5s. 14 testes.
2. **IPC `sparta:draft-snapshot`** no mesmo poll que já derivava posição e ordem de pick.
3. **`App.tsx`** resolve `championId → championName` pelo catálogo da Data Dragon já carregado
   no renderer (o motor casa aliados e inimigos **por nome**) e sincroniza no `DraftState`.
   O processo main não tem catálogo, por isso a derivação devolve só IDs.
4. **Champion Select** ganhou a fileira "Seu time", o contador de banidos, e **esconde o lápis
   de edição manual quando o draft vem do cliente** - uma edição manual seria sobrescrita no
   tick seguinte, em silêncio. Sem cliente (modo simulação), a edição manual continua igual.

**Limitação real encontrada e corrigida no caminho**: o watcher só transmitia **quando o valor
mudava**. Abrir o Sparta já dentro de um champion select (ou recarregar o renderer no meio de
um) deixava a tela vazia até o próximo pick, porque o último evento já tinha passado. Novo
`sparta:lcu-state` (request/response) devolve o estado atual sob demanda, e o renderer o
consulta uma vez ao montar.

**Validação**: a leitura HTTP do cliente do League continua **não validada** - exige o League
aberto e em champion select, indisponível neste ambiente. O que foi validado, injetando
temporariamente uma sessão sintética no lugar da chamada ao LCU (revertida antes do commit),
é **todo o caminho a partir da derivação**: `deriveDraftSnapshot` → comparação no main → IPC →
preload → merge no `DraftState` → resolução de nomes → tela. Medido no Electron real:
`getLcuState()` devolvendo `allies [103 MID, 222 ADC]`, `enemies [64 JUNGLE, 157 MID]`,
`bans [55, 91]`, `enemyLaneChampionId 64`, `selectedChampionId 234`; a tela abriu sozinha em
Champion Select com posição Jungle, "Seu time 2 escolhidos" (Ahri, Jinx), "2/5 revelados" +
"2 banidos" (Lee Sin, Yasuo), lápis ausente, 0 imagens quebradas. E as métricas reagiram ao
draft real: encaixe de composição 69, resposta ao draft inimigo 58 e sinergia com o time 21
(vermelho) - contra 50 neutro em três delas quando não havia time.

`docs/riot-compliance.md` foi atualizado com o escopo exato do que passa a ser lido e a
reafirmação de que nada é escrito no cliente: o Sparta não seleciona, bane, trava nem troca
campeão ou runas. O botão "Confirmar campeão" registra a escolha **só no Sparta**, pra gerar
build e análise pré-game.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos (194 testes).

### Fase 15: cobertura real do motor de draft (ChampionTag derivado)

Depois da Fase 14 o usuário perguntou o que ainda estava pendente. A resposta apontava o
Champion Select como o gargalo — e a investigação **corrigiu uma causa que estava errada neste
próprio arquivo desde a Fase 3**.

**Correção de diagnóstico (importante)**: o CLAUDE.md registrava que o Champion Select
devolvia 0 recomendações em MID "por causa da tabela `ChampionTag` com 2 campeões". Isso é
falso. Medido contra a API real: `SUPPORT` retornava Vel'Koz, que **não está** no seed. O
motor monta os candidatos a partir de `championStats` (os campeões que o jogador jogou) e
corta em `personalPerformance > 0`, que é 0 quando `games < MIN_GAMES_FOR_RANKING` (5).
Zekerus#117 tem 1 partida de Orianna em MID — por isso a lista vinha vazia. Campeão sem
`ChampionTag` entra na lista normalmente, só com métricas neutras.

Ou seja, eram dois problemas distintos: **a lista vazia** (piso de amostra) e **os cards
chapados** (6 das 8 métricas eram o default 50). Esta fase resolve os dois.

1. **`packages/core/src/draft/champion-tag-derivation.ts`** (novo) - `deriveChampionTag`
   deriva as 9 dimensões do `ChampionTag` a partir do único dado que a Riot publica pra todos
   os campeões: `tags` (classe) e `info` (attack/defense/magic/difficulty) do `champion.json`.
   Híbrido combina pelo **maior** valor de cada dimensão (Support/Tank protege como suporte E
   segura a frente como tanque - média apagaria as duas), exceto `blindSafety`, que usa o
   **menor** (se qualquer classe é arriscada sem informação, o campeão é arriscado).
   `mergeChampionTags` preserva entradas curadas. 14 testes.
2. **CLI `champion-tags:generate`** (`apps/api`) regenera `data/seeds/champion-tags.json`
   (versionado de propósito, pra a derivação ser revisável num diff). Resultado: **2 → 173
   campeões**, com Orianna e Ahri preservadas via `"source": "manual"`.
3. **`roles` fica vazio nas entradas derivadas** - a Data Dragon não publica rota, e chutar
   erraria em todo campeão flex. Nenhum motor consome `tag.roles` hoje.
4. **Bug real no seed**: o upsert passava `update: {}`, então rodar o seed de novo **nunca
   atualizava** um campeão já gravado - regenerar o JSON não chegaria ao banco. Corrigido.
5. **Bug real exposto pela expansão** (`recommendation-engine.ts`): sem nenhum aliado
   escolhido, `analyzeTeamComposition` passa a descrever só o próprio candidato, e
   `calculateAllySynergy` degenera em `100*(e² + p² + w²)/3` - que **nunca passa de 33**. Todo
   first pick levava uma penalidade que não diz nada. Ficava invisível enquanto quase ninguém
   tinha tag (sem tag a função já devolvia 50); passou a valer pra todos quando a tabela
   cobriu o roster. Agora devolve o neutro 50 sem aliados, mesma convenção que
   `calculateEnemyAnswer` já usava pro time inimigo vazio. Pelo mesmo motivo, os rótulos de
   risco/força de composição só são emitidos quando há pelo menos um aliado - antes o card do
   first pick exibia "Pouca linha de frente, Engage limitado, Wave clear baixo" como se fosse
   leitura do time, sendo leitura só do próprio campeão. 2 testes de regressão.
6. **Estado vazio honesto no Champion Select** (`features/ChampionSelectScreen.tsx`) - a
   descrição culpava a tabela curada (o mesmo diagnóstico errado). Agora explica o piso de 5
   partidas e lista os campeões daquela posição que estão perto do corte, com quantas partidas
   faltam, usando o perfil real.

**Medido no app/API reais, conta Zekerus#117:**

| Cenário                                        | Antes                                                                             | Depois                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Viego (JUNGLE), first pick                     | blind 50, sinergia 50, encaixe 50 (defaults)                                      | blind **43**, sinergia **50** (neutro correto), encaixe **65**                          |
| Viego, com Ahri+Jinx aliados e Lee Sin inimigo | idem, tudo 50                                                                     | sinergia **21.3**, resposta ao draft **57.8**, encaixe **69**, aviso de composição real |
| Avisos no first pick                           | "Pouca linha de frente, Engage limitado, Wave clear baixo, Dano pouco balanceado" | só "Amostra pequena"                                                                    |
| MID (sem amostra)                              | "Nenhuma recomendação" + motivo errado                                            | "Ainda sem amostra suficiente em Mid" + "Orianna: 1 de 5 partidas"                      |

`matchup` e `meta` seguem em 50 de propósito: o primeiro precisa de histórico do confronto, o
segundo de `PatchMetaData`, que o Sparta não tem.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos (181 testes).

### Fase 14: modernização completa de UI/UX (concluída)

Pedido do usuário depois da Fase 13: transformar o Sparta num app desktop com aparência e
experiência comparáveis a produtos consolidados de LoL (Mobalytics, Blitz, iTero como
referência de princípios, não de cópia), mantendo o sistema de temas por skin como
diferencial. Dividida em subfases pequenas e validáveis (A a F), uma por PR.

**Auditoria que motivou o desenho** (feita antes de tocar código):

- `global.css` tinha 1102 linhas num arquivo só, sem camadas (tokens, base, componentes e
  telas misturados).
- Seletores descendentes genéricos (`.page-header span, .recommendation span, .metric span`,
  `.champion-row span`) casavam **qualquer** `<span>` aninhado - foi exatamente a causa do bug
  de cor do `ScoreBadge` na Fase 9b. O fix de lá foi pontual; a causa continuava.
- Reuso por empréstimo de classe: `.champion-row` (linha do Perfil) era reusada como linha de
  partida no Pós-game **e** linha de tendência na Evolução, com `style={{gridColumn}}` inline
  pra consertar o encaixe. `.recommendation button` estilizava botão por posição no DOM.
- `App.tsx` tinha 834 linhas com 7 responsabilidades (shell, sessão, 3 efeitos de IPC e 5
  telas inline).
- **`@sparta/ui` era 100% código morto**: declarado em `apps/desktop/package.json`, zero
  imports em qualquer arquivo do repositório; seu `tokens.ts` duplicava (desatualizado) os
  valores do `:root`.
- Sem `:focus-visible` em lugar nenhum (navegação por Tab literalmente invisível), sem
  `prefers-reduced-motion`, sem estados `disabled` consistentes.
- `min-width: 1000px` no body, sidebar fixa em 260px e `max-width` hardcoded (860-980px): em
  1920px metade da tela ficava vazia, em 1000px a navegação comia 26% da largura.

#### Subfase 14A - fundação (design system, shell, navegação)

**Decisão de arquitetura**: o design system mora em `apps/desktop/src/renderer/src/ui/`, com
**um CSS colocado por componente**, e `packages/ui` foi **removido** do repositório. Aquele
pacote não tem pipeline de CSS (build é `tsc` puro) e não tem segundo consumidor possível (API
e analyzer não renderizam UI) - manter os componentes lá separaria o CSS do TSX e dividiria a
fonte de verdade em vez de unificá-la. Registrado em `docs/design-system.md` e no ADR 0001.

1. **`ui/tokens.css`** - tokens organizados por função (superfície, borda, texto, destaque,
   semântico, sombra, raio, espaço, tipografia, transição, z-index, layout). Mantém aliases
   dos nomes antigos (`--color-bg`, `--color-surface`...) só enquanto as telas migram, pra a
   migração ser incremental em vez de big-bang; os aliases caem na subfase F. Os três
   `--color-accent*` mantêm o nome exato - `featured-champion-context.tsx` os sobrescreve em
   runtime **por nome**, e renomear quebraria o tema dinâmico da Fase 13.
2. **`ui/base.css`** - reset, tipografia do documento, `::selection`, scrollbar, e as duas
   peças de acessibilidade que faltavam: `:focus-visible` (anel de 2px na cor do tema) e
   `@media (prefers-reduced-motion: reduce)`.
3. **16 componentes novos em `ui/`**: `AppShell`/`Sidebar`/`SidebarGroup`/`SidebarNavItem`/
   `PlayerSummary`, `PageLayout`/`PageHero`/`PageSection`/`Grid`/`Columns`/`Toolbar`/
   `InlineStats`, `Card`/`InteractiveCard`/`SectionHeader`, `Button`/`IconButton`, `Badge`/
   `StatusBadge`, `Field`/`Select`/`NumberField`/`SearchInput`/`ReadOnlyValue`,
   `SegmentedControl`/`Tabs`, `Tooltip`/`InfoHint`, `Loading`/`Skeleton`/`SkeletonGrid`/
   `SkeletonRows`/`EmptyState`/`ErrorState`, `DataTable`/`DataRow`/`IdentityCell`/`NumCell`,
   `ChampionAvatar`/`EmptyAvatarSlot`, `ChampionGrid`, e os três da Fase 9 migrados
   (`ScoreBadge`+`ScoreBlock`, `StatBar`, `SignalChip`+`SignalChipList`).
4. **Reorganização de pastas** (parte do "App.tsx concentra responsabilidades demais"):
   `services/` (api-client, datadragon), `hooks/` (use-async-data), `theme/`
   (featured-champion-context, accent-color, SkinSplash, ChampionSkinPicker, novo
   `ThemedPageHero`), `app/` (navigation, labels), `ui/` (design system), `features/` (telas).
   `App.tsx` caiu de 834 pra ~215 linhas e passou a cuidar só de sessão, IPC e roteamento;
   Dashboard/Perfil/Champion Select/Pré-game viraram arquivos próprios.
5. **Navegação agrupada por momento de uso** - Análise (Dashboard/Perfil/Evolução), Partida
   (Champion Select/Pré-game/Pós-game), App (Configurações), em vez de uma lista única de 7
   itens. Sidebar de 232px (era 260px, encolhe pra 196px abaixo de 1160px), com resumo da
   conta no rodapé e ponto verde pulsante no Champion Select quando o LCU detecta a sessão.
6. **Correções estruturais de CSS**: as regras de `span` descendente foram **removidas**
   (causa raiz do bug da Fase 9b, não só o sintoma); `.champion-row` deu lugar ao `DataTable`
   com template de colunas parametrizado, eliminando o `gridColumn` inline da Evolução; linha
   clicável virou `<button>` de verdade (recebe foco e responde ao teclado - antes era um
   `<article style={{cursor:"pointer"}}>`); `global.css` caiu de 1102 pra ~330 linhas, só com
   telas de autenticação e restos ainda não migrados.

**Validado no app Electron real via CDP** (não no dev server aberto como aba comum), conta
Zekerus#117: `window.sparta` presente, shell novo com 7 itens em 3 grupos, sidebar medindo
232px, herói com splash + score real, Perfil com tabela real (11 linhas, avatares, badge só
nos campeões elegíveis), as 7 telas renderizando com **0 imagens quebradas** e nenhum
`.panel` legado fora de Configurações. Foco por teclado confirmado com um **Tab de verdade**
(`Input.dispatchKeyEvent`, já que `element.focus()` via JS não dispara `:focus-visible` no
Chromium): `focusVisible: true`, `outlineWidth: 2px` na cor do tema.
`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos.

#### Subfase 14B - Dashboard e Perfil

O Dashboard tinha 4 cards idênticos em grid 4x1 (exatamente o anti-padrão que o usuário pediu
pra evitar), com um `h1` de 40px que era slogan de marketing, não informação; o Perfil listava
todos os campeões sem busca, filtro nem ordenação, e **nunca exibia** `preferredRoles`,
`recentForm`, `killParticipation`, `objectiveParticipation`, `goldPerMinute` nem
`visionScorePerMinute` - todos já vinham da API desde a Fase 1/2.

1. **Dashboard** (`features/DashboardScreen.tsx` + `.css`) - herói com o nome real da conta e
   uma linha de números agregados (partidas analisadas, winrate geral, tamanho do pool,
   tendência), calculados sobre `championStats` inteiro (não só os elegíveis pro ranking, pra
   "partidas analisadas" bater com o histórico real). Layout em duas colunas: à esquerda forma
   recente (10/20/50) + **faixa das últimas 10 partidas** (`fetchRecentMatches`, um retrato por
   partida com barra verde/vermelha embaixo - o retrato continua reconhecível e o resultado
   legível de relance) e o pool de campeões com winrate real por campeão; à direita ponto forte
   (card `feature`), risco atual e um resumo da Evolução (`fetchGrowthJourney`), com atalhos que
   navegam pras telas cheias. **Atalho contextual**: quando o LCU detecta champion select, o
   herói troca o rótulo por um `StatusBadge` ao vivo e mostra um botão primário "Abrir Champion
   Select".
2. **Perfil** (`features/ProfileScreen.tsx`) - barra de ferramentas com filtro por posição
   (`SegmentedControl` com contagem real por role, desabilitando as vazias), busca por nome e
   ordenação (desempenho / partidas / winrate / nome). A tabela virou resumo e ganhou um
   **painel de detalhe fixo** (`stickyAside`) que abre o que nunca era mostrado: as 8 médias
   reais do campeão comparadas com `roleBaselines[role]` e os **10 componentes** de
   `scoreChampionPerformance` como barras. Campeão sem amostra suficiente não ganha score
   inventado - mostra "—" na tabela e um chip explicando que faltam partidas, com as médias
   continuando reais.

**Bug de layout encontrado na validação real**: o breakpoint de `.sp-columns` era
`max-width: 1280px`, mas a janela padrão do Electron tem **1264px de viewport** - ou seja, o
layout de duas colunas **nunca aparecia** no tamanho em que o app abre. Corrigido pra 1180px,
valor medido a partir da conta real (viewport − sidebar 232px − padding), o que deixa a coluna
principal com ~610px ao lado do painel de 340px. Confirmado no app real:
`gridTemplateColumns: "610.406px 340px"` com `innerWidth: 1264`.

Validado no Electron real via CDP com Zekerus#117: Dashboard com 22 partidas / 41% / 11
campeões / faixa "2V — 8D nas últimas 10" reais; Perfil com filtro por role mostrando as
contagens certas (Jungle 6, Mid 1, Suporte 4, Top e ADC desabilitados em 0), busca reduzindo a
tabela de 11 pra 1 linha ("thre" → Thresh), clique numa linha trocando o painel de detalhe
(Vel'Koz) com os 10 componentes renderizados. `pnpm typecheck && pnpm lint && pnpm test &&
pnpm build` completos (164 testes).

#### Subfase 14C - Champion Select e Pré-game

O Champion Select empilhava cards completos de recomendação um embaixo do outro, cada um
repetindo score, barras, sinais e botão - com 5 recomendações, comparar duas exigia rolar a
tela. O seletor de time inimigo era um grid de ~170 ícones sempre aberto, embaixo das
recomendações. O Pré-game apresentava um texto 100% estático com o mesmo peso visual do dado
real, o que fazia a orientação padrão parecer análise personalizada.

1. **Champion Select vira workspace de decisão** (`features/ChampionSelectScreen.tsx` + `.css`)
   - barra de sessão fixa no topo (posição, ordem de pick e **as 5 vagas do time inimigo**, com
     `EmptyAvatarSlot` marcando quem ainda não foi revelado: quantos faltam é informação de
     draft, não espaço vazio); rail estreito à esquerda com as recomendações compactas
     (selecionáveis, a #1 destacada como `feature` + selo TOP) e painel de detalhe à direita com
     as **8 métricas** (antes só as 4 maiores), razões e alertas completos e o botão de confirmar.
     O grid de campeões inimigos virou **colapsável** (lápis na barra) e rola por dentro. Clicar
     numa vaga preenchida remove aquele inimigo.
2. **Rótulos crus traduzidos** - `PickRecommendation.category` (`best_blind`, `comfort_pick`…)
   e `confidence` apareciam em inglês na tela; novo `categoryLabels` em `app/labels.ts`.
3. **Pré-game reorganizado** (`features/PreGameScreen.tsx`) - herói com a splash do campeão
   confirmado e números reais (posição, inimigos revelados, perfil de dano da composição);
   composição inimiga com as 5 vagas e as duas médias de dano como barras comparáveis (escala
   0-10 da Data Dragon convertida pra 0-100); **build sugerida reaproveitando o `BuildPanel`**
   do Champion Select, agora também no Pré-game. O texto estático ficou num card `flat` com o
   rótulo "Orientação geral" e uma frase explicando que a rota do backend ainda não usa dado
   real - separado do que é derivado de verdade.

**Bug real encontrado na validação**: `toggleEnemy` (e os outros handlers de draft) montavam o
próximo estado a partir do `draft` do fechamento (`setDraft({ ...draft, ... })`). Dois cliques
no mesmo lote de render liam o mesmo estado antigo e o segundo sobrescrevia o primeiro -
medido no app real: **3 cliques no grid deixavam só 1 inimigo selecionado**. Corrigido passando
`setDraft` como `Dispatch<SetStateAction<DraftState>>` e usando a forma funcional em todos os
handlers; reteste no app real confirmou os 3 cliques aplicando (o primeiro removeu um inimigo
já marcado, os outros dois adicionaram → 2 vagas preenchidas, exatamente o esperado).

Validado no Electron real via CDP com Zekerus#117 em JUNGLE (o papel com histórico real):
recomendação de Viego com score 53, categoria "Zona de conforto" traduzida, 8 barras de
métrica, 1 razão e 2 alertas reais; grid de 173 campeões abrindo pelo lápis; build sugerida
com itens reais em pt-BR (Grevas do Berserker / Gume do Infinito / Sedenta por Sangue / Força
da Trindade) e o aviso honesto "só 2 de 5 campeões inimigos informados"; Pré-game com a splash
de Viego, composição 2/5 e as duas barras de dano em 5.5/10. 0 imagens quebradas.
`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos.

#### Subfase 14D - Pós-game e Evolução

O Pós-game apresentava o relatório como duas frases com `<strong>` na frente, cinco barras de
mesmo peso visual e dicas prefixadas com emoji - não dava pra saber, olhando, qual foi o maior
erro da partida. A lista de partidas reusava a classe da tabela do Perfil, com
`style={{cursor:"pointer"}}` inline e sem indicar a linha selecionada nem o resultado. A
Evolução repetia "Estável" em quase toda linha, sem separar o que melhorou do que piorou.

1. **Pós-game** (`features/PostGameScreen.tsx` + `.css`) - lista de partidas virou um rail de
   cards selecionáveis com o resultado numa faixa colorida (na borda **direita** de propósito:
   a esquerda é onde `.sp-card--selected` desenha a marca de seleção, e as duas no mesmo lugar
   se sobreporiam). O relatório ganhou hierarquia real: card `feature` com o veredito, o que
   era esperado e o que aconteceu; card separado de **"Prioridade de melhoria"** com o ponto
   fraco de maior peso (`weaknesses[0]`, já ordenado por magnitude pelo motor da Fase 4); as
   razões vs. referência agora mostram **o valor absoluto ao lado da razão** (só a razão
   escondia o número que o jogador reconhece da partida); dicas numeradas por ordem de impacto
   em vez de parágrafos com 💡. Estados de carregando/erro/vazio resolvidos por card.
2. **Evolução** (`features/GrowthJourneyScreen.tsx`) - as linhas passaram a ser **agrupadas por
   direção** (Piorando / Melhorando / Sem mudança relevante / Ainda sem comparação). O grupo
   "ainda sem comparação" mostra só a taxa recente e explica o porquê, em vez de exibir um
   "Estável" que na verdade significa "ainda não dá pra saber". Novo card **"Foco sugerido"**,
   que não é cálculo novo: é o ponto fraco de maior `recentRate`, ou seja, o que mais se repete
   nas partidas recentes.

Validado no Electron real via CDP com Zekerus#117: relatório real de uma derrota de Vel'Koz
SUPPORT contra Lulu (veredito, "8 partidas anteriores com score histórico 45.7", prioridade
"Controle de visão abaixo do esperado" com severidade alta, 5 barras com valor absoluto e
razão - ex. KDA 3.00 (97%), CS/min 3.0 (251%) -, 4 chips e 2 dicas numeradas); Evolução com 8
partidas analisadas, 4 pontos acompanhados, 0 com comparação, foco sugerido "KDA abaixo do
esperado" em 62.5% das partidas recentes. 0 imagens quebradas.
`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos.

#### Subfase 14E - Configurações e galeria de temas

O seletor de skins era um grid técnico: cards de 160px com a splash (1215x717) esmagada em
90px de altura - a arte, que é justamente o que se está escolhendo, ficava irreconhecível. A
seção "Análise" reusava `.draft-controls`, a classe dos controles do Champion Select.

1. **`theme/ThemeGallery.tsx`** (substitui `ChampionSkinPicker.tsx`) - card de **tema atual**
   com prévia da arte, as **três amostras da cor extraída** (destaque / suave / brilho) e um
   badge de "Disponível offline" vs "Só online", mais a explicação do que o tema de fato afeta
   no app. Na escolha, a arte ganhou **prévia grande** (16:6) com as ações por cima e uma
   **grade compacta** embaixo, marcando com um selo a skin aplicada. `SkinSplash` ganhou
   `className` pra servir aos dois tamanhos. A filtragem de chromas da Fase 13 é preservada
   integralmente.
2. **`features/SettingsScreen.tsx`** - as duas áreas viraram abas (`Tabs`), e a configuração de
   profundidade de análise trocou `.draft-controls` por `SegmentedControl` + `NumberField`, com
   badge de "Salvando..." / "Salvo" e a explicação de que o valor vale a partir do próximo sync.

Validado no Electron real via CDP com Zekerus#117: Zed com **15 skins e 0 nomes com parênteses**
(chromas continuam fora); aplicar "PROJETO: Zed" mudou o token `--color-accent` de
`hsl(218 100% 62%)` (azul) pra `hsl(8 100% 62%)` (laranja) e voltar pra "Zed Lâmina do Trovão"
restaurou o azul - o tema dinâmico da Fase 13 segue intacto; baixar gravou o data URL e o badge
virou "Disponível offline"; na aba Análise, clicar "Últimas 100" salvou e o
`GET /players/settings` da API real confirmou `matchAnalysisLimit: 100` (restaurado pra 50
depois do teste). 0 imagens quebradas.
`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos.

#### Subfase 14F - polimento, acessibilidade e validação final (encerra a Fase 14)

1. **Telas de autenticação migradas** - `AuthScreen` e `LinkRiotAccountScreen` eram as últimas
   com CSS próprio (`.auth-*`). Novo `ui/AuthLayout.tsx` (+ `AuthForm`) e novo primitivo
   `TextField`; as duas telas passaram a usar `Field`/`Button`/`SignalChip` como o resto do app.
   O estado "verificando sessão" também usa o `AuthLayout`, pra a transição pro app não trocar
   o fundo debaixo do usuário.
2. **`styles/global.css` deletado** e os **aliases legados de token removidos** de `tokens.css`
   (existiam só pra a migração ser incremental). O CSS do app agora é 100% `ui/tokens.css` +
   `ui/base.css` + um arquivo por componente. **Zero classe fora do prefixo `sp-`** no DOM.

**Validação medida no app Electron real (CDP), conta Zekerus#117:**

| O quê                                                   | Resultado                                                                                                                                                                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1000x720 / 1280x720 / 1440x900 / 1920x1080, nas 7 telas | Sem overflow horizontal, sem card cortado, navegação completa                                                                                                                                                                           |
| Sidebar responsiva                                      | 232px acima de 1160px de viewport, 196px abaixo (medido em cada largura)                                                                                                                                                                |
| Foco por teclado                                        | Tab real (`Input.dispatchKeyEvent`): `focusVisible: true`, anel de 2px na cor do tema                                                                                                                                                   |
| `prefers-reduced-motion: reduce`                        | Transição de card e animação de spinner caem pra ~0s                                                                                                                                                                                    |
| Trava da cor de destaque                                | 4 skins de artes bem diferentes: Lux Elementalista `hsl(38)` dourada, Thresh Terror Profundo `hsl(203 100% 45%)` (o mais escuro permitido), Leona Solari `hsl(23)`, Nocturne `hsl(203)` - **todas dentro** de S≥55% e L entre 45% e 62% |
| Offline com tema baixado                                | Com a rede desligada, a arte (data URL) e a cor continuam aplicadas                                                                                                                                                                     |
| Imagens quebradas                                       | 0 em todas as telas, em todas as validações                                                                                                                                                                                             |

**Limite honesto do teste de offline**: recarregar a página com a rede desligada não renderiza
nada **em modo de desenvolvimento**, porque o renderer é servido pelo Vite via
`http://localhost:5173` - não é comportamento do app empacotado, onde a página vem do bundle
local. O que dá pra afirmar com o que foi medido: o tema baixado e a cor sobrevivem sem rede
enquanto o app está aberto. Recarga offline no app empacotado continua não validada.

**Não validado nesta fase** (mesmo limite de sempre): a detecção real de posição/ordem de pick
dentro de uma sessão de champion select de verdade, que precisa do cliente do League aberto.

### Fase 13: o tema veste o app (sem chromas + cor dinâmica + splash nas telas)

Pedido do usuário depois da Fase 12: tirar os **chromas** do seletor de skins (poluíam a lista como se fossem temas) e fazer o tema **refletir muito mais no app** - cores derivadas da skin e splash art de fundo, com a linguagem visual de **Mobalytics, Blitz e iTero**.

**Achado 1 - o campo `chromas` da Data Dragon não serve pra filtrar**: ele significa "esta skin _tem_ chromas", não "isto é um chroma". Os chromas vêm como entradas irmãs, com `chromas: false` e o nome entre parênteses. A fonte limpa é a **Community Dragon**, que já era usada desde a Fase 12: o JSON do campeão traz só as skins reais no topo, com os chromas **aninhados** (`skins[].chromas[]`), e o `id` é `championId * 1000 + num`. Novo `fetchRealSkinNums(championId)` (`datadragon.ts`) deriva esse conjunto e `fetchChampionSkins` filtra a lista pt_BR por ele - mantém os nomes em português e tira os chromas. Sem a Community Dragon (CDN fora), devolve a lista completa: melhor mostrar chroma a mais do que esconder skin de verdade. **Medido no Zed: 71 → 15 cards, 0 com parênteses.**

**Achado 2 (bug real, latente desde a Fase 10) - a CSP bloqueava a Community Dragon**: `apps/desktop/src/renderer/index.html` listava só `ddragon.leagueoflegends.com` em `img-src`/`connect-src`. Ou seja, **todo fallback de Community Dragon adicionado nas Fases 10 (ícones) e 12 (splash) era código morto** - nunca poderia ter disparado, e a validação daquelas fases não testou o caminho de fallback de fato. Corrigido adicionando `https://raw.communitydragon.org` nas duas diretivas; só então o filtro de chroma (e os fallbacks anteriores) passaram a funcionar.

**Achado 3 - a cor de destaque já era totalmente centralizada**: os 22 usos passavam por 3 custom properties. Renomeados de `--color-red*` pra `--color-accent*` (o nome antigo mentiria) e agora **sobrescritos em runtime** com a cor extraída da skin - re-tematiza o app inteiro sem tocar em nenhum seletor.

1. **Novo `features/accent-color.ts`** - `extractAccentPalette(imageUrl)` desenha a splash num canvas 48x48 (`crossOrigin="anonymous"`; as duas CDNs respondem `Access-Control-Allow-Origin: *`, medido) e agrupa os pixels em 24 baldes de matiz ponderados por saturação, descartando quase-preto/quase-branco/cinza - média simples de RGB daria sempre um cinza-marrom, já que cores opostas se cancelam. **Trava de segurança**: satura o mínimo (55%) e prende a luminosidade entre 45% e 62%, garantindo contraste contra o fundo quase-preto pra qualquer skin. Retorna `undefined` em qualquer falha (o chamador mantém o vermelho padrão, nunca inventa cor).
2. **`featured-champion-context.tsx`** - aplica a paleta nos tokens `--color-accent*` e **persiste no localStorage** (`accent`), pra a cor aparecer no boot sem flash de vermelho. Passou também a expor `splashUrl` (a duplicação "local baixada ?? CDN" existia em 3 lugares).
3. **Splash nas telas** - novo `features/ThemedHeader.tsx` (pega a arte do contexto, sem prop drilling) substitui o `page-header compact` (só texto) em Perfil, Champion Select, Pós-game, Evolução e Configurações. A nova classe `.page-header.themed` tem scrim escuro (legibilidade) + lavagem na cor do tema + barra de destaque na lateral. O `radial-gradient` do `body` trocou um vermelho hardcoded por `--color-accent-glow`, e o item ativo da sidebar ganhou barra na cor do tema.

O trio semântico `--color-green`/`--color-yellow`/`--color-red` (bom/neutro/ruim em scores) ficou **fixo de propósito** - se seguisse o tema, "bom" e "ruim" mudariam de cor a cada skin e perderiam o significado. Isso **reverte deliberadamente** a decisão anterior de "cor de destaque fixa em vermelho" (registrada até a Fase 12), a pedido explícito do usuário.

Validado no app Electron real via CDP: Zed com **15 cards / 0 chromas**; a matiz do destaque acompanha a arte de verdade (Empíreo/SKT T1 → azul `hsl(233)`, Lua Sangrenta → vermelho `hsl(353)`, Jornada Imortal → ciano `hsl(203)`, PROJETO → laranja `hsl(8)`), sempre dentro da trava; as 5 telas com `background-image` não-vazio no cabeçalho; nenhum erro de console. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos (164 testes).

### Bug real corrigido: módulo de temas (splash nunca carregava nem aplicava)

Depois da Fase 11 o usuário reportou que o módulo de temas continuava quebrado. A investigação (testando as URLs reais contra a CDN e o fluxo real pelo bridge IPC do Electron) achou **dois bugs independentes**, os dois presentes desde a Sub-fase 6a:

1. **Extensão errada da splash art**: `championSplashUrl` (`apps/desktop/src/renderer/src/features/datadragon.ts`) montava a URL com `.png`, mas a Data Dragon serve splash art como **`.jpg`** - e a CDN responde **403** (não 404) pra `.png`. Isso quebrava _tudo_: as prévias das skins no seletor (todas caíam no fallback pro ícone do campeão) **e** o download (`Falha ao baixar a imagem (403)`). Confirmado medindo as duas extensões: `Ahri_0.png` → 403 / `Ahri_0.jpg` → 200 (158KB). **A "validação" do download na Fase 11 passou por engano** - testou o handler IPC com uma URL `.jpg` montada à mão, não o caminho que o app realmente usa (que montava `.png`); o User-Agent adicionado lá não era a causa raiz (mas foi mantido, é correto ter).
2. **`file://` nunca carregava no renderer**: mesmo com o download gravando o arquivo em disco, o `localSplashPath` era `file://<caminho>` e o Chromium bloqueia `file://` a partir da origem da página (`http://localhost` em dev, bundle em prod) - o tema "baixado" nunca aparecia. Confirmado no Electron real: arquivo de 187KB no disco, `img.onerror` disparando. Tentei um esquema próprio (`protocol.registerSchemesAsPrivileged` + `protocol.handle`, com `standard`/`secure`/`corsEnabled`), mas **o handler nunca era chamado** a partir de uma origem `http://` - o Chromium bloqueia antes. Solução final: o handler IPC devolve um **data URL** (`data:image/jpeg;base64,...`), que carrega em qualquer origem; o arquivo em disco continua sendo a cópia offline.

Além disso, atendendo ao pedido explícito do usuário de usar outra API como fallback: novo `communityDragonSplashUrl(championId, skinNum)` (`datadragon.ts`) resolve a splash pela **Community Dragon** (JSON do campeão por ID numérico → `splashPath` mapeado pra URL da CDN), usado (a) automaticamente no `<img>` via o novo componente `SkinSplash.tsx` (Data Dragon → Community Dragon → ícone do campeão) e (b) no download, quando a Data Dragon falha pra aquela skin. `featured-champion-context.tsx` descarta `localSplashPath` legado que não seja `data:` (os `file://` gravados antes nunca funcionariam).

Validado no app Electron real via CDP: as **71 prévias de skin do Zed carregam, 0 quebradas** (antes: todas 403); clicar "Baixar" pela UI real grava o arquivo e persiste um data URL de 244KB; o Dashboard renderiza a splash baixada (`1215x717`). `pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos.

### Fase 11: detecção de posição/lane + gating do Champion Select + polimento

Feedback do usuário depois de reabrir o app com a Fase 10: (1) botão "← Voltar pra lista de campeões" sem estilo nenhum (`<button>` HTML puro); (2) download de skin não funcionava; (3) Champion Select podia ser aberto/usado livremente, sem o jogador estar numa sessão real; (4) faltava detecção automática da posição/papel (Top/Jungle/etc.) e de troca de lane; (5) Dashboard e telas resumidas demais.

**Achado-chave da detecção de papel**: `LcuChampSelectTeamMember.assignedPosition` (`packages/riot/src/lcu/read-only-client.ts`) já era lido e tipado desde a Fase 6c, só nunca consumido. O LCU atualiza esse campo ao vivo quando dois jogadores trocam de posição pela ferramenta do próprio cliente - como o Sparta já faz poll da sessão a cada 2.5s (mesmo loop que deriva `pickOrder`), reler o campo a cada tick detecta a troca de lane de graça, sem lógica de detecção de troca nenhuma. **Achado-bug real**: `draft.playerRole` estava hardcoded em `"MID"` (`App.tsx`) e nunca era alterado por código nenhum - todo jogador que não joga MID recebia recomendações calculadas pro papel errado, e não havia _nenhum_ controle (manual ou automático) pra definir isso.

1. **`packages/riot/src/lcu/player-role.ts`** (novo, padrão de `pick-order.ts`) — `derivePlayerRole(snapshot): Role | undefined`. Mapeia `assignedPosition` do LCU (`top/jungle/middle/bottom/utility`) pro `Role` do Sparta (`bottom→ADC`, `utility→SUPPORT`). Retorna `undefined` (nunca chuta) sem sessão, jogador não encontrado, ou posição vazia/desconhecida (blind pick/ARAM). 8 testes (`player-role.test.ts`), incluindo o cenário de troca de lane (chamar 2x com snapshots diferentes confirma que não precisa de estado extra).
2. **IPC `sparta:player-role`** — `startGameflowWatcher` (`apps/desktop/src/main/index.ts`) deriva o papel no mesmo tick que já deriva a ordem de pick, transmite só quando muda; `preload/index.ts` + `sparta-global.d.ts` ganharam `onPlayerRole` (mesmo padrão de `onPickOrder`). `App.tsx` ganhou `autoPlayerRole` que sincroniza em `draft.playerRole`.
3. **Champion Select com gating** (`App.tsx`, `ChampionSelect`) — novo estado `champSelectActive` (dirigido pela fase `ChampSelect` do gameflow, já assinada). Sem sessão real de champion select, a aba mostra uma tela de espera ("Aguardando sua seleção de campeões") com um botão "Simular manualmente" (decisão confirmada com o usuário via `AskUserQuestion`) que revela os controles - preserva a possibilidade de testar sem o League aberto. Novo **seletor manual de posição** (`<select>` com os 5 papéis) exibido quando `autoPlayerRole === null`, ao lado do input de pick order manual - a peça que faltava pro papel (o pick order manual já existia pra ordem).
4. **`.btn-secondary`** (`global.css`) — classe reaproveitável (mesmos valores que `.recommendation button` já usava inline) aplicada nos botões que estavam sem estilo nenhum: "← Voltar pra lista de campeões" (`ChampionSkinPicker.tsx`), "Reanalisar" (`PostGameScreen.tsx`) e o novo "Simular manualmente".
5. **Download de skin: tentativa de correção** (`registerSkinDownloadHandler`, `main/index.ts`) — adicionado um header `User-Agent` no `fetch` do processo main (o Electron não manda um por padrão). **Isso NÃO era a causa raiz** e o download continuou quebrado - a validação daquela sessão passou por engano porque testou o handler IPC com uma URL `.jpg` montada à mão, e não o caminho real do app (que montava `.png` e levava 403). Causa raiz de verdade achada e corrigida na Fase 12 (ver "Bug real corrigido: módulo de temas" no topo). O UA foi mantido - é correto ter, só não era o problema.
6. **Dashboard mais denso** (`App.tsx`, `Dashboard`) — 3 scores de forma recente (`last10/20/50Score`, os dois últimos nunca exibidos antes) como badges lado a lado; mini-leaderboard dos top 3 campeões (`rankChampionPool(...).slice(0,3)`, cada um com `ChampionIcon` + role + partidas + `ScoreBadge`); lista completa de pontos fortes/fracos como `SignalChip` (antes só `[0]` de cada aparecia). **Evolução** (`GrowthJourneyScreen.tsx`) — cada linha mostra o `confidence` do trend (já em `WeaknessTrend.confidence`, nunca exibido).

Validado via `electron-vite dev` no app Electron real (CDP, conta Zekerus#117): Dashboard denso (3 scores, leaderboard Viego JUNGLE 52 / Vel'Koz SUPPORT 46 com ícones, todos os chips); Champion Select mostrando a tela de espera por padrão + "Simular manualmente" revelando os controles com o novo seletor de Posição; Evolução com "confiança média" por linha; botões estilizados. `window.sparta.onPlayerRole` confirmado existente no bridge. **Não testável neste ambiente**: a detecção real de papel/troca de lane dentro de uma sessão de champion select de verdade (precisa do cliente do League aberto) - mesmo limite de sempre pro `pickOrder` automático. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos.

O que ficou deliberadamente fora de escopo: sparkline/timeline por partida individual na Evolução (exigiria mudar o contrato de `computeWeaknessTrends` pra reter presença por partida, não só a taxa agregada); auto-importar `myTeam`/`theirTeam` (aliados/inimigos reais) pro `DraftState` via LCU (item técnico separado, já documentado como próximo passo); integração rank/LP (League-V4, Sparta não tem).

### Fase 10: polimento de UX a partir do feedback ao vivo do usuário

Validação do app real (sessão anterior) terminou com o usuário abrindo o Sparta de verdade e avaliando visualmente, comparando com apps reais de LoL (Blitz, Porofessor.gg, LoLTheory, OP.GG, capturas anexadas). Feedback: (1) Dashboard usava a palavra **"Estável"** sem contexto e um card **"Escopo"** que não servia pro usuário (mesma categoria do "Princípio do produto" já removido na Fase 9a); "Melhor campeão" só mostrava o nome, sem ícone; `severity`/`confidence` apareciam crus em inglês (`"high"`); (2) inputs numéricos (pick order manual, "Personalizado" em Configurações) ainda tinham as setinhas nativas do navegador; (3) Evolução repetia "Estável" em quase toda linha; (4) alguns campeões apareciam sem ícone (imagem quebrada/"?").

**Achado real por trás do item 3** (não só copy): `computeWeaknessTrends` (`packages/core/src/aggregation/growth-journey.ts`) força `trend = "stable"` sempre que ainda não existe um segundo bloco de partidas antigas suficiente pra comparar (`insufficientData`) - com Zekerus#117 só tendo ~8 partidas pós-game analisadas (um bloco só), **toda** linha caía nesse caso. "Estável" ali não significava "sem mudança", significava "ainda não dá pra saber" - e a barra "Anterior: 0%" reforçava a confusão mostrando 0% como se fosse dado real.

**Achado real por trás do item 4**: `champion-row` do Perfil e os cards do Champion Select montavam a URL do ícone com `champion.championName`/`recommendation.championName` — string **crua** vinda direto do Match-V5 da Riot (`packages/riot/src/mappers/match-mapper.ts`, `participant.championName`, sem normalização nenhuma), que nem sempre bate com o slug que a Data Dragon espera na URL da imagem. O resto do app (Pós-game, Pré-game, seletor de inimigo) já usava o slug real vindo do catálogo (`fetchAllChampions`) e por isso nunca quebrava.

1. **`WeaknessTrend.hasComparison: boolean`** (novo campo, `packages/core/src/types/domain.ts` + `growth-journey.ts`) - `!insufficientData`, exposto pela primeira vez (a variável já existia internamente). `GrowthJourneyScreen.tsx`: quando `false`, não usa mais `TrendCell` (sempre diria "Estável") - mostra "Ainda sem histórico pra comparar" (ícone neutro) e só a barra "Recente" (esconde a barra "Anterior", que seria 0% falso). Sem migração/rota nova - o campo novo flui pela resposta JSON já existente de `GET /players/:puuid/growth-journey` sem revalidação zod.
2. **Novo componente `apps/desktop/src/renderer/src/features/ChampionIcon.tsx`** - substitui todo `<img src={championSquareUrl(...)}>` de campeão (não item) no app, com 3 estágios de fallback que nunca mostram o ícone nativo de imagem quebrada: (1) Data Dragon pelo **slug real** (passado direto quando quem chama já tem o catálogo - Pós-game/Pré-game/seletor de inimigo -, ou resolvido pelo `championId` numérico via um `Map` construído de `fetchAllChampions`, com cache module-level, quando só há `championId`/`championName` cru - Perfil/Champion Select/Dashboard); (2) **Community Dragon** (`raw.communitydragon.org`, espelho público dos assets da Riot indexado só por ID numérico, usado com a liberdade que o usuário deu de usar outras fontes) via `onError`; (3) placeholder estilizado (círculo + ícone `HelpCircle`) se as duas fontes falharem. `ChampionSkinPicker.tsx` (splash art, asset diferente) ganhou só um `onError` simples caindo pro ícone confiável do campeão, sem Community Dragon (não faz sentido pra esse tipo de asset).
3. **Dashboard** (`App.tsx`) - card "Escopo" virou **"Ponto forte"** (espelha "Risco atual", usa `profile.data.strengths[0]`, nunca mostrado ali antes); `severity`/`confidence` traduzidos (`severityLabels`/`confidenceLabels`, baixa/média/alta); `trendLabels.stable` reescrito de "estável" pra "sem variação recente"; "Melhor campeão" ganhou `ChampionIcon`. `Metric` ganhou prop `icon?: ReactNode` (mesmo padrão de `badge`, já existente).
4. **CSS global** - `input[type="number"]` perde as setinhas nativas (`appearance: textfield` + `::-webkit-*-spin-button { appearance: none }`), cobre os 2 inputs numéricos do app (pick order manual, "Personalizado" em Configurações) sem tocar nenhum componente.

Validado via `electron-vite dev` (HMR aplicou as mudanças na mesma janela Electron real que já estava aberta pro usuário avaliar) + Browser tool contra a conta real Zekerus#117: ícones de campeão renderizando (Thresh/Poppy/etc. via `ChampionIcon`, sem mais depender do nome cru), "Ponto forte"/"Risco atual" com texto traduzido, "sem variação recente" no lugar de "estável", inputs sem seta em Champion Select e Configurações, Evolução mostrando "Ainda sem histórico pra comparar" (situação real de Zekerus#117 hoje) em vez do falso "Estável"/"Anterior: 0%". Nenhum erro de console. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo.

**Fora de escopo** (confirmado pelo que o usuário pediu em texto, mesmo aparecendo nas capturas de referência): gráfico de LP/rank estilo op.gg/Porofessor (Sparta não tem integração League-V4, seria fase nova); erro 403 ao baixar a skin Zed visto numa captura anterior (bug separado de CDN, não relacionado); radar chart/matchup detalhado estilo Porofessor (mesma decisão de não introduzir lib de gráfico da Fase 8b/9).

### Bug real corrigido: preload nunca carregava de verdade (window.sparta sempre indefinido)

O usuário pediu pra validar a Fase 9b "no Electron empacotando de verdade, não só no browser" — todas as validações anteriores deste projeto (Fases 6a/6c e as anteriores) usaram a Browser tool apontando pra mesma URL do dev server (`http://localhost:5173`) que o Electron carrega, mas isso é uma aba de Chrome comum, **sem** o preload script injetado (`window.sparta` sempre fica `undefined` ali, mesmo que o app real funcione). Nunca uma sessão anterior tinha de fato inspecionado o processo Electron real.

Pra validar de verdade, esta sessão conectou ao processo Electron real via Chrome DevTools Protocol (`app.commandLine.appendSwitch("remote-debugging-port", "9222")`, temporário, revertido antes do commit) e confirmou, por inspeção direta do `window` da janela real: **`window.sparta` sempre foi `undefined`, em toda sessão anterior deste projeto** - o bridge de IPC nunca funcionou de verdade, apesar de "validado" em texto nas Fases 6a/6c.

Causa raiz (duas camadas, achadas em sequência via console do processo real):

1. `apps/desktop/src/main/index.ts` apontava o preload pra `../preload/index.js`, mas `apps/desktop/package.json` tem `"type": "module"` - o electron-vite builda o preload como ESM e sempre gerou `index.mjs` (nunca `.js`), então o preload nunca era encontrado (`ENOENT`, erro real visto no console do processo real, nunca nos nossos testes porque browser comum não reporta erro de preload nenhum).
2. Corrigido o caminho pra `.mjs`, um segundo erro real apareceu: `SyntaxError: Cannot use import statement outside a module` - processos renderer sandboxed (`--enable-sandbox`, padrão do Electron desde varias versões) carregam o preload por um loader que **não entende `import`/ESM**, mesmo com a extensão certa.

Correção final (`apps/desktop/electron.vite.config.ts` + `apps/desktop/src/main/index.ts`): forçar o build do preload pra CommonJS de verdade via `rollupOptions.output.format: "cjs"` + `entryFileNames: "[name].cjs"` (extensão `.cjs` ignora o `"type":"module"` do `package.json`, ao contrário de `.js`), e apontar `webPreferences.preload` pra `../preload/index.cjs`. Sem essa extensão o Node ainda tentaria interpretar o arquivo como ESM independente do conteúdo.

**Impacto real**: todo recurso que depende de `window.sparta` nunca funcionou em nenhuma sessão anterior - detecção automática de champion select (`onGameflowPhase`, Fase 6c parcial), ordem de pick automática via LCU (`onPickOrder`, Fase 6c), e download de skin pro disco (`downloadSkin`, Sub-fase 6a). Os itens "não validado nesta sessão" registrados nas Fases 6a/6c sobre esses recursos eram, na verdade, "nem _podia_ ter sido validado do jeito que a validação foi feita" - o bug estava presente o tempo todo.

Validado via CDP contra o processo Electron real (não a Browser tool): `window.sparta` agora existe com todos os métodos esperados (`onGameflowPhase`/`downloadSkin`/`onPickOrder`); screenshots reais (`Page.captureScreenshot` via CDP) confirmando Dashboard/Perfil/Pós-game/Evolução (Fase 9) renderizando corretamente dentro da janela Electron de verdade, com a conta real Zekerus#117 (mesmo token de sessão assinado de sempre). `pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo.

**Não coberto por esta correção** (fora de escopo, registrado como trabalho futuro): validar de fato a detecção automática de champion select / ordem de pick / download de skin _funcionando_ agora que o bridge existe - precisa do cliente do League aberto (gameflow/pick order) ou de clicar o botão de baixar skin de verdade (download), nenhum dos dois testado nesta sessão. O bridge existir é a pré-condição pra esses recursos funcionarem; ainda não foi confirmado que o comportamento _downstream_ de cada um está correto agora que ele deixou de ser sempre `undefined`.

### Bug real corrigido: card de skin com nome/botão sobrepostos

Durante a validação contra a conta real Zekerus#117 (sessão anterior), o passo 2 do seletor de skin (`ChampionSkinPicker.tsx`) mostrou o nome da skin e o botão "Baixar" sobrepostos um em cima do outro. Causa: o card reusava a classe `.theme-picker-option` (criada só pro grid de ícones do passo 1/seletor de time inimigo, com `line-height: 0`) — isso colapsava as linhas de texto. Corrigido com uma classe própria `.skin-picker-card` (flex column, espaçamento normal), sem afetar os outros usos de `.theme-picker-option`.

### Sub-fase 9a: componentes visuais compartilhados + Dashboard + Champion Select (sessão atual)

A mesma validação real expôs um segundo problema, de UX: as telas de recomendação/análise eram só texto corrido, sem gráfico nem hierarquia visual (comparado a apps reais de LoL como op.gg/Mobalytics/Blitz, referências trazidas pelo usuário). Também pediu pra remover o card "Princípio do produto" do Dashboard (soava como disclaimer de produto).

**Achado-chave**: todo o dado numérico necessário pra virar gráfico/barra já existia e era real - não precisou de nenhuma rota nova nem cálculo novo no backend. `PickRecommendation.metrics` (já 0-100, calculado por `recommendPicks`), `scoreChampionPerformance(stats).components` (idem, já exportada), e os limiares de cor (`SCORE_STRENGTH_THRESHOLD=65`/`SCORE_WEAKNESS_THRESHOLD=35`/`RATIO_STRENGTH_THRESHOLD=1.1`/`RATIO_WEAKNESS_THRESHOLD=0.85`, já exportados de `dimension-signals.ts`) só nunca tinham sido visualizados além de um número solto.

**Decisão de design**: os badges mostram um número colorido (verde/âmbar/vermelho), não uma letra de tier (S/A/B/C como no op.gg) - o op.gg calibra essas letras contra percentil real de milhões de partidas, e o Sparta não tem essa base estatística (mesma ressalva de `docs/scoring-model.md`, Fase 7). Um número colorido comunica "bom/neutro/ruim" sem fingir uma precisão que o dado não sustenta.

1. **Novos componentes `apps/desktop/src/renderer/src/features/`**: `ScoreBadge.tsx` (anel via CSS `conic-gradient` puro, sem lib de gráfico, mostrando um score 0-100 colorido pelos limiares de `SCORE_STRENGTH_THRESHOLD`/`SCORE_WEAKNESS_THRESHOLD`); `StatBar.tsx` (barra horizontal, variantes `score` 0-100 e `ratio` centrada em 1.0, cores pelos mesmos limiares ou pelos de `RATIO_STRENGTH_THRESHOLD`/`RATIO_WEAKNESS_THRESHOLD`); `SignalChip.tsx` (pill com ícone lucide-react, `positive`/`negative`, substitui os parágrafos com prefixo emoji ✓/⚠ usados até a Fase 8). Novo token `--color-yellow` em `global.css` pra faixa neutra.
2. **Dashboard** (`App.tsx`, função `Dashboard`) — removido o card "Princípio do produto"; cards "Forma 10 jogos"/"Melhor campeão" ganharam `ScoreBadge`.
3. **Champion Select** (`App.tsx`, cards de `recommendation-list`) — `ScoreBadge` no lugar do `totalScore` solto; `StatBar` pros 4 componentes de `metrics` com maior valor (ordenados, não os 8 sempre); `reasons`/`warnings` viram uma lista de `SignalChip` (mostra todos agora, não só o primeiro).

Validado manualmente via `electron-vite dev` + Browser tool contra a conta real Zekerus#117 (mesmo método de token de sessão assinado das sessões anteriores): badges com cor/valor reais no Dashboard (64 e 52, ambos amarelo/neutro); card de recomendação real do Viego (JUNGLE, testado com o papel trocado temporariamente já que Zekerus não tem amostra de MID - revertido antes do commit) mostrando `ScoreBadge` 53, 4 `StatBar` reais (Forma recente 64.4%, Desempenho pessoal 52.3%, Matchup 50%, Segurança em blind 50%) e 3 `SignalChip` (1 positivo, 2 negativos), todos verificados via inspeção do DOM real. Nenhum erro de console.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo. Sem migração, sem rota nova no backend - mudança inteira em `apps/desktop` (renderer).

### Sub-fase 9b: Perfil + Pós-game + Evolução (sessão atual, encerra a Fase 9)

Continuação direta da 9a — mesmos componentes (`ScoreBadge`/`StatBar`/`SignalChip`), aplicados às 3 telas restantes.

1. **Perfil** (`App.tsx`, função `Profile`) — cada linha de campeão (`champion-row`) ganhou `ScoreBadge` (só quando `scoreChampionPerformance(champion).eligible`, ou seja `games >= MIN_GAMES_FOR_RANKING` - campeões com poucas partidas não mostram badge, mesma regra de elegibilidade já usada por `rankChampionPool`) e `StatBar` pra KDA/CS/min/Dano-min (`performance.components`, já 0-100, mesma função por trás do Dashboard). "Pontos fortes e fracos" virou uma lista de `SignalChip` (antes parágrafos com prefixo ✓/⚠).
2. **Pós-game** (`features/PostGameScreen.tsx`) — `expectedPlan`/`executionSummary` ganharam `StatBar` variante `ratio` pra KDA/CS/dano/visão/ouro, calculadas no cliente a partir de `report.metrics` (já em `PostGameAnalysis`) ÷ `roleBaselines[role]` (`role` vem do `RecentChampionMatch` já carregado na lista de partidas, casado por `matchId`) — mesmo padrão client-side já usado pelo motor de build/Pré-game (Fase 8), sem rota nova. `strengths`/`weaknesses` viraram `SignalChip` (`tips` continuam parágrafo com 💡, são só sugestões de texto livre, não sinais de força/fraqueza).
3. **Evolução** (`features/GrowthJourneyScreen.tsx`) — cada linha de tendência ganhou duas `StatBar` (recentRate/previousRate) ao lado do `TrendCell` já existente (Fase 8b).
4. **Novo prop `invert` em `StatBar.tsx`** (variante `score` apenas) — necessário pra Evolução: `recentRate`/`previousRate` são "taxa de presença de um ponto fraco", onde número **alto é ruim** (o oposto de `PickRecommendation.metrics`/`scoreChampionPerformance.components`, onde alto é bom). `invert` mantém a largura da barra = valor real (não inverte o número exibido), só troca o lado da cor (verde quando `<=SCORE_WEAKNESS_THRESHOLD`, vermelho quando `>=SCORE_STRENGTH_THRESHOLD`) - evita inventar uma terceira variante só pra isso.

**Bug real encontrado e corrigido durante a validação desta sessão**: o número dentro de `ScoreBadge` (`<span>{score}</span>`) renderizava nas cores erradas (vermelho no Dashboard/Champion Select, cinza-secundário no Perfil) em vez de branco (`--color-text-primary`, definido em `.score-badge`) - existia desde a 9a, só não tinha sido percebido porque nas capturas anteriores o número era pequeno demais pra notar a cor errada num badge colorido. Causa: regras genéricas antigas e mais específicas na ordem do arquivo (`.page-header span, .recommendation span, .metric span { color: var(--color-red); }` e `.champion-row span { color: var(--color-text-secondary); }`) casam com **qualquer** `span` descendente, inclusive o de dentro do `ScoreBadge` nested profundamente - como `.score-badge span` (que só definia `position: relative`, sem `color`) tinha a mesma especificidade e vinha depois no arquivo mas não competia na propriedade `color`, a regra genérica vencia. Corrigido adicionando `color: var(--color-text-primary)` explicitamente em `.score-badge span` (`global.css`) - mesma especificidade, mas agora com a propriedade declarada, vence por ordem.

Validado manualmente via `electron-vite dev` + Browser tool contra a conta real Zekerus#117 (mesmo método de token de sessão assinado das sessões anteriores): Perfil com badges reais (Viego 52, Vel'Koz 46, ambos amarelo/neutro) e barras KDA/CS/Dano por campeão, chips de força/fraqueza reais (3 positivos, 3 negativos); Pós-game com barras ratio reais pra uma derrota de Vel'Koz SUPPORT (CS/Dano/Ouro acima da referência em verde, Visão abaixo em vermelho, KDA neutro em amarelo) e chips de força/fraqueza; Evolução com barras recente/anterior reais (KDA 62.5% recente em amarelo, Controle de visão 25% em verde, Anterior 0% em todas - ainda sem um segundo bloco de partidas mais antigas, comportamento honesto já documentado na Fase 5). Bug do `ScoreBadge` confirmado via inspeção de `getComputedStyle` antes/depois do fix (cor mudou de `rgb(220,38,38)`/`rgb(161,161,170)` pra `rgb(245,245,246)`).

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo. Sem migração, sem rota nova no backend - mudança inteira em `apps/desktop` (renderer), encerrando a Fase 9.

### Sub-fase 8b: polimento visual do desktop

Continuação direta da 8a — mesmo pedido original do usuário (validar telas estáticas/sem animação e polir onde fizesse falta), sem mudança de arquitetura, só CSS/ícones/pequenos componentes novos.

1. **Componente `features/Loading.tsx`** (`<Loading label="..." />`, spinner CSS puro via `@keyframes spin`) substituindo todo `<p>Carregando...</p>` solto que existia em `App.tsx`, `PostGameScreen.tsx`, `GrowthJourneyScreen.tsx`, `SettingsScreen.tsx` — antes cada tela reimplementava o próprio texto de loading, sem nenhum indicador visual de progresso.
2. **Novo `features/GridSkeleton.tsx`** (shimmer via `@keyframes shimmer`) substituindo o texto "Carregando campeões/skins..." nos grids de `ChampionGridPicker.tsx`/`ChampionSkinPicker.tsx` — grid deixa de ficar vazio enquanto carrega.
3. **Pré-game enriquecido** (`App.tsx`, função `PreGame`) — passou a receber `draft`/`ddragonVersion` como props (antes não recebia nenhum). Mostra o ícone do campeão confirmado (`draft.selectedChampionId`) com fundo de splash art (`hero-splash`, mesmo padrão já usado no Dashboard), os ícones dos inimigos conhecidos (`draft.enemies`) e um resumo textual da inclinação de dano do time inimigo, reaproveitando `summarizeEnemyDamageLean` (exportada de `@sparta/core` desde a 8a) — a mesma função usada pelo motor de build, evitando duplicar a lógica. **Sem tocar a rota `/drafts/pre-game-analysis`** (naquele momento ainda estática no backend; virou real na Etapa 7) — só a apresentação do lado do desktop ficou real, usando dado já disponível no cliente.
4. **Ícones de campeão na lista do Pós-game** (`PostGameScreen.tsx`) — ganhou prop `ddragonVersion`, resolve `championId → nome/ícone` reaproveitando `fetchAllChampions` (já buscado pra outras telas), fechando o gap documentado no CLAUDE.md ("Catálogo de campeões pro desktop", já que `RecentChampionMatch` nunca trouxe `championName`).
5. **Ícones e cor de tendência em Evolução** (`GrowthJourneyScreen.tsx`) — novo `TrendCell`, ícone `TrendingUp`/`TrendingDown`/`Minus` (lucide-react, já instalado) + nova cor semântica `--color-green` (só pra tendência — a cor de destaque do tema continua fixa em vermelho, decisão inalterada). `improving`/`resolved` tratados como boa notícia (verde), `worsening`/`new` como má notícia (vermelho).
6. **Ajustes de CSS pequenos** encontrados na auditoria: `.draft-controls button.active` não tinha nenhum estilo distinto do hover (usado em Configurações/Análise) — corrigido.

Validado manualmente via `electron-vite dev` + Browser tool (sem conta Riot vinculada, mesma limitação de sempre neste ambiente): Pré-game testado com `draft.selectedChampionId`/`draft.enemies` seedados temporariamente (revertido antes do commit) — ícone/splash de Ahri + ícones de Darius/Garen/Jax + resumo "Time inimigo com foco físico (méd. 7.7/10 vs 3/10 mágico)" renderizando corretamente; grid de ~170 campeões com skeleton; nenhuma tela quebrou sem conta vinculada (fallbacks continuam funcionando). Pós-game/Evolução com dado real de conta não puderam ser validados nesta sessão (sem conta Riot linkada no ambiente), mas typecheck/lint/build passaram e a lógica é direta reutilização de padrões já testados.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo. Sem migração, sem rota nova no backend — mudança inteira em `apps/desktop` (renderer).

### Sub-fase 8a: motor de recomendação de build + seletor de time inimigo

O usuário pediu duas coisas: validar se o desktop tinha telas estáticas/sem animação (ver Sub-fase 8b, ainda pendente) e implementar uma "sessão de build" (itens) acionada depois que o usuário confirma seu campeão no Champion Select, baseada no time inimigo e no campeão escolhido.

**Achado-chave que definiu o desenho**: a tabela curada `ChampionTag` (usada pelo `recommendation-engine.ts`) só tem 2 campeões seedados (Orianna, Ahri) — insuficiente pra um motor de build que precisa reconhecer qualquer campeão do time inimigo. Em vez de esperar curadoria manual, o motor usa `tags`/`info` (attack/defense/magic/difficulty) que a própria Data Dragon já publica por campeão em `champion.json` — dado real da Riot, cobre os ~170 campeões, mesmo padrão client-side já usado por `fetchAllChampions` (Fase 6a).

1. **Novos tipos em `packages/core/src/types/domain.ts`**: `ChampionClassProfile` (championId/championName/tags/attack/defense/magic/difficulty — direto da Data Dragon), `ItemSummary` (itemId/name/tags/goldTotal/depth?/into? — direto do `item.json`), `RecommendedItem` (itemId/name/reason), `BuildRecommendation` (boots/coreItems/situationalItems/reasons/warnings, reusando `RecommendationReason`).
2. **Novo motor puro `packages/core/src/draft/build-recommendation.ts`** — `recommendBuild(ownChampion, enemyChampions, items)`. `deriveDamageStyle` classifica o estilo de dano do próprio campeão pelas tags de classe da Data Dragon (Mage→AP, Marksman/Fighter/Assassin→AD, desempate por `attack` vs `magic` pra tags híbridas ou só Tank/Support). `summarizeEnemyDamageLean` (exportada, pra reuso futuro no Pré-game da 8b) resume a inclinação do time inimigo pela média de `info.magic`/`info.attack` dos inimigos conhecidos, com threshold nomeado (`DEFENSE_LEAN_THRESHOLD=1.5`) — `undefined` sem nenhum inimigo ainda selecionado, nunca chuta. Seleção de botas/itens core/situacionais é 100% filtro sobre tags reais do `item.json` (nunca id memorizado) — descoberta real durante a implementação: a tag `"AbilityHaste"` não pode ser usada como sinal de "item de dano mágico" porque itens claramente defensivos (ex. Spirit Visage) também a carregam; o motor usa só `SpellDamage`/`MagicPenetration` pra itens AP. Funciona com time inimigo parcial (não exige os 5) e sem `ownChampion`/inimigos, sempre com warnings honestos em vez de inventar recomendação. 14 testes novos (`build-recommendation.test.ts`).
3. **`datadragon.ts` do desktop** ganhou `fetchChampionClassProfiles` (estende a leitura do `champion.json` já usada por `fetchAllChampions` pra também extrair `tags`/`info`), `fetchItemCatalog` (novo fetch de `item.json`, filtrado a itens compráveis de Summoner's Rift) e `itemIconUrl` — mesmo padrão client-side sem rota nova no backend Sparta da Fase 6a; `packages/riot/src/datadragon/client.ts` (uso do backend) ficou intocado, mesma decisão daquela fase.
4. **Novo `features/ChampionGridPicker.tsx`** — grid de busca+seleção de campeão extraído do passo 1 do `ChampionSkinPicker.tsx` (Fase 6a) pra ser reaproveitado; "selecionar" é genérico (o chamador decide o que o clique significa), então serve tanto pra navegar pro passo de skins quanto pra alternar um campeão num array de até 5.
5. **Seletor real de time inimigo no Champion Select** (`App.tsx`) — substitui o antigo botão-demo "Alternar inimigo revelado" (que hardcodava Yasuo) por uma seção "Time inimigo" usando `ChampionGridPicker` em modo multi-seleção (até 5, `MAX_ENEMIES`), escrevendo direto em `draft.enemies`.
6. **Botão "Confirmar campeão" + painel de build inline** — cada card de recomendação ganhou um botão que seta `draft.selectedChampionId` (campo já existia no domínio/schema/zod desde o início do projeto, nunca lido nem escrito por nenhum código até agora) e um estado local `confirmedChampion`. Confirmado com o usuário (`AskUserQuestion`): o painel de build aparece **inline, expandido dentro do próprio Champion Select** (não uma aba nova na sidebar) — `<BuildPanel>` busca catálogo de itens + perfis de classe via os novos helpers de `datadragon.ts` e chama `recommendBuild` direto no client (mesmo padrão de `rankChampionPool`, já importado assim em `App.tsx`), renderizando botas/itens core/situacionais com ícone real (`itemIconUrl`) + reasons/warnings.

Validado manualmente via `electron-vite dev` + Browser tool: grid de ~170 campeões reais funcionando no seletor de time inimigo, contador `(N/5)` correto, build sugerida mudando ao vivo conforme o time inimigo selecionado (testado Ahri contra time AD-heavy → botas de armadura + itens situacionais de armadura; contra time sem inimigos → aviso honesto "sem dado" + build core só pelo próprio campeão) — validação feita com `confirmedChampion` seedado temporariamente durante o teste (revertido antes do commit, já que não havia conta Riot real disponível neste ambiente pra gerar uma recomendação de verdade a confirmar).

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo. Sem migração de banco, sem rota nova no backend — mudança inteira em `packages/core` (lógica pura) e `apps/desktop` (renderer).

O que ficou deliberadamente fora de escopo (ver Sub-fase 8b, ainda pendente, e "Fora de escopo" no plano):

- Polimento visual do resto do app (Pré-game enriquecido, ícones no Pós-game/Evolução, loading compartilhado) — Sub-fase 8b, próxima.
- Recalibrar `ChampionTag` pra mais campeões — não é bloqueio, o motor de build usa dado universal da Data Dragon em vez disso.
- Persistir a build recomendada ou a confirmação de campeão no backend — painel local à sessão do Champion Select, sem nova tabela/rota.

### Fase 7: auditoria e documentação dos algoritmos de scoring

O usuário pediu uma "revisão dos algoritmos de avaliação de desempenho". Auditoria completa (`champion-performance.ts`, `dimension-signals.ts`, `player-insights.ts`, `growth-journey.ts`, `recommendation-engine.ts`, `docs/scoring-model.md`, `docs/draft-recommendation.md`) confirmou com o usuário que **não há dado real suficiente pra recalibrar estatisticamente** (só ~20-25 partidas da conta Zekerus#117) — escopo aprovado foi **auditar, documentar e corrigir inconsistências reais, sem recalibrar nenhum peso/baseline/threshold que já funciona**.

Duas inconsistências reais corrigidas (únicas mudanças de comportamento desta fase):

1. **`DEATHS_BAD_VALUE` (7 vs 8)**: o "valor ruim" de mortes usado em `normalizeInverse` era `7` em três lugares (`champion-performance.ts`, `player-insights.ts`, `post-game-analysis.ts`) mas `8` num quarto (`calculateRecentForm`, dentro do próprio `champion-performance.ts`), sem motivo pra divergir. Nova constante exportada `DEATHS_BAD_VALUE = 7` (`packages/core/src/scoring/champion-performance.ts`), reusada nos 4 call sites.
2. **Literal `8` duplicado em `recommendation-engine.ts`**: o threshold de "amostra pequena" em `buildWarnings` (`stats.games < 8`) era um número solto independente de `confidenceFromGames`, que já define esse mesmo `8` como piso de confiança média. Passou a reusar a constante exportada `MEDIUM_CONFIDENCE_GAMES`.

Fora essas duas correções, o resto da fase foi **só documentação** (comentários de raciocínio de design em `champion-performance.ts`, `dimension-signals.ts`, `player-insights.ts` e `recommendation-engine.ts` — thresholds, pesos por role/cenário, baselines, decaimento de forma recente, etc. — todos com o "porquê" agora explícito, não só o "o quê") e **reescrita de `docs/scoring-model.md`/`docs/draft-recommendation.md`** (antes prosa qualitativa sem nenhum número; agora documentam os valores reais e o raciocínio, com uma nota explícita de que são julgamento de design, não calibração estatística).

Testes novos de invariante estrutural (não recalibração): pesos de `weights` (`champion-performance.ts`) somam 1.0 por role; `recencyWeight(8) ≈ 1/e`; `DEATHS_BAD_VALUE` usado de forma consistente entre `scoreChampionPerformance` e `calculateRecentForm`; as 3 tabelas de `selectWeights` (`recommendation-engine.ts`) somam 1.0 cada. `weights` e `selectWeights` passaram a ser exportados (antes privados) pra permitir esses testes sem duplicar as tabelas.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo — sem mudança de comportamento observável do produto além das duas correções acima (nenhuma migração, nenhuma mudança de rota).

O que ficou deliberadamente fora de escopo (confirmado com o usuário antes de implementar):

- Recalibrar qualquer peso, baseline ou threshold com base em dado estatístico — não há partidas reais suficientes acumuladas ainda.
- Construir ferramenta de validação/relatório contra o histórico real — ideia registrada pro futuro, quando houver mais dado de uso.

### Sub-fase 6c: ordem de pick automática via LCU

Substitui o input manual 1-5 de "Pick order" no Champion Select por detecção automática via LCU (League Client Update), quando o cliente real do League está aberto e em champion select — o usuário pediu isso explicitamente ("não faria tanto sentido" ficar trocando manualmente).

1. **`packages/riot/src/lcu/read-only-client.ts`**: `LcuChampionSelectSnapshot.actions`/`myTeam`/`theirTeam` deixaram de ser `unknown[]` — novos tipos `LcuChampSelectAction { actorCellId, type, completed }` (`actions` vira `LcuChampSelectAction[][]`, uma lista de rodadas) e `LcuChampSelectTeamMember { cellId, championId, assignedPosition? }`.
2. **Novo `packages/riot/src/lcu/pick-order.ts`**: `derivePickOrder(snapshot)` pura — conta quantas ações `pick` já `completed` de companheiros de time (`myTeam`, por `cellId`) aconteceram antes da própria ação de pick do jogador, soma 1 (1-based; combina com `DraftState.pickOrder<=1` já significar "blind pick" no `recommendation-engine.ts`). Retorna `undefined` quando a sessão ainda não tem `localPlayerCellId`/`actions`/`myTeam` disponíveis ou a própria ação ainda não apareceu — o chamador cai pro manual nesses casos, nunca chuta um valor. Não validado contra filas fora do draft ranqueado normal (comentário no código). 7 testes cobrindo blind pick, contagem só de picks `completed` de companheiros, ignorar bans, e trocas de campeão não afetarem a contagem.
3. **`apps/desktop/src/main/index.ts`**: `startGameflowWatcher()` estendido — no mesmo poll de 2500ms, quando a fase é `"ChampSelect"`, busca `getChampionSelectSession()` + `derivePickOrder`, só propaga por IPC (`sparta:pick-order`) quando o valor muda; trata `derivePickOrder` retornando `undefined` (sessão piscando) como "mantém o último valor conhecido" em vez de resetar pro manual à toa; ao sair de `ChampSelect`, reseta para `null`.
4. **`preload/index.ts`/`sparta-global.d.ts`**: `window.sparta.onPickOrder(callback)`, mesmo padrão de `onGameflowPhase`.
5. **`App.tsx`**: novo estado `autoPickOrder` (assina `onPickOrder`, sincroniza em `draft.pickOrder` quando não-null). `ChampionSelect` mostra o valor automático como texto somente-leitura quando disponível ("Detectado via League Client"); sem sessão real (dev, sem League aberto, browser comum), mantém o input manual de sempre ("Modo manual") — fallback nunca removido.

**Não validado nesta sessão**: a detecção automática de verdade dentro de uma sessão real de champion select — precisa do cliente do League aberto e em champion select, indisponível neste ambiente. Validado o que dava pra validar: o fallback manual continua funcionando sem regressão (testado via `electron-vite dev` + Browser tool, `window.sparta` inexistente numa aba de navegador comum reproduz honestamente o caso "sem LCU", e o modo manual respondeu normalmente).

### Sub-fase 6b: configuração "quantas partidas analisar" + bug real de CORS corrigido

Nova configuração pessoal: quantas das últimas partidas do jogador o Sparta deve considerar nas análises (últimas 20/50/100, ou um valor personalizado até 200) — diferente do `limit` de `/players/:puuid/recent-matches` (que é só quantas partidas _listar_ na UI, não quantas _analisar_).

1. **Migração `PlayerProfile.matchAnalysisLimit Int @default(50)`**.
2. **`findParticipationHistory`** (`matches/match-repository.ts`) e **`findPostgameReportsByPuuid`** (`postgame/postgame-repository.ts`) ganharam parâmetro opcional `limit?: number` (`take` do Prisma em cima do `orderBy: desc` já existente) — sem `limit`, comportamento inalterado.
3. **`player-stats-repository.ts`** ganhou `findMatchAnalysisLimitByPuuid`/`setMatchAnalysisLimit` (default 50, mesmo padrão honesto-neutro de `findPlayerInsightsByPuuid`). `recomputeChampionStats`/`computeAndPersistPlayerInsights` passaram a aceitar o limite e repassar pra `findParticipationHistory` — `riot-sync-service.ts` resolve o limite salvo do jogador e passa pros dois **só no momento do sync** (mesma lógica de sempre: essas tabelas só recalculam no sync, nunca ao vivo a cada GET).
4. **`GET /players/:puuid/growth-journey`** passou a resolver e repassar o limite pra `findPostgameReportsByPuuid` (computado ao vivo a cada chamada, já era assim).
5. **Novas rotas autenticadas `GET`/`PUT /players/settings`** — `PUT` valida `[1,200]` via zod e dispara `syncPlayerMatches` na hora (pra não deixar o usuário esperando o próximo sync espontâneo); a chamada de sync é `try/catch` — se falhar (rate limit, chave da Riot expirada), a configuração já salva não é desfeita e a rota ainda retorna sucesso (achado real durante a validação: a primeira versão deixava a falha do sync derrubar a resposta inteira mesmo com o valor já persistido).
6. **`SettingsScreen.tsx`** ganhou a seção "Análise" (atalhos 20/50/100 + campo personalizado clampado no cliente também).

**Bug real de CORS encontrado e corrigido durante a validação manual**: `@fastify/cors` (`apps/api/src/app.ts`) usa `methods: "GET,HEAD,POST"` como default quando a opção não é configurada explicitamente — `PUT` nunca esteve liberado no preflight, só ninguém tinha notado porque nenhuma rota usava `PUT` antes desta sub-fase. O preflight `OPTIONS` retornava 204 normalmente, mas o navegador bloqueava a requisição `PUT` de verdade antes de sair (erro genérico "Failed to fetch", sem mensagem clara), com o backend nunca chegando a receber a chamada. Corrigido adicionando `methods: ["GET", "HEAD", "POST", "PUT"]` explicitamente no registro do `cors`.

Validado manualmente contra a API real (Docker, imagem reconstruída) e a conta Zekerus#117 via `electron-vite dev` + Browser tool: `GET`/`PUT /players/settings` funcionando pela UI de verdade (não só via curl), persistência confirmada, `growth-journey` continuando a funcionar com o limite aplicado.

### Sub-fase 6a: tela de Configurações + tema com campeão/skin real

O seletor de tema visual era uma lista fixa de 12 campeões curados manualmente (`FEATURED_CHAMPIONS`), 1 skin cada, sem nenhuma UI de escolha de skin, morando na sidebar. O usuário pediu: mover isso pra uma tela de Configurações dedicada, deixar escolher **qualquer** campeão e **qualquer** skin dele, e permitir "baixar" a skin (salvar no disco, funcionar offline).

**Achado importante**: não precisou de nenhuma rota nova no backend Sparta. A lista completa de campeões e a lista de skins por campeão vêm direto da CDN pública da Data Dragon (mesmo padrão que `championSquareUrl`/`championSplashUrl` já usavam) — `packages/riot/src/datadragon/client.ts` (uso do backend, Fase 1) ficou intocado.

1. **`apps/desktop/src/renderer/src/features/datadragon.ts`** ganhou `fetchAllChampions(version)` e `fetchChampionSkins(championKey, version)`. **Bug real encontrado e corrigido durante a validação manual**: a Data Dragon inverte os nomes dos campos no `champion.json` — `id` é a string usada nas URLs (ex. `"Ahri"`), `key` é o id numérico como string (ex. `"103"`); a primeira versão do código tinha isso trocado, o que quebrava todos os ícones do grid (renderizavam URLs tipo `.../champion/266.png` em vez de `.../champion/Aatrox.png`). Corrigido e validado no navegador contra os ~170 campeões reais.
2. **Novo `features/ChampionSkinPicker.tsx`** — fluxo de 2 passos: grid com busca de todos os campeões → grid de skins do campeão escolhido (nomes reais, ex. "Ezreal de Nottingham", "Ezreal Gélido") → clicar numa skin aplica como tema, botão "Baixar" separado.
3. **`featured-champion-context.tsx`** reescrito — sem lista estática, `FeaturedChampionOption` ganhou `skinName`/`localSplashPath?`, persistido em `localStorage` como JSON (antes só a `key`). Call sites de splash art em `App.tsx` (login e Dashboard) preferem `localSplashPath` quando existir.
4. **Download real pro disco** — primeiro uso de IPC request/response no app (`ipcRenderer.invoke`/`ipcMain.handle`, diferente do padrão push-only já usado por `sparta:gameflow-phase`). `apps/desktop/src/main/index.ts` ganhou `registerSkinDownloadHandler()` (`sparta:download-skin`, escreve em `app.getPath("userData")/skins`); `preload/index.ts`/`sparta-global.d.ts` ganharam `window.sparta.downloadSkin(url, fileName)`.
5. **Novo `features/SettingsScreen.tsx`** + novo item de nav "Configurações" (`Page` ganhou `"settings"`). `ChampionThemePicker.tsx` (antigo, sidebar) removido.

Validado manualmente contra a API real e a conta Zekerus#117 via `electron-vite dev` + Browser tool: grid de ~170 campeões reais carregando (depois do fix do bug id/key), busca funcionando, troca de campeão→skin→aplicar tema confirmada (Dashboard passou a usar a splash art do Ezreal escolhido), persistência em `localStorage` no formato novo confirmada. **Não validado nesta sessão**: o download real pro disco (`window.sparta.downloadSkin`) — o bridge `window.sparta` só existe dentro do processo Electron real (via preload), não numa aba de navegador comum apontando pro dev server do Vite; o código foi revisado mas precisa de um teste dentro do app Electron empacotado/rodando de verdade.

### Desktop conectado às rotas reais (sessão anterior)

Desde a Fase 1, só autenticação e `POST /players/link-riot-account` usavam a API real no desktop — as 5 telas principais rodavam 100% em cima de `apps/desktop/src/renderer/src/features/mock-data.ts` (2 campeões hardcoded) ou texto estático, mesmo com todo o backend real já entregue nas Fases 1-5.

1. **`apps/desktop/src/renderer/src/features/api-client.ts`** ganhou `fetchPlayerProfile`, `fetchChampionPerformance`, `fetchRecentMatches`, `fetchGrowthJourney` (públicas, só precisam do `puuid`), `fetchDraftRecommendations`, `analyzePostgame`, `fetchPostgameReport` (autenticadas, resolvem a conta Riot no servidor - nunca recebem `puuid` do cliente). Nova classe `ApiError` (com `status`) substitui o `Error` genérico anterior, necessária pro fluxo de "GET primeiro, POST só se 404" do Pós-game.
2. **Novo hook `features/use-async-data.ts`** (`useAsyncData<T>(fn, deps)` → `{data, status, error}`) — evita repetir boilerplate de loading/erro em cada tela.
3. **`Dashboard`/`Profile`/`ChampionSelect`** (inline em `App.tsx`) trocaram dado mockado por `fetchPlayerProfile`/`fetchDraftRecommendations` reais. `Profile` agora também mostra `strengths`/`weaknesses` (reais desde a Fase 2, nunca renderizados no desktop até agora). `ChampionSelect` mostra um aviso leve quando não há conta Riot vinculada (o backend já degrada pra perfil neutro sozinho, nunca erro).
4. **Nova tela `features/PostGameScreen.tsx`** — lista as últimas partidas (`fetchRecentMatches`), ao clicar tenta `fetchPostgameReport` (GET) primeiro e só cai pra `analyzePostgame` (POST) em 404; botão "Reanalisar" chama o POST direto. Lista de partidas mostra só `Campeão #<id>` (sem ícone/nome) porque `RecentChampionMatch` não traz `championName` e não há catálogo de campeões exposto ao desktop hoje - resolver isso é trabalho novo, não coberto aqui.
5. **Nova tela `features/GrowthJourneyScreen.tsx`** — novo item de navegação "Evolução" (`Page` ganhou `"growth"`), mostra `weaknessTrends`/`matchesAnalyzed` reais da Fase 5.
6. **`mock-data.ts` removido** — nada mais o importava.

Validado manualmente contra a API real (Docker) e a conta Zekerus#117 via `electron-vite dev` + Browser tool: Dashboard/Perfil/Evolução com dado real, Champion Select gerando recomendações reais (lista vazia nesse teste específico - pool de `ChampionTag` ainda só tem 2 campeões curados, comportamento honesto esperado, não bug), Pós-game lendo relatório já persistido e reanalisando com sucesso.

O que ficou deliberadamente fora de escopo:

- **Catálogo de campeões pro desktop** (resolver `championId` → nome/ícone fora de `PlayerChampionStats`/`PickRecommendation`, que já trazem `championName`) — afeta só a lista de partidas do Pós-game hoje.
- **Fase de temas com skins** (pedida pelo usuário nesta sessão, pra depois) — ver desenho de alto nível abaixo.

### Fase 6 (Configurações do app) — encerrada (6a, 6b e 6c prontas)

Pedido do usuário, dividido em 3 sub-fases sequenciais (mesmo padrão de PR pequeno das Fases 1-5) porque tocavam áreas quase disjuntas do código:

- **6a**: tela de Configurações + tema com campeão/skin real + download pro disco.
- **6b**: configuração pessoal "quantas partidas o Sparta deve analisar" (+ bug real de CORS bloqueando `PUT` corrigido).
- **6c (ver acima)**: ordem de pick automática via LCU.
- Plano completo com a crítica de design em `C:\Users\jhona\.claude\plans\bright-drifting-melody.md` (se ainda existir na máquina).

### O que a Fase 5 entregou (Growth Journey)

"Growth Journey" era só um nome no roadmap — nenhuma especificação existia em lugar nenhum do repositório antes desta sessão (nem em `SPARTA_CODEX_INSTRUCTIONS.md`, nem em `docs/`, nem em `domain.ts`). O usuário definiu o escopo explicitamente nesta sessão: rastrear se os pontos fracos identificados pelo Post-Game Coach (Fase 4) estão melhorando ou piorando ao longo das partidas analisadas.

**Achado-chave**: não precisou de nenhuma tabela nova nem migração — primeira fase do projeto sem uma. Cada `PostgameReport.reportJson` (Fase 4) já é um `PostGameAnalysis` completo com `weaknesses: PlayerWeakness[]` de `code`/`label` estáveis; Growth Journey é 100% derivável do que já está persistido, comparando dois blocos de relatórios (mais recente vs anterior) exatamente como `computeRecentForm` já faz (Fase 2).

1. **Novo módulo puro `packages/core/src/aggregation/growth-journey.ts`** — `computeWeaknessTrends(reports)` calcula, por código de fraqueza, a taxa de presença no bloco de até 10 relatórios mais recentes (`recentRate`) vs no bloco de até 10 anteriores (`previousRate`), com `trend: "improving"|"worsening"|"stable"|"new"|"resolved"` (`"resolved"`/`"new"` quando o código sai/entra completamente de um bloco pro outro; `"improving"`/`"worsening"`/`"stable"` por diferença de taxa acima/abaixo de `RATE_TREND_THRESHOLD_POINTS=20`). Piso de `MIN_BLOCK_REPORTS=3` aplicado aos dois blocos (não só ao anterior, diferente de `computeRecentForm`) — com poucos relatórios, um bloco pequeno faz 1 partida oscilar a taxa em 50-100 pontos; sem os dois blocos atingindo o piso, todo código vira `"stable"`/`confidence:"low"`, nunca inventa direção. `computeGrowthJourney(reports)` é um wrapper fino que soma `matchesAnalyzed`. **Limitação documentada em comentário**: `weaknesses` de cada relatório já é um corte top-3 (Fase 4), então presença é "estava entre os 3 piores sinais daquela partida", não uma medida contínua — um código na fronteira do corte pode entrar/sair mesmo com a métrica quase parada.
2. **Novos tipos `WeaknessTrend`/`GrowthJourney`** em `packages/core/src/types/domain.ts`.
3. **Nova consulta `findPostgameReportsByPuuid(puuid)`** (`apps/api/src/modules/postgame/postgame-repository.ts`) — lê todos os `PostgameReport` do jogador via `Match.startedAt` decrescente, excluindo matches sem `startedAt` (nullable no schema; incluí-los deixaria o Postgres jogar nulls pra frente na ordenação desc, corrompendo a divisão dos blocos — guarda de anomalia de dado, não caso esperado).
4. **Nova rota `GET /players/:puuid/growth-journey`** (`apps/api/src/modules/players/routes.ts`) — sem autenticação, mesmo padrão de `/recent-matches`/`/champion-performance` (já públicas por puuid).

Validado ponta a ponta contra a conta real Zekerus#117: 8 partidas reais de Vel'Koz SUPPORT analisadas via `POST /postgame/analyze`, `GET /players/:puuid/growth-journey` retornou taxas conferidas manualmente contra os 8 relatórios (`kda_abaixo` 62.5%, `morre_demais` 50%, `visao_abaixo` 25%, `baixa_participacao_abates` 25%), `trend: "stable"`/`confidence: "medium"` honestamente refletindo que ainda não existe um segundo bloco de partidas mais antigas pra comparar, ordenação por magnitude de mudança correta.

O que ficou deliberadamente fora de escopo (confirmado com o usuário antes de implementar):

- Conectar o desktop — adiado de novo, mesmo padrão das Fases 1-4.
- Tendência de `strengths` (pontos fortes) — só `weaknesses`, conforme escopo escolhido pelo usuário.
- Progressão de `severity` — só presença/ausência por taxa, não a severidade da fraqueza quando presente.
- Metas/objetivos definidos pelo jogador (goal-setting) — outra opção apresentada ao usuário, não escolhida.

### O que a Fase 4 entregou (Post-Game Coach)

`POST /postgame/analyze` e `GET /postgame/:matchId` eram 100% mock: o POST aceitava dado inventado pelo próprio cliente (`championName`/`won`/`deathsBefore10`/`csAt10`) e devolvia texto fixo que nem batia com o tipo real `PostGameAnalysis`; o GET sempre retornava `"not_found"`.

**Achado que definiu o desenho**: `DraftSession`/`PickRecommendation` nunca são gravados em lugar nenhum (`recommendPicks` é uma função pura chamada ao vivo no champion select, o resultado é sempre descartado) — não existe, hoje, nenhum jeito de saber "o que o draft recomendou" pra uma partida real já jogada. Por isso `expectedPlan` é honestamente redefinido como derivado do **histórico próprio do jogador** nesse campeão+role (ou da baseline geral do role, se for a primeira vez), nunca como lembrança de uma recomendação armazenada que nunca existiu — o texto gerado deixa isso explícito.

1. **Módulo compartilhado `packages/core/src/scoring/dimension-signals.ts`** — extraído de `player-insights.ts` (Fase 2) sem mudar comportamento (`RATIO_DIMENSIONS`/`SCORE_DIMENSIONS`, `buildRatioSignal`/`buildScoreSignal`, thresholds, `ratioMagnitude`/`scoreMagnitude`, `round`). Generico sobre "um valor de razão/score já calculado" — não sabe se veio de uma média entre partidas (Fase 2) ou do valor bruto de uma única partida (Fase 4).
2. **Novo módulo puro `packages/core/src/postgame/post-game-analysis.ts`** — `generatePostGameAnalysis` calcula 7 dimensões por razão (kda/cs/damage/gold/vision/kp/objective, valor da partida ÷ baseline do role) + mortes como dimensão de score, reaproveitando o módulo compartilhado; `confidence` fixo em `"low"` em todo item (uma partida é sempre baixa confiança como sinal _geral_, mesmo sendo 100% precisa sobre o que aconteceu nela); guarda partidas curtas/remake (`durationSeconds < 300`) pra não gerar sinal a partir de zeros default da timeline; `pickAssessment`/`executionSummary`/`expectedPlan` são compostos por fragmentos de texto independentes (resultado + sinal mais forte + histórico), não uma árvore de decisão sobre o produto cartesiano completo — evita explosão combinatória de templates.
3. **Nova consulta `findMatchDetail(matchId, puuid)`** (`apps/api/src/modules/matches/match-repository.ts`) — busca Match+MatchTimeline+os 10 MatchParticipant de uma partida específica (diferente de `findParticipationHistory`, que agrega o histórico inteiro sem timeline nem outros participantes), localiza a linha do próprio jogador e o laner oposto (mesmo role, `teamId` diferente).
4. **`POST /postgame/analyze` e `GET /postgame/:matchId` religados com dado real** (`apps/api/src/modules/postgame/routes.ts`) — ambos autenticados; o POST encolhe o body pra só `{ matchId }` (servidor resolve tudo a partir de dado real, sem mais confiar em performance vinda do cliente) e persiste o resultado em `PostgameReport` via upsert (reanalisar depois de mais histórico acumulado atualiza o texto, não devolve relatório velho); o GET lê o relatório persistido, 404 honesto se ainda não analisado. Migration `20260722020000_postgame_report_unique` adiciona `@@unique([matchId, puuid])` e `updatedAt` (tabela estava vazia, sem necessidade de backfill).

Validado ponta a ponta contra a conta real Zekerus#117: análise real gerada pra uma partida sincronizada (Vel'Koz SUPPORT vs Lulu, derrota com mortes cedo — pontos fracos/dicas coerentes com a timeline real), persistência confirmada no Postgres, GET lendo o relatório salvo, reanalisar a mesma partida confirmado como upsert (não duplica linha).

O que ficou deliberadamente fora de escopo (confirmado com o usuário antes de implementar):

- Conectar o desktop (tela "Pós-game" em `App.tsx`, hoje um parágrafo estático) — adiado de novo, mesmo padrão das Fases 1-3.
- Dicas específicas de objetivos (`objectiveEvents`) — o formato atual não preserva atribuição de time, precisaria de plumbing extra.
- Variar `confidence` conforme o histórico do campeão concorda ou não com a partida específica — fica `"low"` fixo nesta versão.
- Persistir `DraftSession`/`PickRecommendation` no fluxo de champion select — não ajudaria retroativamente as partidas já jogadas e dobraria o escopo desta fase.

### O que a Fase 3 entregou (Draft Intelligence)

O bloqueio principal: `persistMatch` só gravava o participante rastreado (o jogador Sparta), descartando os outros 9 — sem isso não dá pra saber quem foi o adversário de rota. Corrigido, e a rota religada com dado real:

1. **Persistência dos 10 participantes por partida** (`apps/api/src/modules/matches/match-repository.ts`) — `persistMatch` agora recebe a lista completa de participantes (o mapper `mapMatchToSummaries` do `packages/riot` já retornava os 10, só não eram todos gravados) e grava todos numa `createMany` dentro da mesma transação, com `riotAccountId` resolvido por puuid (não só o de quem sincronizou — cobre o caso de dois usuários Sparta na mesma partida) e `championId` desconhecido do catálogo pulado (não aborta a partida inteira). Migration `20260721220000_matchparticipant_team_and_unique` adiciona `MatchParticipant.teamId` (nullable) e `@@unique([matchId, puuid])`.
2. **Backfill retroativo** (`apps/api/src/modules/matches/backfill-participants.ts`, CLI `pnpm --filter @sparta/api backfill:match-participants`) — reconstrói os participantes faltantes das partidas já sincronizadas antes da Fase 3 a partir do `Match.rawJson` já salvo desde a Fase 1, sem nenhuma chamada nova à Riot API. Também corrige o `teamId` de linhas que já existiam antes da Fase 3 (o `createMany` com `skipDuplicates` pula a linha do jogador rastreado por já existir, então sem esse reparo explícito o `teamId` dela ficaria nulo pra sempre — `findMatchesMissingParticipants` reprocessa qualquer partida com participante sem `teamId`, não só as com menos de 10 linhas).
3. **Novo módulo puro `packages/core/src/aggregation/matchup-stats.ts`** — `aggregateMatchupData` pareia os dois laners opostos (mesmo role, times diferentes) por partida e agrega globalmente (todas as partidas persistidas, não só de um jogador — matchup é sinal de meta, não pessoal) em `MatchupData[]`, com shrinkage rumo ao neutro 50 proporcional à amostra (constante `K=10`, ajustável) pra não deixar 1 partida decidir um "faceroll". `MatchupData` ganhou `confidence: Confidence`. Não emite entrada pra pares sem nenhuma partida (o fallback `?? 50` do motor já cobre a ausência).
4. **`POST /drafts/recommendations` religada com dado real** (`apps/api/src/modules/drafts/routes.ts`) — agora autenticada; resolve `player`/`championStats` da conta Riot do usuário (reaproveitando `findChampionStatsByPuuid`/`findPlayerInsightsByPuuid`/`derivePreferredRoles` da Fase 1/2), `championTags` da tabela real (`findAllChampionTags`, novo em `catalog/champion-repository.ts`) e `matchups` calculados na hora via `findLaneMatchupHistory(draft.playerRole)` (novo `matches/matchup-repository.ts`) + `aggregateMatchupData`. Usuário autenticado sem conta Riot vinculada recebe um perfil neutro/vazio (poucas ou nenhuma recomendação honesta), nunca o mock antigo. `compositionRules` saiu de `mock-data.ts` pra `apps/api/src/config/composition-rules.ts` (nunca foi mock de verdade, é config de produto).
5. **Corrigido bug real de seed do `ChampionTag`** — `apps/api/prisma/seed.ts` hardcodava só a Orianna em TypeScript; `data/seeds/champion-tags.json` (que já tinha Orianna + Ahri) só era citado num comentário obsoleto, nunca lido de fato. Reescrito pra ler e fazer upsert de cada entrada do JSON — agora `pnpm --filter @sparta/api prisma:seed` cobre os dois campeões, e adicionar mais é só editar o JSON (`Dockerfile.api` também precisou copiar `data/` pra imagem, que antes só existia no host).

Validado ponta a ponta contra a conta real Zekerus#117: backfill rodado (20 partidas, 10 participantes cada), matchup real de Vel'Koz (SUPPORT) confirmado (`score: 54.5` batendo com a fórmula de shrinkage pra 1 vitória em 1 partida), sync novo confirmado gravando os 10 participantes com `teamId` desde a primeira vez.

O que ficou deliberadamente fora de escopo (confirmado com o usuário antes de implementar):

- Conectar o desktop (`ChampionSelect` em `App.tsx`) à rota real — continua usando `features/mock-data.ts` local, próximo passo separado.
- Tornar `/drafts/pre-game-analysis` real — adiado naquela fase; entregue na Etapa 7.
- Expandir `ChampionTag` além dos 2 campeões do seed — sem bloqueio técnico agora, é curadoria manual contínua (editar `data/seeds/champion-tags.json`).
- Cache/pré-computação de matchups — computado na hora a cada chamada da rota, deliberadamente (dado é global, não amarrado a um evento de sync de um jogador). Revisitar se a latência incomodar conforme o histórico crescer.

### O que a Fase 2 entregou (Player Intelligence)

1. **Novo módulo puro `packages/core/src/aggregation/player-insights.ts`** — `computeRecentForm(history)` (forma recente do jogador entre todos os campeões/roles, não por campeão; compara o bloco das últimas 10 partidas com o bloco imediatamente anterior pra decidir `trend`) e `derivePlayerStrengthsWeaknesses(championStats)` (deriva até 3 pontos fortes e até 3 pontos fracos a partir de 9 dimensões — kda, cs, dano, ouro, visão, kp, objetivos, winrate, mortes — agregadas por média ponderada por jogos entre os campeões elegíveis, com `kp`/`objective` excluindo campeões cujo valor é exatamente 0, já que isso significa "sem dado" (`challenges` ausente da Riot em patches antigos) e não "0% real"). Cada item de `strengths`/`weaknesses`/`recentForm` agora carrega `confidence: Confidence`, calculado com `confidenceFromGames` (movido de privada pra exportada em `champion-performance.ts`, junto com `roleBaselines`/`normalizeInverse`/`clamp`, reaproveitados pelo novo módulo em vez de duplicar a matemática).
2. **Wiring na API** (`apps/api/src/modules/players/player-stats-repository.ts`): `computeAndPersistPlayerInsights(riotAccountId, puuid)` roda logo após `recomputeChampionStats` no fluxo de sync (`apps/api/src/modules/sync/riot-sync-service.ts`), só quando a rodada trouxe partida nova (`touchedPairs.length > 0` — evita reler o histórico inteiro em todo sync repetido sem partida nova), envolvida em try/catch (uma falha aqui não derruba um sync de partidas que já funcionou). `findPlayerInsightsByPuuid(puuid)` lê o resultado persistido (`PlayerProfile.strengthsJson`/`weaknessesJson`/`recentFormJson`, colunas que já existiam no schema mas nunca eram escritas/lidas) e cai num default neutro honesto se o profile ainda não existir.
3. **`GET /players/:riotName/:tagLine/profile`** troca o bloco hardcoded (`strengths: []`, `weaknesses: []`, `recentForm` zerado) por dado real via `findPlayerInsightsByPuuid`.
4. Testes novos em `packages/core/src/aggregation/player-insights.test.ts` (histórico vazio, fronteiras de confiança, detecção de tendência, cortes de sinal/severidade, corte top-3, jogador mono-role, exclusão de kp/objective ausente).

O que ficou deliberadamente fora de escopo na Fase 2 (o item de persistir os 10 participantes/matchups foi resolvido na Fase 3, o de `PostGameAnalysis` na Fase 4, ver acima):

- Conectar o desktop a essas rotas reais de perfil — o renderer ainda usa `features/mock-data.ts` local (que já foi atualizado só o suficiente pra não quebrar o typecheck com o novo campo `confidence`).

### O que a Fase 1 entregou (já em `main`)

Todo mundo que antes retornava os mesmos 2 campeões mockados (Orianna/Ahri) agora usa dado real, sincronizado da Riot API e persistido no Postgres. Validado ponta a ponta contra a conta real Zekerus#117:

1. **Catálogo de campeões real** via Data Dragon (`apps/api/src/modules/catalog/`) — antes só havia 1 campeão no seed manual, agora `Champion` é sincronizado (~170 registros, `pnpm --filter @sparta/api catalog:sync`). `ChampionTag` continua manual (Data Dragon não fornece os atributos de gameplay do Sparta) — o motor de recomendação já tolera isso.
2. **`RiotApiClient` conectado de verdade** (`packages/riot/src/clients/riot-api-client.ts`) — existia mas nunca era chamado pela API. Ganhou rate-limit real (`packages/riot/src/rate-limit/riot-request.ts`: respeita `Retry-After`, só retenta 429/502/503/504) e `getMatchTimeline`. `POST /players/link-riot-account` agora chama Account-V1 de verdade em vez de gerar um puuid fake.
3. **Mapeadores puros Match-V5** (`packages/riot/src/mappers/`) — raw da Riot → `MatchSummary`/`MatchTimelineSummary`. `killParticipation`/`objectiveParticipation` ficam `undefined` quando a Riot não manda o objeto `challenges` (patches antigos) em vez de inventar 0 — por isso `MatchParticipant.killParticipation`/`objectiveParticipation` viraram nullable no schema (migration `20260716010000_nullable_participant_challenge_stats`).
4. **Sync incremental real** (`apps/api/src/modules/sync/riot-sync-service.ts`) — `POST /players/sync` agora é autenticado, resolve a conta Riot do próprio usuário (não aceita mais `riotId` solto no payload), busca só partidas novas (`Match.matchId` único garante idempotência), processa sequencialmente (não paralelo, por causa do rate limit de chave de dev), teto de 20/50 partidas por chamada.
5. **Agregação real de `PlayerChampionStats`** (`packages/core/src/aggregation/player-champion-stats.ts`) — `PlayerProfile` nunca era criado em lugar nenhum (bloqueador oculto corrigido: create-if-missing no `player-stats-repository.ts`). Média de `killParticipation`/`objectiveParticipation` só sobre partidas que têm o dado.
6. **As 3 rotas GET de jogador** (`/profile`, `/recent-matches`, `/champion-performance`) trocaram o mock pelas queries reais.

O que ficou deliberadamente fora de escopo na Fase 1 (o item de strengths/weaknesses/recentForm foi resolvido na Fase 2, o de matchups/participantes na Fase 3, ver acima):

- Fila real (BullMQ/Redis) para o sync — hoje é síncrono, limitado por chamada; documentado como troca deliberada, não definitiva.
- `PostGameAnalysis` continua sem nenhuma função geradora.

Antes de rodar os testes manuais que dependem da Riot API real, o `.env` precisa de uma `RIOT_API_KEY` válida (as de desenvolvimento expiram em 24h e precisam ser regeradas no [Riot Developer Portal](https://developer.riotgames.com/)).

```bash
npx pnpm@10.34.4 install
docker compose up -d
npx pnpm@10.34.4 --filter @sparta/api prisma:generate
npx pnpm@10.34.4 --filter @sparta/api prisma migrate deploy --schema prisma/schema.prisma
npx pnpm@10.34.4 typecheck
npx pnpm@10.34.4 lint
npx pnpm@10.34.4 test
npx pnpm@10.34.4 build
```

## Leitura obrigatória

Antes de alterar código, leia estes arquivos:

1. `SPARTA_CODEX_INSTRUCTIONS.md` - instruções completas originais do projeto.
2. `README.md` - visão operacional do monorepo.
3. `docs/architecture.md` - arquitetura de alto nível.
4. `docs/riot-compliance.md` - limites de produto e compliance Riot.
5. `docs/scoring-model.md` e `docs/draft-recommendation.md` - regras dos motores iniciais.

## Produto

Sparta é um aplicativo desktop para jogadores de League of Legends focado em:

- análise de perfil do jogador;
- recomendação de campeões no champion select;
- análise pré-game baseada no draft;
- análise pós-game comparando expectativa do draft com execução real.

Escopo explicitamente proibido:

- overlay durante a partida;
- tracking de cooldowns ou summoner spells em tempo real;
- alertas in-game;
- automação de pick, ban, troca de campeão ou runas;
- qualquer assistência durante a partida;
- qualquer uso de Riot API key no frontend/desktop.

O MVP deve permanecer pré-game e pós-game.

## Estado atual

Branch principal: `main`.

Remote esperado:

```txt
origin https://github.com/J-Pantaroto/Sparta.git
```

O monorepo já foi scaffoldado e enviado ao GitHub. A base atual contém:

- `apps/desktop`: Electron + React + TypeScript + Vite.
- `apps/api`: Node.js + Fastify + TypeScript + Zod + Prisma.
- `packages/core`: domínio, tipos fortes, scoring e recommendation engine.
- `packages/riot`: adaptadores iniciais para Riot API, Data Dragon e LCU read-only.
- `packages/ui`: tokens e componentes compartilhados.
- `services/analyzer`: FastAPI opcional para análises futuras em Python.
- `docs`: documentação técnica real.
- `data/seeds`: seeds editáveis de campeões, matchups e composição.
- `.github/workflows/ci.yml`: pipeline inicial.
- `docker-compose.yml`: Postgres, Redis, API e analyzer.

## Stack e versões

Use Node 20 neste ambiente. O projeto está fixado em:

```txt
pnpm@10.34.4
```

Motivo: `pnpm@10.8.2` não existe publicado no npm e `pnpm@11.x` exige Node 22.13 ou superior.

Se `pnpm` não estiver global no PATH, use:

```bash
npx pnpm@10.34.4 <comando>
```

## Comandos principais

Instalar dependências:

```bash
npx pnpm@10.34.4 install
```

Rodar API:

```bash
npx pnpm@10.34.4 dev:api
```

Rodar desktop:

```bash
npx pnpm@10.34.4 dev:desktop
```

Rodar tudo que é TypeScript:

```bash
npx pnpm@10.34.4 typecheck
npx pnpm@10.34.4 lint
npx pnpm@10.34.4 test
npx pnpm@10.34.4 build
```

Rodar analyzer Python:

```bash
python -m pip install -e "services/analyzer[test]"
python -m pytest services/analyzer
```

Subir infraestrutura:

```bash
copy .env.example .env
docker compose up -d
```

Endpoints locais:

```txt
API health:      http://localhost:3333/health
API Swagger:     http://localhost:3333/docs
Analyzer health: http://localhost:8000/health
```

## Estrutura importante

```txt
apps/
  api/
    src/app.ts
    src/server.ts
    src/modules/
    prisma/schema.prisma
  desktop/
    src/main/
    src/preload/
    src/renderer/src/App.tsx
packages/
  core/
    src/types/domain.ts
    src/scoring/champion-performance.ts
    src/draft/recommendation-engine.ts
  riot/
    src/clients/riot-api-client.ts
    src/datadragon/client.ts
    src/lcu/read-only-client.ts
  ui/
    src/theme/tokens.ts
services/
  analyzer/
    app/main.py
docs/
data/seeds/
```

## Domínio já modelado

O arquivo `packages/core/src/types/domain.ts` define os principais contratos:

- `PlayerProfile`
- `RiotAccount`
- `Champion`
- `ChampionTag`
- `PlayerChampionStats`
- `RecentForm`
- `MatchSummary`
- `MatchTimelineSummary`
- `DraftState`
- `TeamComposition`
- `PickRecommendation`
- `RecommendationReason`
- `PostGameAnalysis`
- `PlayerWeakness`
- `PlayerStrength`
- `ReplayImportJob`
- `WeaknessTrend`
- `GrowthJourney`
- `ChampionClassProfile`
- `ItemSummary`
- `RecommendedItem`
- `BuildRecommendation`

`MatchSummary` ganhou `startedAt` (epoch ms do `gameStartTimestamp` real da Riot) — necessário pra ordenar por recência corretamente (a forma recente pondera por índice, então importa saber qual partida é a mais nova). `MatchPerformanceMetrics.killParticipation`/`objectiveParticipation` viraram opcionais (ausentes quando a Riot não manda `challenges`). `RecentForm`, `PlayerStrength` e `PlayerWeakness` ganharam `confidence: Confidence` (Fase 2). `MatchupData` também ganhou `confidence: Confidence` (Fase 3). `WeaknessTrend`/`GrowthJourney` são novos da Fase 5; `WeaknessTrend` ganhou `hasComparison: boolean` na Fase 10 (`!insufficientData` de `computeWeaknessTrends` - antes a UI não tinha como distinguir "tendência estável de verdade" de "ainda não existe segundo bloco pra comparar", os dois casos caíam em `trend: "stable"`). `ChampionClassProfile`/`ItemSummary`/`RecommendedItem`/`BuildRecommendation` são novos da Sub-fase 8a — `ChampionClassProfile` vem direto da Data Dragon (`tags`/`info` do `champion.json`), não da tabela curada `ChampionTag` (só 2 campeões seedados, insuficiente pra cobrir um time inimigo de campeões quaisquer).

Módulos de agregação: `packages/core/src/aggregation/player-champion-stats.ts` (`aggregatePlayerChampionStats`) — puro, agrega histórico de partidas em `PlayerChampionStats`. `packages/core/src/aggregation/player-insights.ts` (Fase 2) — `computeRecentForm`/`derivePlayerStrengthsWeaknesses`, também puro; reaproveita `confidenceFromGames`/`roleBaselines`/`normalizeInverse`/`clamp` exportados de `champion-performance.ts`. `packages/core/src/aggregation/matchup-stats.ts` (Fase 3) — `aggregateMatchupData`, também puro; pareia laners opostos e aplica shrinkage rumo ao neutro 50 conforme a amostra. `packages/core/src/scoring/dimension-signals.ts` (Fase 4) — `buildRatioSignal`/`buildScoreSignal` e as tabelas de rótulo/threshold, extraídos de `player-insights.ts` sem mudar comportamento; genéricos sobre "um valor de razão/score já calculado", reaproveitados tanto pra agregação entre partidas (Fase 2) quanto pra uma única partida (Fase 4). `packages/core/src/postgame/post-game-analysis.ts` (Fase 4) — `generatePostGameAnalysis`, puro; gera `PostGameAnalysis` de uma partida específica usando o módulo acima. `packages/core/src/aggregation/growth-journey.ts` (Fase 5) — `computeWeaknessTrends`/`computeGrowthJourney`, puro; compara blocos de `PostGameAnalysis` já persistidos ao longo do tempo, mesmo padrão de bloco de `computeRecentForm`. `packages/core/src/draft/build-recommendation.ts` (Sub-fase 8a) — `recommendBuild`/`deriveDamageStyle`/`summarizeEnemyDamageLean`, também puro; recomenda botas/itens core/situacionais por regras sobre tags reais do `item.json`, nunca estatística.

Priorize evoluir esses tipos antes de duplicar estruturas em API ou desktop.

## Scoring atual

Arquivo:

```txt
packages/core/src/scoring/champion-performance.ts
```

Regras implementadas:

- score de 0 a 100;
- mínimo de 5 partidas para ranking;
- volume de jogos não aumenta score diretamente;
- volume afeta apenas confiança estatística;
- KDA usa `(kills + assists) / max(1, deaths)`;
- forma recente usa `exp(-index / decayFactor)` com `decayFactor = 8`;
- pesos diferentes para laners, jungle e suporte.

Testes:

```txt
packages/core/src/scoring/champion-performance.test.ts
```

## Recommendation engine atual

Arquivo:

```txt
packages/core/src/draft/recommendation-engine.ts
```

Entradas:

- `DraftState`
- `PlayerProfile`
- `PlayerChampionStats[]`
- `ChampionTag[]`
- `MatchupData[]`
- `CompositionRules`
- `PatchMetaData | null`

Saída:

- 3 a 5 `PickRecommendation`, com score, confiança, categoria, reasons e warnings.

Cenários já considerados:

- first pick;
- lane inimiga revelada;
- quarto/quinto pick com draft mais completo.

Testes:

```txt
packages/core/src/draft/recommendation-engine.test.ts
```

## API atual

Arquivo principal:

```txt
apps/api/src/app.ts
```

Endpoints iniciais:

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /players/:riotName/:tagLine/profile`
- `POST /players/sync`
- `POST /players/link-riot-account` (autenticado)
- `GET /players/:puuid/recent-matches?limit=10`
- `GET /players/:puuid/champion-performance`
- `GET /players/:puuid/growth-journey`
- `GET /players/settings` (autenticado)
- `PUT /players/settings` (autenticado)
- `GET /players/pool` (autenticado)
- `POST /players/pool` (autenticado)
- `PATCH /players/pool/:championId` (autenticado)
- `POST /drafts/recommendations` (autenticado)
- `POST /drafts/pre-game-analysis` (autenticado)
- `POST /postgame/analyze`
- `GET /postgame/:matchId`
- `POST /replays/import`
- `GET /replays/:jobId`

Auth (`apps/api/src/modules/auth`): senha com `scrypt` (nativo do `node:crypto`) e token de sessao assinado com HMAC-SHA256 (`node:crypto`, sem `jsonwebtoken`/`bcrypt` como dependencia). Segredo em `AUTH_TOKEN_SECRET` (ver `src/config/env.ts`; `loadEnv()` recusa subir se `NODE_ENV=production` e o segredo ainda for o default de dev). Token vai no header `Authorization: Bearer <token>`.

CORS restrito a uma allowlist (`localhost:5173` em dev + origem `null` do app empacotado via `file://`) e rate limit de 5/min em `/auth/login` e `/auth/register` (`@fastify/rate-limit`) — ver `app.ts`. `methods` do `@fastify/cors` é configurado explicitamente como `["GET","HEAD","POST","PUT","PATCH"]`: `PUT` atende settings e `PATCH` atende a desativação de entradas manuais do pool.

`POST /players/link-riot-account` chama Account-V1 de verdade (`apps/api/src/modules/riot-integration/account-lookup.ts`, cache de 24h via `ApiCacheEntry`) e grava o puuid real. `POST /players/sync` é autenticado, resolve a conta Riot do proprio usuario e sincroniza partidas novas de verdade (`apps/api/src/modules/sync/riot-sync-service.ts`) — ver "Pendências desta sessão" pra mais detalhes de como isso funciona.

Módulos:

```txt
apps/api/src/modules/catalog/        # catalogo de campeoes via Data Dragon (Fase 1) + findAllChampionTags (Fase 3)
apps/api/src/modules/riot-integration/  # client-factory + account-lookup (Account-V1)
apps/api/src/modules/matches/         # persistencia/consulta de Match/MatchParticipant/MatchTimeline,
                                       # backfill de participantes (Fase 3), findMatchDetail (Fase 4)
apps/api/src/modules/sync/            # orquestracao do sync incremental
apps/api/src/modules/postgame/        # POST /postgame/analyze + GET /postgame/:matchId reais (Fase 4),
                                       # findPostgameReportsByPuuid (Fase 5), limit opcional (Fase 6b)
apps/api/src/config/composition-rules.ts  # constantes reais de produto pro recommendation engine (Fase 3)
apps/api/src/db/api-cache.ts          # helper generico sobre ApiCacheEntry
```

`GET /players/:riotName/:tagLine/profile`, `/recent-matches` e `/champion-performance` leem dado real (Fase 1, Tarefa 6). Desde a Fase 2, `strengths`/`weaknesses`/`recentForm` do perfil também são reais (`findPlayerInsightsByPuuid`, calculados e persistidos a cada sync via `computeAndPersistPlayerInsights`). Desde a Fase 3, `POST /drafts/recommendations` também é real (autenticada, ver acima) — `apps/api/src/routes/mock-data.ts` foi removido, não sobrou nenhum uso dele. Desde a Fase 4, `POST /postgame/analyze`/`GET /postgame/:matchId` também são reais e autenticados. Desde a Fase 5, `GET /players/:puuid/growth-journey` também é real (sem autenticação, mesmo padrão de `/recent-matches`/`/champion-performance`).

Desde a Etapa 7, `POST /drafts/pre-game-analysis` também é real e autenticada (motor puro `generatePreGameAnalysis`, ver `docs/pre-game-analysis.md`). Ainda 100% mock/estático: `/replays/*` (fora do escopo até agora).

## Banco atual

Schema:

```txt
apps/api/prisma/schema.prisma
```

Migrations aplicadas e validadas contra Postgres real:

- `20260715120000_init` — schema inicial (inclui `User.passwordHash`/`displayName` pra login).
- `20260716010000_nullable_participant_challenge_stats` — `MatchParticipant.killParticipation`/`objectiveParticipation` viraram nullable (a Riot nem sempre manda o objeto `challenges`, e persistir 0 seria inventar dado).
- `20260721220000_matchparticipant_team_and_unique` (Fase 3) — `MatchParticipant.teamId` (nullable) e `@@unique([matchId, puuid])`, necessários pra persistir os 10 participantes por partida e parear laners opostos.
- `20260722020000_postgame_report_unique` (Fase 4) — `PostgameReport.updatedAt` e `@@unique([matchId, puuid])`, necessários pro upsert idempotente de relatórios pós-game (tabela estava vazia, sem backfill necessário).
- Fase 5 (Growth Journey) não precisou de nenhuma migração — primeira fase do projeto sem uma, já que tudo é derivado do `PostgameReport.reportJson` já persistido pela Fase 4.
- `20260722180000_player_profile_match_analysis_limit` (Fase 6b) — `PlayerProfile.matchAnalysisLimit Int @default(50)`.

```bash
npx pnpm@10.34.4 --filter @sparta/api prisma:generate
npx pnpm@10.34.4 --filter @sparta/api prisma migrate deploy --schema prisma/schema.prisma
npx pnpm@10.34.4 --filter @sparta/api champion-tags:generate
npx pnpm@10.34.4 --filter @sparta/api prisma:seed
npx pnpm@10.34.4 --filter @sparta/api backfill:match-participants
```

Tabelas com uso real vs ainda sem código:

| Tabela                                                  | Status                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`, `RiotAccount`                                   | Real desde antes da Fase 1                                                                                                                                                                                                                                                        |
| `Champion`                                              | Real — sincronizado via Data Dragon (`catalog:sync`)                                                                                                                                                                                                                              |
| `ChampionTag`                                           | Real — cobre os **173 campeões** desde a Fase 15: `champion-tags:generate` deriva os atributos das tags/notas da Data Dragon e grava em `data/seeds/champion-tags.json`, e `prisma:seed` faz upsert com update de verdade. Entradas `"source": "manual"` sobrevivem à regeneração |
| `Match`, `MatchParticipant`, `MatchTimeline`            | Real — persistidos pelo sync incremental; desde a Fase 3, os 10 participantes por partida (não só o rastreado), com `teamId`                                                                                                                                                      |
| `PlayerProfile`, `PlayerChampionStats`                  | Real — agregado apos cada sync; `strengthsJson`/`weaknessesJson`/`recentFormJson` tambem reais desde a Fase 2; `matchAnalysisLimit` desde a Fase 6b                                                                                                                               |
| `ApiCacheEntry`                                         | Real — cache de Account-V1 (24h) e Data Dragon (7 dias)                                                                                                                                                                                                                           |
| `PostgameReport`                                        | Real — upsert por (matchId, puuid) a cada `POST /postgame/analyze` (Fase 4); lido pela Fase 5 pra Growth Journey (sem tabela nova)                                                                                                                                                |
| `DraftSession`, `PickRecommendation`, `ReplayImportJob` | Ainda sem nenhum codigo que leia/escreva                                                                                                                                                                                                                                          |

Próximo passo natural: conectar o desktop às rotas de perfil/drafts reais (hoje só auth usa a API real).

## Desktop atual

Estrutura do renderer (reorganizada na Fase 14):

```txt
apps/desktop/src/renderer/src/
  App.tsx        # so sessao, deteccao via LCU e roteamento (~215 linhas)
  app/           # navegacao (grupos da sidebar) e rotulos do dominio
  ui/            # DESIGN SYSTEM: tokens.css + base.css + 1 CSS por componente
  features/      # uma tela por arquivo
  theme/         # tema por skin (contexto, extracao de cor, galeria)
  services/      # api-client e Data Dragon
  hooks/         # use-async-data
```

Nao existe mais `styles/global.css`: todo o CSS sai de `ui/tokens.css`, `ui/base.css` e do
arquivo colocado de cada componente. Toda classe usa o prefixo `sp-`. Ver `docs/design-system.md`.

Telas existentes:

- Login / cadastro (`features/AuthScreen.tsx`);
- Vincular conta Riot (`features/LinkRiotAccountScreen.tsx`);
- Dashboard (inline em `App.tsx`);
- Perfil (inline em `App.tsx`);
- Champion Select manual (inline em `App.tsx`), agora com seletor real de time inimigo (`features/ChampionGridPicker.tsx`, até 5 campeões) e confirmação de campeão + painel de build inline (`BuildPanel`, Sub-fase 8a);
- Pré-game (inline em `App.tsx`, enriquecido na Sub-fase 8b com ícones/splash reais — o texto da dica em si continua estático, ver abaixo);
- Pós-game (`features/PostGameScreen.tsx`, com ícone/nome de campeão real desde a 8b);
- Evolução (`features/GrowthJourneyScreen.tsx`, com ícone/cor de tendência desde a 8b);
- Configurações (`features/SettingsScreen.tsx`, novo na Sub-fase 6a).

Desde a sessão que conectou o desktop às rotas reais: Dashboard/Perfil/Champion Select/Pós-game/Evolução leem dado real via `features/api-client.ts` (`fetchPlayerProfile`/`fetchChampionPerformance`/`fetchRecentMatches`/`fetchGrowthJourney`/`fetchDraftRecommendations`/`analyzePostgame`/`fetchPostgameReport`), com loading/erro tratados pelo hook compartilhado `features/use-async-data.ts`. `mock-data.ts` foi removido. A rota `/drafts/pre-game-analysis` era 100% mock no backend até a Etapa 7, que a tornou real — a Sub-fase 8b só tinha enriquecido a apresentação do lado do desktop com dado já disponível no cliente (ver abaixo).

Build de campeão (Sub-fase 8a): ao confirmar um campeão no Champion Select ("Confirmar campeão" em cada card de recomendação), um painel `<BuildPanel>` aparece inline na mesma tela — busca `ChampionClassProfile[]`/`ItemSummary[]` via `features/datadragon.ts` (`fetchChampionClassProfiles`/`fetchItemCatalog`, direto da Data Dragon, sem rota nova no backend) e chama `recommendBuild` (`@sparta/core`) com o campeão confirmado + `draft.enemies` (agora populado por um seletor real de até 5 campeões inimigos, `features/ChampionGridPicker.tsx`, extraído do `ChampionSkinPicker.tsx`). Renderiza botas/itens core/situacionais com ícone real (`itemIconUrl`) e as `reasons`/`warnings` do motor. Sem persistência — some ao sair da tela.

Polimento visual (Sub-fase 8b): componente compartilhado `features/Loading.tsx` (spinner) e `features/GridSkeleton.tsx` (shimmer) substituindo todo texto solto de "Carregando..." e grid vazio enquanto carrega. Pré-game (`PreGame` em `App.tsx`) passou a receber `draft`/`ddragonVersion` e mostra ícone/splash do campeão confirmado + ícones dos inimigos conhecidos + resumo da inclinação de dano do time inimigo via `summarizeEnemyDamageLean` (`@sparta/core`, mesma função do motor de build). Pós-game resolve `championId → nome/ícone` reaproveitando `fetchAllChampions`. Evolução ganhou ícone (`TrendingUp`/`TrendingDown`/`Minus`) e cor semântica de tendência (`--color-green` novo token, só para tendência — cor de destaque do tema continua fixa em vermelho).

Linguagem visual real (Fase 9, encerrada): `features/ScoreBadge.tsx` (anel colorido via `conic-gradient`, score 0-100), `features/StatBar.tsx` (barra horizontal, variantes `score`/`ratio`, prop `invert` desde a 9b pra métricas onde número alto é ruim) e `features/SignalChip.tsx` (pill com ícone lucide, `positive`/`negative`) — todos CSS puro, sem lib de gráfico, cores reaproveitadas dos limiares já exportados de `dimension-signals.ts` (`SCORE_STRENGTH_THRESHOLD`/`SCORE_WEAKNESS_THRESHOLD`/`RATIO_STRENGTH_THRESHOLD`/`RATIO_WEAKNESS_THRESHOLD`). Dashboard (9a) perdeu o card "Princípio do produto" e ganhou `ScoreBadge` nos cards de forma/melhor campeão. Champion Select (9a) trocou o `totalScore` solto por `ScoreBadge` + `StatBar` (top 4 métricas) + lista completa de `reasons`/`warnings` como `SignalChip`. Perfil (9b) ganhou `ScoreBadge`/`StatBar` por campeão (via `scoreChampionPerformance`) e `SignalChip` pros pontos fortes/fracos. Pós-game (9b) ganhou `StatBar` variante `ratio` (KDA/CS/dano/visão/ouro vs `roleBaselines[role]`) e `SignalChip`. Evolução (9b) ganhou `StatBar` dupla (recente vs anterior, com `invert`) ao lado do `TrendCell` já existente.

Ícones de campeão robustos (Fase 10): `features/ChampionIcon.tsx` substitui todo `<img src={championSquareUrl(...)}>` de campeão no app (Perfil, Champion Select, Dashboard, Pós-game, Pré-game, seletor de inimigo) — 3 estágios de fallback (Data Dragon pelo slug real, resolvido pelo `championId` quando só há `championName` cru; Community Dragon por ID numérico; placeholder estilizado), nunca mostra o ícone nativo de imagem quebrada do navegador. Dashboard (Fase 10) trocou o card "Escopo" por "Ponto forte" (espelha "Risco atual", usa `strengths[0]`) e traduziu `severity`/`confidence` crus (`severityLabels`/`confidenceLabels`). Evolução (Fase 10) usa o novo `WeaknessTrend.hasComparison` pra mostrar "Ainda sem histórico pra comparar" em vez de um "Estável" enganoso quando ainda não existe um segundo bloco de partidas pra comparar. Inputs numéricos (`input[type="number"]`) perderam as setinhas nativas via CSS global.

Fluxo de sessão (`App.tsx`, Etapa 31D): não existe convidado, skip ou bypass local. Ao abrir, o renderer pede ao processo main o bearer cifrado pelo `safeStorage` do Electron, consulta `GET /auth/me` e roteia pelo estado de onboarding calculado no backend. Só `READY` monta o shell; email pendente e Riot pendente ficam nas etapas 2 e 3 sem flash de conteúdo protegido. A chave legada `sparta:token` é removida do `localStorage` sem ser reutilizada. Logout incrementa `User.sessionVersion` e apaga a cópia protegida local.

Etapa 31D — acesso obrigatório e onboarding: `User` ganhou `emailVerifiedAt`, `isActive`, `sessionVersion` e `updatedAt`; `EmailVerificationToken` guarda somente hash, email vigente, validade e consumo/revogação. Cadastro e reenvio têm resposta neutra; tokens são CSPRNG, one-time, expiráveis, limitados e emissões novas revogam as antigas. Estados: `EMAIL_UNVERIFIED`, `EMAIL_VERIFIED_RIOT_UNLINKED`, `RIOT_LINK_PENDING`, `RIOT_LINK_REQUIRES_REAUTHENTICATION`, `READY`. Toda rota pessoal exige `READY`; em produção só `VERIFIED_BY_RSO` fecha o gate. `TransactionalEmailProvider` é desacoplado: memória apenas fora de produção; boot de produção falha sem provider real. Produção permanece `BLOCKED_BY_EMAIL_PROVIDER_CONFIGURATION` e `BLOCKED_BY_RIOT_APPROVAL`. Fonte: `docs/account-access-onboarding.md`.

Deteccao automatica de champion select: `packages/riot/src/lcu/read-only-client.ts` agora le o lockfile local do League (`LcuReadOnlyClient`) e faz poll de `GET /lol-gameflow/v1/gameflow-phase` a cada 2.5s no processo main (`apps/desktop/src/main/index.ts`), repassando por IPC (`sparta:gameflow-phase`) para o renderer, que troca a aba para "Champion Select" quando a fase vira `ChampSelect`. Somente leitura, sem nenhuma acao de escrita no cliente (ver `docs/riot-compliance.md`). **O bridge `window.sparta` que entrega esse evento ao renderer só passou a carregar de verdade depois do bugfix de preload descrito acima** (sessão que validou contra o Electron real) - o comportamento downstream (trocar de aba de verdade com o League aberto) ainda não foi confirmado nesta sessão, só a existência do bridge.

Estetica: fonte unificada em `Manrope` (corpo, titulos e o wordmark "Sparta" — substituiu o par Rajdhani/Cinzel de uma sessao anterior), carregada via Google Fonts no `index.html`. Paleta migrada pra CSS custom properties em `styles/global.css` (`--color-bg`, `--color-red`, etc.), espelhando os valores de `packages/ui/src/theme/tokens.ts` sem de fato importar o pacote (`@sparta/ui` continua sem uso real pelo desktop — `theme`/`MetricCard` de la sao codigo morto do ponto de vista do desktop). `text-transform: uppercase` foi removido dos rotulos (`.page-header span`, `.auth-field label` etc.) — texto normal, so cor/peso/tamanho fazem a hierarquia agora. Adicionadas transicoes (hover em nav/cards/botoes) e animacoes de entrada (`fadeIn`/`fadeInSoft`) ao trocar de aba e ao carregar splash art — antes disso o app nao tinha nenhuma transicao. Icones/artes de campeao vem do Data Dragon (`features/datadragon.ts` no renderer; `packages/riot/src/datadragon/client.ts` no backend) — ver `championSquareUrl`/`championSplashUrl`. Continua minimalista/premium, sem landing page nem foco em marketing.

Tema por campeao/skin (Sub-fase 6a): `features/featured-champion-context.tsx` (`FeaturedChampionProvider`/`useFeaturedChampion`) guarda em `localStorage` (`sparta:featured-champion`, JSON `{key,name,skinIndex,skinName,localSplashPath?}`) o campeao+skin escolhido na tela de Configuracoes (`features/ChampionSkinPicker.tsx`, fluxo de 2 passos - qualquer campeao, qualquer skin, lista vinda direto da CDN da Data Dragon). A splash art do login e do header do Dashboard preferem `localSplashPath` (arquivo baixado pro disco via `window.sparta.downloadSkin`, novo IPC request/response) quando existir, senao caem pra CDN. Antiga lista curada de 12 campeoes (`ChampionThemePicker.tsx`) removida. A cor de destaque (vermelho) continua fixa por decisao explicita — so a arte muda, nao a paleta.

Estilo:

- preto profundo;
- superfícies quase pretas;
- vermelho discreto (fixo, nao varia por tema);
- minimalista/premium;
- sem landing page;
- foco em leitura rápida.

## Analyzer Python atual

Arquivo:

```txt
services/analyzer/app/main.py
```

Endpoints:

- `GET /health`
- `POST /replay/import`

Replay parsing completo não faz parte do MVP. Mantenha como experimental até haver base técnica e revisão de compliance.

## Seeds atuais

Arquivos:

```txt
data/seeds/champion-tags.json
data/seeds/matchup-seed.json
data/seeds/composition-rules.json
```

Os dados são manuais e pequenos de propósito. Não bloqueie evolução do produto esperando dataset perfeito.

## Git e scripts

Remote é lido de:

```txt
git.txt
```

Scripts:

```txt
scripts/read-git-remote.ts
scripts/push-to-github.sh
scripts/setup.ps1
scripts/setup.sh
```

Comandos:

```bash
npx pnpm@10.34.4 github:setup
bash scripts/push-to-github.sh
```

Não usar force push sem pedido explícito.

## Regras de implementação

1. Preserve a separação entre desktop, API, core, riot, ui e analyzer.
2. Não coloque lógica de scoring dentro do React se ela pertence ao `packages/core`.
3. Não coloque Riot API key no desktop.
4. Use Zod para payloads HTTP.
5. Use tipos fortes do `@sparta/core`.
6. Mantenha recomendações explicáveis, com reasons e warnings.
7. Não implemente recursos in-game.
8. Não automatize ações no client.
9. Para integrações Riot/LCU, documente endpoints e finalidade.
10. Rode typecheck, lint e testes antes de concluir alterações relevantes.
11. Pra cada feature nova ou bug-fix, crie e rode testes automatizados sempre que necessário/possível
    (unitário em `packages/core`, integração na API, etc.) cobrindo o comportamento introduzido —
    não só reexecutar a suíte já existente. Quando não for possível (ex.: depende do League Client
    real aberto, sem forma de simular no CI), documente explicitamente por que, tanto nas notas do
    arquivo de prompt (`.ai/prompts/features/`) quanto na entrada do `.ai/CHANGELOG.md`.

## Próximos passos recomendados

### Estado pós-release 0.9.0 (Etapa 31)

Em 2026-08-05, a prerelease e o instalador público permaneceram íntegros, e a release
operacional `release-etapa27c-v1` continuou `ACTIVE` com replay `EXACT_REPLAY`. O parecer de
pós-release é **`WITHDRAWAL_REQUIRED` + `MONITORING_LIMITED_BY_MISSING_PUBLIC_API`**: o desktop
aponta por padrão para `http://localhost:3333`, mas não existe API pública; por isso um usuário
externo não consegue autenticar nem usar recomendações, históricos ou laboratório. Não houve
retirada, hotfix ou Etapa 32. Ver `docs/post-release-0.9.0.md` e `docs/support.md`.

### Retirada controlada 0.9.0 (Etapa 31A)

Em 2026-08-05, a retirada foi autorizada e executada. A GitHub Release ID `365792897` permanece
como prerelease histórica com o título `WITHDRAWN — Sparta Desktop 0.9.0` e aviso no início das
notas. Somente o instalador foi removido; tag, commit e cinco documentos de auditoria foram
preservados. Estado `WITHDRAWN_PENDING_PUBLIC_API`. `release-etapa27c-v1` continua `ACTIVE` e o
replay continua `EXACT_REPLAY`. Não recolocar o instalador de `v0.9.0`; uma publicação futura
exige API pública real, validação externa e novo candidato/versionamento. Ver
`docs/release-withdrawal-0.9.0.md`.

Fase 1 (Riot Sync), o refinamento visual do desktop, Fase 2 (Player Intelligence), Fase 3 (Draft Intelligence), Fase 4 (Post-Game Coach), Fase 5 (Growth Journey), a conexão do desktop às rotas reais, a Fase 6 inteira (Configurações + tema com skins + "quantas partidas analisar" + ordem de pick automática via LCU), a Fase 7 (auditoria e documentação dos algoritmos de scoring), a Fase 8 inteira (Sub-fase 8a: motor de build + seletor de time inimigo; Sub-fase 8b: polimento visual do desktop, validada com a conta real Zekerus#117), a Fase 9 inteira (Sub-fase 9a: `ScoreBadge`/`StatBar`/`SignalChip`, Dashboard, Champion Select; Sub-fase 9b: Perfil, Pós-game, Evolução), a Fase 10 (polimento de UX + `ChampionIcon.tsx` com fallback Data Dragon → Community Dragon → placeholder) , a Fase 11 (detecção de posição/lane via LCU + gating do Champion Select + correções de polimento) e a Fase 12 (módulo de temas: splash art com extensão errada + `file://` bloqueado no renderer, mais fallback via Community Dragon) estão completas em `main` — mais sete bugs reais corrigidos ao longo do caminho: card de skin sobreposto, cor errada do número do `ScoreBadge`, o preload nunca carregando de verdade em nenhuma sessão anterior, ícones de campeão quebrados por depender do `championName` cru da Riot, `draft.playerRole` hardcoded em MID (recomendações pro papel errado), splash art pedida como `.png` quando a CDN só serve `.jpg` (403 em tudo: prévia e download), e `localSplashPath` gravado como `file://`, que o renderer nunca conseguiu carregar. Próximo:

1. **Validar a detecção automática de posição/ordem de pick dentro de uma sessão de champion select real** (precisa do cliente do League aberto e em champ select) — a Fase 11 implementou `derivePlayerRole` e o gating, e o download de skin já foi validado de verdade (não é mais pendência), mas a detecção de papel/pick order/troca de lane só pode ser confirmada de ponta a ponta com o League rodando, indisponível neste ambiente.
2. Refinar `ChampionTag` campeão a campeão onde a leitura de classe é grosseira demais (Fase 15 cobriu os 173 automaticamente, mas duas Marksman recebem o mesmo perfil, e campeão fora do arquétipo — Senna, Pyke, Ivern — fica genérico). Editar a entrada em `data/seeds/champion-tags.json` e marcar `"source": "manual"`: a regeneração preserva.
3. ~~Tornar `/drafts/pre-game-analysis` real~~ — **feito na Etapa 7**. O motor é novo (`packages/core/src/draft/pre-game-analysis.ts`), não `analyzeTeamComposition`: aquela função devolve `0` em toda dimensão sem tags, o que aqui viraria uma frase falsa. Ver `docs/pre-game-analysis.md`.
4. Pré-computar/cachear matchups se a latência de `POST /drafts/recommendations` incomodar conforme o histórico crescer (hoje calculado na hora a cada chamada, ver "O que a Fase 3 entregou").
5. Dicas de objetivos no `PostGameAnalysis` — `objectiveEvents` (Fase 1) não preserva atribuição de time no formato atual (`"LABEL@M:SS"`), precisaria de um `MatchTimelineSummary` mais rico pra saber quais objetivos foram do próprio time.
6. Fila real (Redis/BullMQ) para o sync, se o padrão de uso mostrar que o teto de 20-50 partidas por chamada síncrona é pouco — o `docker-compose.yml` já provisiona Redis, só falta o worker.
7. Validar a leitura do LCU dentro de um champion select **real** (precisa do League aberto): posição, ordem de pick, troca de lane e o draft importado na Fase 16. A derivação e todo o caminho até a tela já foram validados com sessão sintética; o que falta é a chamada HTTP ao cliente de verdade.
8. Trocar o token HMAC caseiro por algo mais robusto (rotação de segredo, refresh token) se o produto for além do MVP local.
9. Empacotamento do desktop (electron-builder/NSIS/ASAR) — hoje não existe nenhuma configuração de build de instalador, só `electron-vite build`.
10. Mitigar a limitação conhecida da Fase 5 (`WeaknessTrend` derivado de um corte top-3 por partida, ver "O que a Fase 5 entregou") lendo razões brutas em vez de só `weaknesses[]`, se o ruído de entrada/saída na fronteira do corte incomodar na prática.
11. Recalibrar estatisticamente os pesos/baselines/thresholds de scoring (`docs/scoring-model.md`/`docs/draft-recommendation.md`) quando houver volume real de uso acumulado — a Fase 7 documentou o raciocínio de design atual mas deliberadamente não recalibrou nada por falta de dado suficiente.
12. Persistir a build recomendada / confirmação de campeão no backend, se fizer sentido revisitar depois de mais uso (hoje é 100% local à sessão do Champion Select, decisão deliberada da 8a).
13. Sparkline/timeline por partida individual na Evolução (hoje só 2 blocos agregados) — exigiria mudar o contrato de `computeWeaknessTrends` pra reter presença por partida, não só a taxa; adiado na Fase 11.

## Verificação conhecida

Última bateria executada com sucesso no scaffold:

```bash
npx pnpm@10.34.4 typecheck
npx pnpm@10.34.4 lint
npx pnpm@10.34.4 test
npx pnpm@10.34.4 build
python -m pytest services/analyzer
```

O teste Python pode exigir antes:

```bash
python -m pip install -e "services/analyzer[test]"
```

## Cuidado com arquivos gerados

Não commitar:

- `.env`;
- `node_modules`;
- `dist`;
- `build`;
- `out`;
- `coverage`;
- `.pytest_cache`;
- `*.egg-info`;
- logs;
- bancos SQLite locais.

O `.gitignore` já cobre esses casos.
