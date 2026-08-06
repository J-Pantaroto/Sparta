# Identity / authorization / Riot readiness

Fonte normativa completa: `docs/identity-authorization-riot-readiness.md` e auditoria rota a rota
em `docs/route-authorization-audit.md`.

- Produção usa exclusivamente `IDENTITY_MODE=RSO_REQUIRED`.
- Vínculos anteriores são `UNVERIFIED_LEGACY`; nunca são promovidos retroativamente.
- Dados pessoais exigem `VERIFIED_BY_RSO` em produção.
- O proprietário sempre deriva do `sub` Sparta; IDs recebidos apenas conferem o recurso.
- Divergência de proprietário responde 404 quando revelar existência permitiria enumeração.
- RSO é uma interface de provedor server-side; o adaptador real permanece ausente até aprovação.
- `state` é single-use/expirável e somente seu hash é persistido; code/tokens nunca são
  persistidos, logados, enviados ao renderer ou ao replay.
- Callback não troca o PUUID de vínculo existente; falha preserva `REVOKED` ou exige
  reautenticação, sem reativação por downgrade.
- `REVOKED` e `REQUIRES_REAUTHENTICATION` bloqueiam até em modo controlado.
- Laboratório/release/replay import são internos ou administrativos e fechados em produção.
- Migration local aplicada sem rollback: vínculo anterior em `UNVERIFIED_LEGACY`, nenhuma
  associação duplicada, release/hashes intactos e cinco verificações recentes em `EXACT_REPLAY`.
- Estado 31C: `AUTHORIZATION_HARDENED`, `BLOCKED_BY_RIOT_APPROVAL`,
  `BLOCKED_BY_OWNER_DECISIONS`.
