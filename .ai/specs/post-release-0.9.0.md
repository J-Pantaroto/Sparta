# Etapa 31 — pós-release do Sparta Desktop 0.9.0

Fonte de verdade: `docs/post-release-0.9.0.md`.

Resultado em 2026-08-05:

```text
WITHDRAWAL_REQUIRED
MONITORING_LIMITED_BY_MISSING_PUBLIC_API
```

O artefato público é íntegro e instala/atualiza/desinstala corretamente, mas o desktop
congelado usa `http://localhost:3333` e não existe API pública. Autenticação, recomendações,
históricos e laboratório ficam indisponíveis ao usuário externo. Na conclusão original da Etapa
31, a release ainda não havia sido retirada; tag, anexos, prerelease, release operacional e replay
foram preservados naquele checkpoint.

Atualização: a Etapa 31A posteriormente executou a retirada autorizada. Somente o instalador foi
removido; tag, release e cinco documentos de auditoria permanecem. Estado atual:
`WITHDRAWN_PENDING_PUBLIC_API`. Ver `docs/release-withdrawal-0.9.0.md`.
