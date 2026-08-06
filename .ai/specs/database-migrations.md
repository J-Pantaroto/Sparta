# Política de migrations

Etapa 31D: migration aditiva aplicada por deploy, três usuários legados e zero confirmação
retroativa. A consulta de reenvio usa o índice `(userId, createdAt)` medido por `EXPLAIN`.
Uma segunda migration cria unicidade em `LOWER(email)` para preservar caixa legada sem permitir
identidades equivalentes; não havia duplicatas.

`20260805210000_riot_identity_authorization` migra para `UNVERIFIED_LEGACY`, nunca para verificado,
e adiciona unicidade/estado RSO sem armazenar code/token. Não toca artefatos ou replay.

Como o schema do Postgres evolui no Sparta, o que é permitido fazer com uma
migration já aplicada, e como a base é levada a um ambiente novo.

## Regras

1. **Migration aplicada não é reescrita.** Uma vez que um arquivo em
   `apps/api/prisma/migrations/` rodou contra um ambiente real, o conteúdo dele
   é histórico. Corrigir um erro se faz com uma migration **nova**, nunca
   editando a anterior — reescrever quebra a verificação de checksum do Prisma
   em qualquer base que já a aplicou, e a discrepância só aparece no próximo
   deploy, longe da causa.
2. **Histórico não é apagado.** `_prisma_migrations` é registro de auditoria:
   ele conta o que aconteceu, incluindo tentativa que falhou. Limpar linha de lá
   para "deixar bonito" destrói a única evidência de que uma aplicação foi
   parcial.
3. **`migrate dev` não roda contra ambiente real.** Ele compara, reseta e
   regenera; num banco com dado de verdade isso é destrutivo. O comando de
   aplicação é sempre `migrate deploy`, que só aplica o que está pendente e
   nunca reseta.
4. **Coluna nova em tabela com dado nasce nullable**, ou com default explícito.
   O padrão do projeto para eco de configuração e proveniência é nullable sem
   backfill: linha antiga fica nula e é servida como "não informado", nunca
   preenchida retroativamente com valor inventado.
5. **Índice só entra com evidência de plano.** Ver `docs/security-audit.md`,
   seção de banco: cada índice criado nesta base tem o `EXPLAIN ANALYZE` de
   antes e depois registrado. Índice especulativo custa escrita e espaço sem
   contrapartida medida.

## Aplicar em um ambiente novo

Com o container da API já construído e o Postgres de pé:

```bash
docker compose exec -T api sh -c 'cd /app/apps/api && ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma'
```

O comando é idempotente: rodar de novo com tudo aplicado responde
`No pending migrations to apply.` A imagem multi-stage carrega o CLI do Prisma
e o schema justamente para que a aplicação de migration não precise de uma
segunda imagem nem de acesso ao host.

Fora do container (desenvolvimento local, com `DATABASE_URL` no ambiente):

```bash
npx pnpm@10.34.4 --filter @sparta/api prisma migrate deploy --schema prisma/schema.prisma
```

Depois de aplicar em base vazia, o seed do catálogo e das tags é separado e
idempotente:

```bash
npx pnpm@10.34.4 --filter @sparta/api catalog:sync
npx pnpm@10.34.4 --filter @sparta/api prisma:seed
```

## A migration `20260727234500_http_cache_states` com marca de rollback

`_prisma_migrations` tem **duas** linhas para esse nome. Isso foi levantado como
achado informativo na auditoria da Etapa 28a com a suspeita de que a migration
estivesse pela metade. **A suspeita estava errada**, e a verificação direta é
esta:

| Início                | Fim                   | Rollback              | Passos |
| --------------------- | --------------------- | --------------------- | ------ |
| `2026-07-28 00:12:31` | —                     | `2026-07-28 00:13:56` | 0      |
| `2026-07-28 00:14:03` | `2026-07-28 00:14:03` | —                     | 1      |

A primeira linha é uma tentativa que **nunca terminou** (`applied_steps_count =
0`, sem `finished_at`) e foi corretamente marcada como revertida. A segunda é a
aplicação bem-sucedida, 92 segundos depois. O efeito da migration está no
schema: a coluna `ApiCacheEntry.collectedAt` existe.

Ou seja: o estado é **consistente**, e `migrate status` reportar "up to date"
não é uma máscara — é o fato. Uma base nova aplica o arquivo uma vez e chega ao
mesmo schema.

**O que fazer com essa linha: nada.** Ela é o registro honesto de uma tentativa
que falhou e foi refeita. Apagá-la violaria a regra 2 sem entregar nada — não
há divergência de schema para corrigir. O que a torna inofensiva é exatamente o
que a torna útil: o Prisma considera pendente apenas migration sem linha
concluída, e essa tem uma.

## Verificar o estado atual

```bash
docker compose exec -T postgres psql -U sparta -d sparta -c "SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at;"
```

Linha com `rolled_back_at` preenchido **e sem** uma segunda linha concluída para
o mesmo nome é o caso que exige atenção: significa que a migration não está
aplicada, e o Prisma vai tentar aplicá-la de novo no próximo `deploy`. Não é o
caso desta base.
