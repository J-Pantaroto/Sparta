# Runbook — rollback

O que fazer quando uma publicação dá errado. Separado do runbook de publicação
de propósito: quem precisa deste documento está sob pressão e não deveria ter
que achar a seção certa dentro de outro procedimento.

**Nada aqui foi executado contra infraestrutura externa.** Os comandos são os
reais do projeto; a operação em produção é uma decisão separada.

## Critérios objetivos para abortar

Aborte a publicação e execute o rollback se **qualquer** um destes for
verdadeiro. Não são sinais para interpretar — são condições.

| Condição | Por quê |
| --- | --- |
| `/health` não chega a `200` em 5 minutos | A API não subiu |
| Healthcheck do container não sai de `starting` | Idem |
| `migrate deploy` falha | O schema ficou num estado que não é nem o antigo nem o novo |
| Contagem de migrations aplicadas ≠ `requiredMigrations` do manifesto | A base não está no ponto que o código espera |
| Token válido devolve `401` | Autenticação quebrada: ninguém entra |
| Token inválido devolve algo diferente de `401` | Autenticação permissiva: pior que quebrada |
| `verify-replay` devolve qualquer coisa diferente de `EXACT_REPLAY` | O resultado mostrado não é reproduzível |
| `releaseVersion`, `artifactHash` ou `configHash` diferentes do manifesto | O motor operacional mudou sem autorização |
| Recomendação devolve menos de 5 candidatos onde antes devolvia 5 | Regressão funcional no ranking |
| Qualquer `5xx` num smoke test | Erro não tratado no caminho principal |
| Log com PUUID, token, senha ou string de conexão | Vazamento de dado pessoal ou credencial |
| Digest publicado ≠ `api.imageDigest` do manifesto | A imagem no ar não é a validada |

Um item só já basta. "Quase tudo passou" não é critério.

## 1. Rollback da imagem da API

O caminho mais rápido e o primeiro a tentar.

```bash
docker compose stop api
docker tag <registry>/sparta-api@<digest-anterior> sparta-api:latest
docker compose up -d api
docker inspect --format '{{.State.Health.Status}}' sparta-api-1
```

O `<digest-anterior>` é o que foi registrado no passo 2 do runbook de
publicação. **Não** reconstrua a imagem antiga a partir do código: reconstruir
não produz o mesmo digest (ver `docs/release-reproducibility.md`), e o que se
quer aqui é exatamente o binário que estava funcionando.

Se o digest anterior não foi registrado e a imagem local já foi sobrescrita, o
rollback da imagem não é possível — vá direto para a avaliação de recuperação do
banco e trate como incidente.

## 2. Recuperação de migration

**Só é seguro voltar a imagem sem tocar o banco quando a migration nova é
aditiva** — coluna nullable, tabela nova, índice novo. O código antigo
simplesmente ignora o que não conhece. Todas as migrations do Sparta até
`20260804130000` são desse tipo.

**Migration destrutiva não tem reversão automática.** Coluna removida, tipo
alterado com perda, dado transformado — nada disso volta com um comando. Se a
migration que falhou for destrutiva, a única recuperação é **restaurar o
backup**, e isso significa **perder tudo o que foi escrito depois dele**:

```bash
docker compose stop api
docker compose exec -T postgres psql -U sparta -d postgres -c "DROP DATABASE sparta;"
docker compose exec -T postgres psql -U sparta -d postgres -c "CREATE DATABASE sparta;"
docker compose exec -T postgres pg_restore -U sparta -d sparta --clean --if-exists < backup-<timestamp>.dump
```

Antes de executar, tenha explícito: quanto tempo passou desde o backup, e o que
foi escrito nesse intervalo. Restaurar é uma decisão com perda, não um desfazer.

Se `migrate deploy` falhou no meio, confira o estado antes de decidir:

```bash
docker compose exec -T postgres psql -U sparta -d sparta -c "SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;"
```

Linha com `rolled_back_at` preenchido e **sem** uma segunda linha concluída para
o mesmo nome significa que aquela migration não está aplicada. Linha sem
`finished_at` e sem `rolled_back_at` significa que ela parou no meio — esse é o
caso que exige atenção manual, porque parte dos passos pode ter rodado.

**Nunca** apague linha de `_prisma_migrations` para "limpar". Ela é a única
evidência do que aconteceu.

## 3. Rollback da release do motor

Independente do rollback da imagem: reverter a API **não** muda qual
configuração do motor está ativa, porque a release vive no banco.

Só faça isso se a release do motor for de fato o problema — ranking divergente,
replay falhando por configuração, ou uma ativação indevida.

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reason":"<motivo real>"}' \
  http://localhost:3333/calibration/releases/$RELEASE_ID/rollback
```

O rollback restaura o ponteiro para a release anterior **sem reconstruir
parâmetro nenhum** — o artefato anterior já está persistido e é imutável. Sem
release anterior, o ponteiro é apagado e a configuração volta à baseline
embutida.

`ROLLED_BACK` é terminal: reativar a mesma release exige artefato novo. Isso é
proposital — se ela foi revertida, algo nela ou no sistema em volta não estava
certo.

## 4. Restauração da baseline

A ausência de ponteiro **é** a baseline. Não existe "ativar a baseline": ela é o
estado quando nenhuma release está apontada.

```bash
docker compose exec -T postgres psql -U sparta -d sparta -tAc "SELECT count(*) FROM \"RecommendationEngineActivePointer\";"
```

`0` significa baseline em uso. Confirme pela rota, que é o que o produto de fato
consulta:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3333/recommendation-engine/active-release
```

Esperado com baseline: `source = "BUILT_IN_BASELINE"` e as três tabelas por
cenário. A baseline varia conforme o cenário do draft (blind, lane revelada,
meio do draft) — não existe "a" baseline única.

## 5. Validação depois do rollback

Os mesmos smoke tests do runbook de publicação, com um alvo diferente: o
resultado tem que voltar a ser **o de antes**, não apenas "algum resultado
válido".

1. `/health` em `200`;
2. healthcheck `healthy`;
3. token inválido em `401`, token válido devolvendo o usuário;
4. recomendação com os **mesmos** candidatos, scores e coberturas de antes da
   publicação — compare com o registro do passo 2 da publicação;
5. `verify-replay` em `EXACT_REPLAY` com zero divergências;
6. `releaseVersion`/`artifactHash`/`configHash` iguais aos registrados antes;
7. contagem de `"fallbackUsed":true` no log em `0`.

Se o replay não voltar a `EXACT_REPLAY` depois do rollback, **não tente corrigir
e republicar na mesma operação**. Pare, registre e investigue: a etapa 27b deste
projeto mostrou que uma falha de replay pode revelar um problema estrutural que
nenhuma validação anterior teria como ver.

## 6. Instalador já distribuído

Um instalador baixado não volta. O que dá para fazer:

- **retirar o arquivo** do ponto de distribuição, para parar de crescer o
  alcance;
- **publicar aviso** com a versão afetada, o SHA-256 exato e o que fazer;
- se a API antiga foi restaurada e o desktop novo é incompatível com ela,
  instruir o usuário a instalar de volta a versão anterior — o instalador
  antigo, com o SHA-256 dele, precisa continuar disponível por isso;
- se o desktop novo é compatível com a API antiga (o caso comum, já que o
  desktop degrada para "indisponível" quando um campo falta), não é preciso
  fazer nada no lado do usuário.

Não existe kill switch remoto e não há telemetria para saber quem instalou o
quê. Isso é consequência do desenho — o aplicativo não chama casa —, e é o
motivo pelo qual liberar o instalador é o **último** passo da publicação, depois
de a API estar validada.

## 7. Encerramento

Registre, no mesmo lugar onde ficou o backup: o que falhou, qual critério de
aborto disparou, o que foi revertido, e o que ficou em estado diferente do
anterior. Rollback sem registro vira causa do próximo incidente.
