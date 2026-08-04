# Runbook — publicação da API

Procedimento para colocar uma versão nova da API Sparta no ar e, só depois,
liberar o instalador correspondente.

**Nada aqui foi executado contra infraestrutura externa.** Os comandos são os
reais do projeto e foram exercitados contra o ambiente local; a publicação em si
é uma decisão separada.

Antes de começar, tenha em mãos o manifesto do candidato:
`artifacts/releases/<version>/sparta-release-manifest.json`. Ele é a fonte dos
digests e hashes citados abaixo — não use valores de memória.

## Ordem

A ordem importa. A API vai primeiro porque um desktop novo contra uma API velha
falha de formas silenciosas: rota que não existe, campo ausente tratado como
indisponível, e o usuário achando que é falta de dado.

## 1. Backup do banco

Sem isso, nenhuma das etapas seguintes é reversível.

```bash
docker compose exec -T postgres pg_dump -U sparta -d sparta -Fc > backup-$(date +%Y%m%d-%H%M%S).dump
```

Confirme que o arquivo tem tamanho plausível e que restaura num banco
descartável antes de prosseguir. Backup não testado não é backup.

## 2. Registrar o estado atual

O que está no ar agora, para poder voltar exatamente a isto.

```bash
docker image inspect sparta-api --format '{{.Id}}'
docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
```

```bash
docker compose exec -T postgres psql -U sparta -d sparta -c "SELECT r.\"releaseVersion\", r.status, r.\"artifactHash\", r.\"configHash\" FROM \"RecommendationEngineActivePointer\" p JOIN \"RecommendationEngineRelease\" r ON r.id = p.\"releaseId\";"
```

Guarde as duas saídas junto do backup. O digest da imagem anterior é o alvo do
rollback; a release ativa é o que precisa continuar igual depois.

## 3. Publicar a imagem

A imagem **não é reprodutível por digest** (ver `docs/release-reproducibility.md`):
reconstruir não produz o mesmo Image ID. Portanto publique **a imagem construída
pelo pipeline**, referenciada por digest, e não uma reconstrução no destino.

```bash
docker tag sparta-api:latest <registry>/sparta-api:<version>
docker push <registry>/sparta-api:<version>
```

Registre o digest devolvido pelo push e confirme que ele bate com
`api.imageDigest` do manifesto. Se não bater, **pare**: a imagem publicada não é
a que foi validada.

## 4. Aplicar migrations

Com o container da versão nova de pé e o Postgres saudável:

```bash
docker compose exec -T api sh -c 'cd /app/apps/api && ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma'
```

Idempotente: com tudo aplicado responde `No pending migrations to apply.`

Nunca `migrate dev` contra ambiente real — ele reseta. A política completa está
em `docs/database-migrations.md`.

Confira que a base chegou ao ponto que o manifesto exige:

```bash
docker compose exec -T postgres psql -U sparta -d sparta -tAc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"
```

O número tem que ser igual ao tamanho de `database.requiredMigrations`.

## 5. Aguardar o healthcheck

```bash
docker inspect --format '{{.State.Health.Status}}' sparta-api-1
```

Espere `healthy`. Não siga com `starting`.

## 6. Smoke tests

Cada passo abaixo tem um resultado esperado explícito. Qualquer um falhando é
critério de aborto (ver `docs/runbook-rollback.md`).

**API viva:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3333/health
```

Esperado: `200`.

**Autenticação rejeita token inválido:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer invalido" http://localhost:3333/auth/me
```

Esperado: `401`.

**Autenticação aceita token válido:**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3333/auth/me
```

Esperado: o usuário e a conta Riot vinculada.

**Recomendação real:**

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"draft":{"playerRole":"JUNGLE","playerRoleSource":"USER","pickOrder":3,"allies":[{"championId":103,"championName":"Ahri","team":"ally","role":"MID"}],"enemies":[{"championId":64,"championName":"Lee Sin","team":"enemy","role":"JUNGLE"}],"bannedChampionIds":[55,91],"enemyLaneChampionId":64},"session":{"sessionKey":"smoke-<version>","source":"USER"}}' \
  http://localhost:3333/drafts/recommendations
```

Esperado: cinco candidatos, `persistence.status = "SAVED"` e um `snapshotId`.
Guarde o `snapshotId`.

**Bundle capturado na versão certa:**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3333/recommendation-snapshots/$SNAPSHOT/replay-bundle-summary
```

Esperado: `bundleSchemaVersion` igual a `replay.bundleSchemaVersion` do
manifesto, e `capability = "FULL_DERIVATION_REPLAY_AVAILABLE"`.

**Replay exato:**

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' \
  http://localhost:3333/recommendation-snapshots/$SNAPSHOT/verify-replay
```

Esperado: `status = "EXACT_REPLAY"` com `divergences` vazio. **Qualquer outro
valor aborta a publicação** — replay divergente significa que o resultado
mostrado não é reproduzível.

**Release operacional inalterada:**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3333/recommendation-engine/active-release
```

Esperado: `source = "RELEASE"` com `releaseVersion`, `artifactHash` e
`configHash` **idênticos** aos de `recommendationEngine` no manifesto e aos
registrados no passo 2. Publicar a API não muda a release do motor; se mudou,
algo está errado.

**Sem fallback inesperado:**

```bash
docker logs sparta-api-1 2>&1 | grep -c '"fallbackUsed":true'
```

Esperado: `0`. Fallback aqui significa que o provider não conseguiu ler a
configuração ativa e caiu para a baseline — funciona, mas não é o estado
esperado numa publicação saudável.

## 7. Liberar o instalador

Só depois de todos os passos acima passarem.

Confira o SHA-256 do arquivo contra `desktop.installerSha256` do manifesto:

```powershell
Get-FileHash .\Sparta-Setup-<version>-x64.exe -Algorithm SHA256
```

Publique o instalador **junto** do SHA-256 e da nota de que ele não é assinado,
com a instrução do SmartScreen (`docs/release-notes.md`). Publicar o binário sem
o hash tira do usuário a única forma de verificar o que baixou.

## 8. Depois

Mantenha o backup e o digest da imagem anterior acessíveis pelo tempo em que o
rollback ainda fizer sentido. Não descarte nada no mesmo dia.

O monitoramento pós-publicação é assunto separado e não faz parte deste runbook.
