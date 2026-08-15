# Autenticação de produção: e-mail transacional e recuperação de senha (Etapa 31Q)

Fecha os dois maiores bloqueios que a auditoria pré-final do Desktop (`docs/desktop-pre-final-
audit.md`) registrou como pendência antes do polish visual: confirmação de e-mail sem um jeito
real de concluir o clique, e recuperação de senha inexistente. RSO, download público, redesign e
sistema de tickets seguem explicitamente fora de escopo.

## Classificação final

| Item | Estado | Evidência |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `NEEDS_CONFIGURATION` | Adaptador real (Resend) implementado e testado; produção falha o boot sem `EMAIL_PROVIDER_API_KEY` real. Falta só a credencial do owner. |
| `EMAIL_CONFIRMATION` | `NEEDS_CONFIGURATION` | Fluxo completo validado end-to-end contra Docker real (cadastro → token → confirmação → login). Falta só o provider real para o e-mail sair de fato. |
| `PASSWORD_RECOVERY` | `NEEDS_CONFIGURATION` | Fluxo completo validado end-to-end contra Docker real (pedido → token → nova senha → sessões antigas invalidadas → token não reutilizável). Falta só o provider real. |

Nenhum dos três é `NEEDS_IMPLEMENTATION` mais. A única pendência restante em todos é a mesma:
**credencial real do provider transacional em produção** — configuração do owner, não código.

## Inventário da abstração existente (antes de alterar)

`TransactionalEmailProvider` (`apps/api/src/modules/auth/email-provider.ts`) já existia desde a
Etapa 31D como interface + dois provedores: `unavailableEmailProvider` (lança
`EMAIL_PROVIDER_NOT_CONFIGURED`) e `InMemoryTransactionalEmailProvider` (só testes/dev,
`EMAIL_PROVIDER_MODE=IN_MEMORY`, nunca em produção). O schema de env (`apps/api/src/config/
env.ts`) já reservava `EMAIL_PROVIDER_MODE: "EXTERNAL"` como enum e validava, em produção, que
`EMAIL_VERIFICATION_FROM`/`EMAIL_VERIFICATION_URL_BASE` HTTPS estivessem presentes quando
`EXTERNAL` estava declarado — mas **nenhuma implementação real existia** pra esse modo: declarar
`EXTERNAL` sem uma classe concreta nunca teria enviado um e-mail de verdade. A abstração não foi
substituída — só completada com o adaptador que faltava.

Token de confirmação de e-mail (`email-verification.ts`) também já era sólido: hash SHA-256
persistido (nunca o token bruto), expiração, uso único (`consumedAt`), revogação do anterior ao
reenviar, cooldown + limite por hora numa transação serializável, resposta neutra (`neutralVerifi
cationResponse`) que não distingue conta existente de inexistente. **Recuperação de senha não
existia em lugar nenhum** — nem tela, nem rota, nem tabela.

## Arquitetura do fluxo

```
Desktop (pedido)  ──►  API (token + e-mail)  ──►  Resend  ──►  caixa do usuário
                                                                     │
                                              clique no link         ▼
                                    apps/site (/confirmar-email OU /redefinir-senha)
                                                     │
                                                     ▼
                                    API (consome o token, muda o estado)
                                                     │
                                                     ▼
                              Desktop reconsulta a sessão quando o usuário volta
```

**Decisão de arquitetura, avaliada antes de escrever código**: o pedido pedia pra considerar deep
link/protocolo do Desktop antes de criar página pública. Descartado por ser a opção mais frágil,
não a mais simples: exige `app.setAsDefaultProtocolClient` registrado (só funciona depois de
*instalado*, não em dev), tratamento de `open-url`/`second-instance` no Electron, e ainda falha se
o app não estiver aberto/instalado na máquina que recebeu o e-mail. Uma página pública funciona em
qualquer cliente de e-mail, em qualquer máquina, sem exigir o Desktop aberto — e o site já está
publicado e com identidade Spartan Signal pronta. Duas páginas mínimas, sem SPA e sem virar área
de conta: `/confirmar-email` e `/redefinir-senha`, cada uma consumindo exatamente um token e
mostrando o resultado. Nenhuma sessão, nenhum `/conta`, nenhum histórico de tickets.

## Provider transacional: Resend

Escolhido por ser uma API HTTP única (1 `POST`, sem SDK obrigatório) — trocar de provider no
futuro significa escrever outra classe que implemente `TransactionalEmailProvider`, sem tocar o
resto do sistema. `ResendTransactionalEmailProvider` (`apps/api/src/modules/auth/resend-email-
provider.ts`) implementa `sendEmailVerification`/`sendPasswordReset` via `fetchWithPolicy`
(`@sparta/riot/http`, o mesmo módulo de timeout/cancelamento/erro sanitizado já usado pelas
integrações Riot/Data Dragon — ganhou uma nova `IntegrationId: "TRANSACTIONAL_EMAIL"` e um timeout
próprio de 8s). Nenhum corpo de resposta do provider é logado — só o `status` sanitizado, via
`ExternalServiceError`, que já existia e nunca guarda header/payload/segredo.

**Remetente**: `EMAIL_VERIFICATION_FROM` é um endereço transacional próprio do domínio
**verificado na Resend** (`contas@mail.spartagg.com.br`, documentado em
`.env.production.example`) — subdomínio `mail.`, não o apex `spartagg.com.br`, que é o que a
Resend confirmou como domínio verificado para o envio de produção. **Não**
`suporte@spartagg.com.br` — esse continua sendo o canal humano, conforme instrução explícita, e
não precisa estar no mesmo domínio verificado da Resend porque nunca é usado como envelope
`from`. `EMAIL_PROVIDER_REPLY_TO` (opcional) aponta de volta pro suporte no apex, sem misturar os
dois papéis: `from` sai sempre de `mail.spartagg.com.br`, `reply-to` sai sempre de
`spartagg.com.br`.

**Correção pontual pós-implementação**: a primeira versão desta etapa documentou o remetente como
`contas@spartagg.com.br` (apex), presumindo que o domínio verificado seria o mesmo do site. O
domínio real verificado no painel da Resend é o subdomínio `mail.spartagg.com.br` — corrigido em
`.env.production.example` e nesta doc; `EMAIL_VERIFICATION_URL_BASE`/`PASSWORD_RESET_URL_BASE`
continuam apontando pro apex (`spartagg.com.br/confirmar-email`,
`spartagg.com.br/redefinir-senha`), porque são URLs das páginas públicas do site, não endereços de
e-mail — não precisam estar no domínio verificado da Resend. Confirmação de e-mail e recuperação
de senha usam **o mesmo** `EMAIL_VERIFICATION_FROM` — `defaultEmailProviderForEnvironment`
constrói uma única instância de `ResendTransactionalEmailProvider` a partir dessa variável, e as
duas rotas (`sendEmailVerification`/`sendPasswordReset`) chamam a mesma instância; não existe
segunda variável de remetente em nenhum ponto do código. Nenhum DNS foi alterado, nenhum provider
trocado, nenhuma caixa de e-mail criada — correção só de configuração/documentação.

**DNS**: nenhum valor foi inventado. O painel da Resend informa os registros SPF/DKIM exatos para
`mail.spartagg.com.br` — isso já foi feito pelo owner; a pendência restante é só gerar e configurar
a `EMAIL_PROVIDER_API_KEY` real no cofre de produção.

## Templates

`apps/api/src/modules/auth/email-templates.ts` — dois templates (`renderEmailVerificationMessage`,
`renderPasswordResetMessage`), cada um com versão texto **e** HTML. Sem imagem, sem script, sem
CSS externo — o link aparece como texto puro além do botão, então o e-mail continua utilizável em
cliente com imagens bloqueadas (requisito explícito do pedido). Conteúdo: nome da Sparta GG, ação
pedida, CTA/link, prazo de expiração, instrução pra ignorar se não foi o usuário que pediu, contato
de suporte. Sem linguagem de marketing.

## Política de tokens (recuperação de senha)

`PasswordResetToken` (`apps/api/prisma/migrations/20260814210000_password_reset_tokens/`) espelha
exatamente `EmailVerificationToken`: `tokenHash` (SHA-256, único), `expiresAt`, `consumedAt`,
`revokedAt`, índice em `(userId, createdAt)`. `password-reset.ts` reaproveita o mesmo desenho de
`email-verification.ts`:

- **Entropia**: 32 bytes aleatórios (`randomBytes(32).toString("base64url")`) — mesma fonte que os
  tokens de sessão e de verificação de e-mail já usavam.
- **Hash em persistência**: só o SHA-256 do token é gravado; o token bruto nunca toca o banco.
- **Uso único**: consumo é um `updateMany` com `WHERE consumedAt IS NULL AND revokedAt IS NULL AND
  expiresAt > now` — a mesma linha só pode ser reivindicada por uma chamada; a segunda tentativa
  simultânea do mesmo token bate `count !== 1` e falha. Testado com `Promise.all` de duas
  confirmações concorrentes do mesmo token: **só uma vence**.
- **Expiração**: `PASSWORD_RESET_TOKEN_TTL_MINUTES` (padrão 30 min — mais curto que o de e-mail
  por ser um token que troca senha, superfície mais sensível).
- **Invalidação em cascata**: emitir um novo token revoga qualquer token anterior ainda válido do
  mesmo usuário (`revokedAt = now`); um reenvio realmente invalida o link antigo, testado.
- **Anti-enumeração**: `POST /auth/password-reset/request` sempre devolve a mesma resposta neutra
  (202, mesma frase), exista ou não a conta, tenha ou não senha local — a diferença observável é
  zero, testado em nível de rota.
- **Rate limit**: cooldown (`PASSWORD_RESET_RESEND_COOLDOWN_SECONDS`, 60s) + teto por hora
  (`PASSWORD_RESET_MAX_PER_HOUR`, 5) na mesma transação serializável que decide criar o token —
  mesma técnica de `email-verification.ts`, sem criar um segundo mecanismo de rate limit.
- **Falha do provider não é falso sucesso**: se `sendPasswordReset` lançar, `issuePasswordReset`
  captura o erro e devolve `deliveryStatus: "UNAVAILABLE"` — o token já foi persistido (pra não
  perder a tentativa), mas a chamada nunca finge que o e-mail saiu.

## Política de sessão após redefinição

**Decisão de segurança, aplicada sem exceção**: `confirmPasswordReset` troca `passwordHash` **e**
incrementa `sessionVersion` na mesma transação que consome o token. Como o token de sessão HMAC já
carrega a `sessionVersion` no payload (`ver`, ver `token.ts`, existente desde o início do projeto),
qualquer sessão emitida antes da redefinição passa a falhar em `verifyToken`/`getAuthenticatedUser`
imediatamente — sem esperar expirar. Validado contra o Postgres real: um token de sessão emitido
**antes** do reset, usado depois do reset, devolve `401` no `/auth/me`. Nenhuma exceção
documentada — não havia razão arquitetural pra permitir sessão sobrevivendo a uma troca de senha.

## Rotas novas

Ambas em `apps/api/src/modules/auth/routes.ts`, classificadas `PUBLIC` na matriz de autorização
(`authorization-policy.ts`) — mesma classificação das rotas de verificação de e-mail, e pelo mesmo
motivo: não têm sessão pra proteger, são o próprio mecanismo de autenticação por token.

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `POST /auth/password-reset/request` | `{ email }` | `202`, sempre a mesma resposta neutra |
| `POST /auth/password-reset/confirm` | `{ token, password }` | `200 { status: "PASSWORD_RESET" }` ou `400 { code: "PASSWORD_RESET_INVALID" }` |

`password` passa pelo mesmo schema mínimo de 8 caracteres do cadastro (`registerSchema`).

## Mudanças no Desktop

Sem redesign — só componentes já existentes do design system (`AuthLayout`, `AuthForm`, `Field`,
`TextField`, `Button`, `SignalChip`).

- **`ForgotPasswordScreen.tsx`** (novo): só o *pedido* de redefinição (o usuário digita o email
  aqui — é onde ele está quando percebe que esqueceu a senha). O *consumo* do token (definir a
  nova senha) acontece na página pública, não no Desktop — sem deep link envolvido.
- **`AuthScreen.tsx`**: link "Esqueci minha senha", visível só no modo login.
- **`App.tsx`**: novo `SessionStatus` `"forgot-password"`, roteado a partir da tela de login.
- **`EmailVerificationScreen.tsx`**: botão "Já confirmei, verificar novamente", visível só quando
  existe `sessionToken` (ou seja, quando o usuário chegou aqui *depois* de logar — a mesma tela é
  reusada tanto logo após o cadastro, sem sessão, quanto após login com conta ainda não
  confirmada). O botão reconsulta `/auth/me` via `refreshOnboarding()`, já existente. Sem token
  (logo após o cadastro), o caminho continua sendo "Voltar para entrar" — logar de novo já leva de
  volta a essa mesma tela, agora com sessão, onde o botão aparece.

**Decisão de segurança deliberadamente não revertida**: o pedido de resend/registro
(`POST /auth/email-verification/resend`, `/auth/register`) continua com resposta 100% neutra — não
foi adicionado `deliveryStatus` (SENT/UNAVAILABLE/etc.) a essas respostas, apesar do pedido citar
"provider indisponível" como estado de UI desejável. Motivo: qualquer sinal que apareça só quando a
conta existe e está desverificada (e não apareça pra conta inexistente/já verificada) é um oráculo
de enumeração de 1 bit — exatamente o que essas rotas foram desenhadas pra eliminar. O estado
"provider indisponível" continua coberto onde é seguro mostrá-lo: dentro do `ForgotPasswordScreen`,
que já está numa resposta 100% neutra por natureza (a mensagem é sempre a mesma, só o texto muda,
nunca revelando SENT vs UNAVAILABLE por trás). Registrado aqui em vez de implementado às pressas
pra não reabrir um problema que o próprio código já tinha fechado.

## Site: duas páginas novas, `noindex`

`apps/site/confirmar-email.html` e `redefinir-senha.html` — Spartan Signal, sem framework, cada
uma com um módulo TS próprio (`confirmar-email.ts`, `redefinir-senha.ts`) que lê `?token=` da URL
e chama a API via `fetch`. `noindex` nas duas (não são conteúdo pra descobrir por busca, só
alcançáveis pelo link do e-mail) — por isso ficam **fora do sitemap.xml**, deliberadamente,
diferente das outras páginas públicas. Primeiro formulário real do site: `.sp-form`/`.sp-field`
novos em `site.css`, mesma linguagem geométrica (rótulo mono versal, canto quase reto) das outras
seções.

**CSP**: `connect-src` ganhou `https://api.spartagg.com.br` (o host já reservado desde a Etapa
31K) — as duas únicas páginas do site que fazem `fetch`. Enquanto a API pública não existe, a
chamada falha honestamente com erro de rede, o mesmo comportamento correto de qualquer outra parte
do produto que depende da API pública ainda não implantada.

**Erro corrigido no caminho**: a primeira versão de `confirmar-email.html` tinha um `style=`
inline (`margin-top`) — violaria a própria CSP do site (`style-src 'self'` sem `unsafe-inline`,
travada por teste desde a Etapa 31M) e teria silenciosamente não funcionado em produção. Corrigido
antes de qualquer commit, usando a classe `.sp-btn-row` já existente em vez de um atributo `style`.

## Configuração de produção

`.env.production.example` atualizado com os nomes reais de variável (nenhum segredo real):
`EMAIL_PROVIDER_MODE`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_PROVIDER_REPLY_TO`,
`EMAIL_VERIFICATION_FROM`, `EMAIL_VERIFICATION_URL_BASE` (agora `/confirmar-email`, não mais o
`/verify-email` que nunca existiu), `PASSWORD_RESET_URL_BASE`,
`PASSWORD_RESET_TOKEN_TTL_MINUTES`, `PASSWORD_RESET_RESEND_COOLDOWN_SECONDS`,
`PASSWORD_RESET_MAX_PER_HOUR`. `loadEnv` (`apps/api/src/config/env.ts`) ganhou duas checagens
novas de boot em produção: `EMAIL_PROVIDER_API_KEY` obrigatória quando o modo é `EXTERNAL`, e
`PASSWORD_RESET_URL_BASE` HTTPS explícita — a API **recusa subir** em produção sem as duas,
mesma filosofia que já existia pra `EMAIL_VERIFICATION_FROM`/`URL_BASE`. Ambiente de
desenvolvimento/teste continua livre de usar `IN_MEMORY` + `LOCAL_EMAIL_PREVIEW_ENABLED` (só fora
de produção; produção nunca aceita esses dois, checagem já existente desde a Etapa 31D).

## Testes

**48 no módulo `auth` da API**, incluindo os novos:

- `password-reset.test.ts` (10): token persiste só o hash, troca de senha real + invalidação de
  sessão, reuso de token rejeitado, token expirado rejeitado, token inválido/inexistente
  rejeitado, resend invalida o token anterior, cooldown sem criar token novo, limite por hora,
  conta inexistente/sem senha local não gera token mas responde igual, falha do provider não vira
  falso `SENT`, dois consumos simultâneos do mesmo token — só um vence.
- `resend-email-provider.test.ts` (5): payload/headers corretos, os dois tipos de mensagem, erro
  4xx/5xx propagado sem vazar corpo da resposta, erro de rede tratado como falha (não sucesso
  silencioso), `isConfigured()`.
- `routes.test.ts` (+5): pedido de reset não enumera conta existente vs inexistente, token
  inválido/expirado devolve erro genérico, confirmação com token válido funciona, senha fraca é
  rejeitada antes de consumir o token.
- `email-provider.test.ts` (+4): boot de produção recusa sem `EMAIL_PROVIDER_API_KEY` mesmo com
  modo `EXTERNAL` declarado, recusa sem `PASSWORD_RESET_URL_BASE` HTTPS, constrói o provider real
  quando configurado, cai pra indisponível quando `EXTERNAL` está declarado sem chave.

**Desktop**: `ForgotPasswordScreen.test.tsx` (4 — pedido neutro, token de preview só em ambiente
local, erro de rede não finge sucesso, navegação de volta), `EmailVerificationScreen.test.tsx` (3 —
botão de reconsulta ausente sem sessão, presente e funcional com sessão, reenvio mostra a mensagem
neutra do servidor).

**Site**: 15 testes novos em `routes-and-support.test.ts` cobrindo as duas páginas (arquivo
existe, listada no build, `noindex`, canonical na URL limpa, formulário/token presentes, ausência
de qualquer link pra área de conta completa) e a exclusão explícita do sitemap.

## QA end-to-end real (não simulado)

Contra o container Docker da API reconstruído com o código desta etapa, Postgres real,
`EMAIL_PROVIDER_MODE=IN_MEMORY` + `LOCAL_EMAIL_PREVIEW_ENABLED=true` temporário só pra obter o
token bruto de teste (revertido do `.env` local antes do commit — `.env` nunca é versionado):

1. `POST /auth/register` → token de preview → `POST /auth/email-verification/confirm` → `200`.
2. Login com a senha original → sucesso, token de sessão A emitido.
3. `POST /auth/password-reset/request` → token de preview → `POST /auth/password-reset/confirm`
   com nova senha → `200 { status: "PASSWORD_RESET" }`.
4. Login com a senha **antiga** → `401`.
5. Login com a senha **nova** → sucesso, token de sessão B emitido.
6. `GET /auth/me` com o token de sessão **A** (emitido antes do reset) → `401` — confirma a
   invalidação de sessão em cima do Postgres real, não só em teste unitário mockado.
7. Reenvio do mesmo token de reset já consumido → `400`.
8. Sem `LOCAL_EMAIL_PREVIEW_ENABLED` (config revertida): `POST /auth/password-reset/request` pra
   uma conta que **de fato existe** no banco continua sem revelar nenhum token na resposta —
   confirma que o preview é estritamente opt-in de ambiente não-produtivo.

Todos os 8 passos bateram o resultado esperado. Reconstrução do Docker validou também que a nova
migration (`PasswordResetToken`) aplica limpo via `prisma migrate deploy` e que o boot da API
falha corretamente sem policy de autorização pras rotas novas (achado real: as duas rotas
precisaram de entrada explícita em `authorization-policy.ts` — o boot falhou com "Rotas sem
politica de autorizacao" até isso ser corrigido, confirmando que essa trava da Etapa 31C continua
ativa e funcionando).

**Não testado nesta etapa** (fora do que os testes automatizados exigiam): validação contra um
provider Resend real com credencial real do owner — não existe conta Resend provisionada. QA
visual do Desktop em Electron/CDP das duas telas novas (`ForgotPasswordScreen`,
`EmailVerificationScreen` atualizada) não foi executada nesta sessão; coberta por teste de
componente (`@testing-library/react`), não por captura visual real.

## Validação completa

`pnpm install --frozen-lockfile`, `version:check` (8 superfícies em 0.9.0), `prisma migrate
deploy` (25 migrations aplicadas, incluindo a nova), `typecheck`/`lint`/`build` nos 5 pacotes,
Docker build + restart da API real com healthcheck 200, analyzer Python 1/1. **1411 testes**
TypeScript no monorepo (raiz 21, site 117 — eram 102 —, core 635, riot 98, api 376 — eram 353 —,
desktop 164 — eram 157). `packages/riot` não ganhou teste novo: a nova `IntegrationId:
"TRANSACTIONAL_EMAIL"` e o timeout `transactionalEmailMs` são aditivos ao enum/objeto existentes,
sem contrato próprio isolado — cobertos indiretamente pelos testes do adaptador Resend em
`apps/api`, que de fato os exercita.

Nenhum arquivo de `packages/core`, do motor de recomendação, de release ou de replay foi tocado —
confirmado pelo escopo do diff antes do commit (só `apps/api/src/modules/auth/*`,
`apps/api/src/config/env.ts`, `apps/api/prisma/*`, `packages/riot/src/http/*` de forma aditiva,
`apps/site/*`, telas de auth do Desktop, `eslint.config.js`, `.env.production.example`). Sem
caminho pelo qual essa etapa pudesse ter afetado recomendação, dashboard, champion select,
histórico ou laboratório.

## Bugs reais encontrados e corrigidos no caminho

1. **Boot falhava**: as duas rotas novas não tinham entrada em `authorization-policy.ts` — a
   trava estrutural da Etapa 31C ("toda rota tem política, boot falha se faltar") pegou
   corretamente. Corrigido classificando as duas como `PUBLIC`.
2. **Estilo inline em `confirmar-email.html`**: violaria a CSP do site em produção (mesma classe
   de bug já fechada na Etapa 31M). Corrigido antes do commit.
3. **Segundo alerta de teste duplicado**: a primeira tentativa de resolver `@sparta/riot/http`
   nos testes do `apps/api` falhou porque `vitest.config.ts` só tinha alias pra `@sparta/riot`
   (raiz), não pro subpath `/http` — mesmo padrão que `apps/desktop/vitest.config.ts` já resolvia
   corretamente. Corrigido adicionando o alias que faltava.
4. **`.env` local corrompido durante um teste manual**: um `echo >>` sem quebra de linha final
   concatenou uma variável nova direto no valor de `AUTH_TOKEN_SECRET`. Percebido e corrigido na
   hora, antes de qualquer outro comando depender do arquivo; `.env` nunca é versionado, então
   isso não teve nenhum efeito além da própria sessão local.

## O que fica fora, deliberadamente

RSO, Riot Production Key, polish visual, screenshots, site visual além das duas páginas mínimas,
sistema de tickets, área de conta web, analytics, o warning OpenSSL do Prisma, logout local sem
API, indisponibilidade por fonte no pós-game, limite de bytes de download — nenhum desses foi
tocado, conforme escopo explícito do pedido.
