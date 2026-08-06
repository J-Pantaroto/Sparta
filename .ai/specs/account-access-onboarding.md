# Acesso obrigatório, confirmação de email e onboarding Riot

Fonte de verdade: `docs/account-access-onboarding.md`.

Etapa 31D: o backend calcula `EMAIL_UNVERIFIED`, `EMAIL_VERIFIED_RIOT_UNLINKED`,
`RIOT_LINK_PENDING`, `RIOT_LINK_REQUIRES_REAUTHENTICATION` ou `READY`. Rotas pessoais e shell
exigem `READY`; produção aceita apenas Riot `VERIFIED_BY_RSO`.

Tokens de email são aleatórios, persistidos somente por hash, de uso único, expiráveis, ligados ao
email vigente, com cooldown, limite e revogação de emissões anteriores. Respostas de cadastro e
reenvio são neutras. Produção falha sem provider transacional real.

O desktop não tem convidado/skip, usa o progresso Conta → Email → Riot → Pronto e persiste o bearer
cifrado pelo `safeStorage` do Electron. Local Riot exige flag explícita e nunca vira verificação RSO.

Estados: `ACCOUNT_ACCESS_HARDENED`, `EMAIL_VERIFICATION_READY`, `ONBOARDING_READY`, com produção
`BLOCKED_BY_EMAIL_PROVIDER_CONFIGURATION` e `BLOCKED_BY_RIOT_APPROVAL`.

Verificação: migration sem backfill, gate real 403 para conta legada, recomendação controlada
idêntica, release operacional ativa, `EXACT_REPLAY` sem divergências, 1.142 testes TypeScript e 1
Python, typecheck/lint/build verdes.
