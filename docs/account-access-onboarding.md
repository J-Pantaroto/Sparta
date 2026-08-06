# Acesso obrigatório, confirmação de email e onboarding Riot

## Estado da Etapa 31D

- `ACCOUNT_ACCESS_HARDENED`
- `EMAIL_VERIFICATION_READY`
- `ONBOARDING_READY`
- produção: `BLOCKED_BY_EMAIL_PROVIDER_CONFIGURATION`
- produção: `BLOCKED_BY_RIOT_APPROVAL`

O shell e todas as rotas pessoais exigem uma conta ativa, email confirmado e vínculo Riot aceito
para o ambiente. Não existe acesso convidado, anônimo ou “vincular depois”. A release 0.9.0, a
configuração operacional do motor, pesos, hashes, snapshots e replay não foram alterados.

## Estado calculado pelo backend

`GET /auth/onboarding-status` e `GET /auth/me` retornam um estado derivado dos fatos persistidos:

| Estado                                | Próxima etapa        |
| ------------------------------------- | -------------------- |
| `EMAIL_UNVERIFIED`                    | `EMAIL_VERIFICATION` |
| `EMAIL_VERIFIED_RIOT_UNLINKED`        | `RIOT_LINK`          |
| `RIOT_LINK_PENDING`                   | `RIOT_LINK`          |
| `RIOT_LINK_REQUIRES_REAUTHENTICATION` | `RIOT_LINK`          |
| `READY`                               | nenhuma              |

`READY` requer usuário autenticado e ativo, email confirmado e vínculo Riot aceito. Em produção,
somente `VERIFIED_BY_RSO` é aceito. `UNVERIFIED_LEGACY` continua preservado, mas não é promovido
retroativamente. Revogação Riot retira o acesso imediatamente.

Rotas pessoais respondem `403` com
`{ code: "ONBOARDING_INCOMPLETE", requiredStep: "EMAIL_VERIFICATION" | "RIOT_LINK" }`. As rotas
de login, confirmação, estado, logout, mudança de email e vinculação continuam alcançáveis na etapa
correspondente. Identificadores de outra conta permanecem ocultos com `404`.

## Confirmação de email

Endpoints:

- `POST /auth/register`: resposta `202` neutra; não revela se o email já existe;
- `POST /auth/email-verification/resend`: mesma resposta neutra, com cooldown e limite por hora;
- `POST /auth/email-verification/confirm`: consome um token válido uma única vez;
- `PATCH /auth/account/email`: exige a senha atual, reinicia a confirmação e revoga sessões antigas;
- `POST /auth/logout`: incrementa a versão da sessão e invalida os bearers anteriores.

O token possui 32 bytes aleatórios, existe em claro apenas para montar a mensagem e só seu SHA-256
é persistido. Ele expira, é de uso único, é ligado ao usuário e ao email vigente, e uma nova emissão
revoga as anteriores. Tokens, links, códigos, cookies e headers de autorização não entram nos logs;
auditoria usa somente uma referência opaca do usuário e o resultado da entrega.

O contrato `TransactionalEmailProvider` desacopla a entrega. `IN_MEMORY` existe somente para teste
ou desenvolvimento explícito. Produção exige `EMAIL_PROVIDER_MODE=EXTERNAL`, remetente e URL HTTPS,
e ainda falha no boot enquanto uma implementação real não for injetada. Nenhum remetente ou
serviço externo foi inventado nesta etapa.

Essas decisões seguem as recomendações de token aleatório, uso único, validade curta, resposta
uniforme e rate limit do [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
e do [OWASP Email Validation and Verification Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html).

## Desktop

O gate é único: `Conta → Email → Riot → Pronto`. A aplicação restaura a sessão antes de montar
conteúdo protegido, portanto não há flash do dashboard. O bearer deixou o `localStorage`; a cópia
persistida fica cifrada pelo `safeStorage` no processo principal do Electron (DPAPI no Windows), e
o renderer mantém apenas a cópia em memória necessária às chamadas da sessão. A chave legada é
apagada na primeira inicialização. Referência: [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

A tela Riot usa RSO quando configurado. Produção sem aprovação mostra o bloqueio e não fabrica Riot
ID. O vínculo por Riot ID só existe fora de produção com `LOCAL_RIOT_LINK_ENABLED=true`, aparece
como “ambiente local controlado” e nunca gera `VERIFIED_BY_RSO`.

O menu da conta oferece estado de acesso, email, Riot, sessão, revogação, mudança de email, logout e
o estado honesto da exclusão. Um perfil analítico completo e um redesign geral permanecem fora do
escopo.

## Persistência e compatibilidade

A migration `20260806162500_email_verification_onboarding` é aditiva. Ela criou
`EmailVerificationToken` e adicionou `emailVerifiedAt`, `isActive`, `sessionVersion` e `updatedAt` a
`User`. Na aplicação local havia três usuários legados e zero foi marcado como confirmado: não
houve backfill de propriedade. O plano da consulta de reenvio usa
`EmailVerificationToken_userId_createdAt_idx` por `Bitmap Index Scan`.

A migration complementar `20260806170000_case_insensitive_user_email` preserva login de conta
legada com caixa diferente e impede duas identidades equivalentes por um índice único em
`LOWER(email)`. Não havia duplicatas normalizadas antes da aplicação. Com apenas três usuários, o
planejador corretamente preferiu `Seq Scan`; o índice existe para integridade, não por ganho de
leitura alegado.

Mesmo usuário e senha continuam válidos para login, mas o usuário fica no gate de email até a
confirmação legítima. Vínculos Riot históricos e todos os dados analíticos permanecem intactos.

## Limitações honestas

Nenhum contrato comercial de email, credencial, domínio, site, VPS ou infraestrutura foi criado.
Nenhuma submissão à Riot foi feita. Assim, o fluxo funcional está pronto e coberto por provider em
memória, mas produção continua bloqueada simultaneamente pela configuração do provider real e pela
aprovação RSO.

## Verificação executada

- duas migrations aditivas aplicadas; três usuários legados, zero confirmações retroativas;
- `EXPLAIN` confirmou o índice de reenvio;
- API reconstruída: `/health` e `/ready` verdes;
- conta legada autenticada: `EMAIL_UNVERIFIED`; rota pessoal: `403 ONBOARDING_INCOMPLETE` com
  `EMAIL_VERIFICATION`;
- recomendação controlada preservada: Viego 58,7; Udyr 58,5; Vi 55,3; Nocturne 53,3; Graves 50,1;
- `release-etapa27c-v1` permaneceu `ACTIVE`, com os mesmos hashes de artefato e configuração;
- replay real: `EXACT_REPLAY`, zero divergências e zero dependências ausentes;
- 1.142 testes TypeScript e 1 teste Python aprovados; typecheck, lint e builds aprovados.
