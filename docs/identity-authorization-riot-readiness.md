# Identidade Riot, autorização e prontidão RSO

Estado em 2026-08-05:

```text
AUTHORIZATION_HARDENED
BLOCKED_BY_RIOT_APPROVAL
BLOCKED_BY_OWNER_DECISIONS
```

Não houve solicitação à Riot, uso de credencial real, provisionamento de nuvem, compra de
domínio, publicação de API, restauração do instalador ou alteração do motor/replay.

## Modelo de identidade

`User` é a identidade Sparta e autentica com o bearer próprio da aplicação. `RiotAccount` é um
recurso subordinado, com no máximo um vínculo não nulo por usuário. O PUUID é identificador
interno; parâmetros antigos com PUUID/Riot ID só são aceitos quando coincidem com a conta
derivada do `sub` autenticado.

Estados persistidos:

- `UNVERIFIED_LEGACY`: vínculo por Riot ID/Account-V1, sem prova de propriedade;
- `PENDING_VERIFICATION`: autorização RSO iniciada e ainda não concluída;
- `VERIFIED_BY_RSO`: callback oficial resolveu a identidade do próprio login via Account-V1
  `/riot/account/v1/accounts/me`;
- `REVOKED`: acesso pessoal revogado, histórico preservado sem ficar consultável;
- `REQUIRES_REAUTHENTICATION`: verificação anterior não pode mais ser renovada e exige novo RSO.

A migration `20260805210000_riot_identity_authorization` marca toda linha existente como
`UNVERIFIED_LEGACY`. Não há inferência por email, Riot ID, PUUID, histórico ou posse do desktop.
`verifiedAt`, método e hash de evidência permanecem nulos até callback RSO válido.

## Modos e feature gate

- `LOCAL_CONTROLLED`: preserva Champion Select e fluxos locais com legado explicitamente não
  verificado. Revogado/reauth continuam bloqueados.
- `TEST`: handlers podem ser isolados; testes de segurança habilitam o gate central
  explicitamente.
- `RSO_REQUIRED`: único modo aceito em `NODE_ENV=production`; somente `VERIFIED_BY_RSO` acessa
  dados pessoais. Produção também exige `RSO_ENABLED`, client ID e callback HTTPS.

O endpoint legado de vínculo é recusado em produção com erro estruturado. Ausência do provedor
RSO retorna `RSO_NOT_CONFIGURED`; não há fallback silencioso para Riot ID.

## Fluxo RSO preparado, não ativado

1. Usuário Sparta autenticado chama `POST /auth/riot/rso/start`.
2. Backend cria `state` aleatório, persiste somente SHA-256, associa a transação ao `userId`,
   callback e expiração de dez minutos.
3. O navegador é enviado ao endpoint oficial `https://auth.riotgames.com/authorize` com
   `response_type=code` e escopos oficiais documentados `openid offline_access`.
4. `GET /auth/riot/rso/callback` reivindica a transação uma única vez antes da troca do code.
5. Um `RiotIdentityProvider` server-side futuro troca o code conforme as instruções privadas do
   onboarding e consulta Account-V1 `/accounts/me`.
6. A claim é validada; associação já pertencente a outro usuário recebe 409 genérico; sucesso
   registra `VERIFIED_BY_RSO` e apenas um hash canônico de evidência.

O adaptador real não existe e o provider default permanece indisponível. Não foram inventados
client secret, endpoint de token, PKCE, refresh token ou credencial de teste. Authorization code,
access token e refresh token nunca são persistidos, logados, devolvidos ao renderer ou incluídos
em replay bundles. Até a Riot fornecer credenciais/instruções oficiais, renovação significa novo
fluxo interativo; falha após vínculo verificado leva a `REQUIRES_REAUTHENTICATION`.

`POST /auth/riot/revoke` muda o vínculo para `REVOKED`, limpa evidência de verificação e impede
novas leituras pessoais. Não apaga silenciosamente histórico: exclusão de conta é outro processo,
ainda dependente das decisões do titular.

## Proteções

- callback ligado ao usuário iniciador, sem `userId`/PUUID aceito do cliente;
- vínculo existente só pode ser confirmado pelo mesmo PUUID; identidade diferente no callback é
  rejeitada, sem troca silenciosa;
- `state` de alta entropia, somente hash persistido, expiração e consumo atômico;
- callback repetido/expirado/forjado recebe erro genérico;
- falha de verificação preserva `REVOKED` e converte vínculo antes verificado em
  `REQUIRES_REAUTHENTICATION`, nunca em legado com acesso controlado;
- uma identidade Riot não pode ser reassociada entre usuários;
- um usuário não pode manter duas contas Riot vinculadas;
- acesso cruzado por PUUID, Riot ID ou ID de recurso recebe 404 quando isso evita enumeração;
- rotas pessoais exigem estado compatível; administrativas/internas não existem na superfície
  pública de produção;
- logs já removem Authorization/cookies e a nova integração não registra code/token/PUUID;
- `ReplayInputBundle` não foi alterado e continua sem PUUID/credencial.

A auditoria completa está em `docs/route-authorization-audit.md`.

## Compatibilidade e invariantes

Esta etapa não modifica pesos, ranking, seleção, hashes funcionais, snapshots,
`ReplayInputBundle`, algoritmo de replay, Champion Select local nem releases operacionais. A
release `release-etapa27c-v1` deve continuar `ACTIVE`, e o replay de referência deve continuar
`EXACT_REPLAY`; esses fatos são verificados antes e depois da migration local.

Validação local concluída em 2026-08-06: a migration
`20260805210000_riot_identity_authorization` foi aplicada sem rollback; não existe usuário com
mais de um `RiotAccount`; o vínculo preexistente ficou `UNVERIFIED_LEGACY`, sem `verifiedAt`, método
ou evidência de verificação. A release `release-etapa27c-v1` permaneceu `ACTIVE`, com
`artifactHash=8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90`,
`configHash=fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38` e
`validatedArtifactHash == artifactHash`; os cinco bundles verificados mais recentes permaneceram
`EXACT_REPLAY`.

## Bloqueadores

Dependem da Riot:

- registro/aprovação do produto e Production Level API key;
- habilitação do RSO, client ID, método de autenticação do cliente e instruções de token;
- confirmação do uso proposto de Account-V1, Match-V5 e LCU read-only;
- limites/obrigações finais de retenção e exclusão comunicados no onboarding.

Dependem do titular do produto:

- nome legal do responsável/entidade e jurisdição;
- domínio público e URLs HTTPS de produto, callback, privacidade e termos;
- email/canal público de suporte e contato de privacidade;
- prazos de retenção por categoria e SLA/processo de exclusão;
- público-alvo/classificação etária e países de oferta;
- imagens finais e URL de demonstração do protótipo;
- decisão operacional para administração interna da API.

Enquanto esses itens estiverem abertos, o pacote está estruturalmente preparado, mas não deve ser
marcado `READY_FOR_RIOT_SUBMISSION` nem enviado.
