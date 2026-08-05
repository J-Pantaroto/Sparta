# Publicação controlada — Sparta 0.9.0

## Estado

> ## `BLOCKED`

Auditoria executada em 2026-08-05 antes de qualquer mutação externa. Nenhuma tag, GitHub Release,
imagem remota ou distribuição pública foi criada. O deploy da API também não foi iniciado.

O parecer `READY_FOR_PUBLICATION` da Etapa 29 continua preservado como registro histórico do
congelamento, mas a inspeção independente da Etapa 30 encontrou dois critérios que impedem publicar
o candidato atual. Este relatório não altera silenciosamente o manifesto congelado.

## Checkpoint pré-publicação

| Item                      | Evidência                                                                                               | Resultado              |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------- |
| Repositório               | `https://github.com/J-Pantaroto/Sparta`, público                                                        | Disponível             |
| Git                       | `HEAD == origin/main == c3b5c6f287dc8050371475f84a656c2d971447f5`                                       | Conforme               |
| CI                        | run `31032711952`, SHA `c3b5c6f`, conclusão `success`                                                   | Conforme               |
| Tag `v0.9.0`              | ausente local e remotamente                                                                             | Conforme               |
| GitHub Release            | nenhuma release existente                                                                               | Conforme               |
| Acesso GitHub             | Git e API do repositório autenticados                                                                   | Disponível             |
| Registry da API           | nenhum destino do projeto configurado                                                                   | Bloqueado              |
| Ambiente de produção      | nenhum environment, deployment, secret ou variável de deploy                                            | Bloqueado              |
| Imagem validada           | `sparta-api:latest`, image ID `sha256:a701f6b2fa2faaddd04419d361e2c3d387ddc04f0ace6ab15e2933b3e2c5cae5` | Só local               |
| Backup e rollback da API  | não existe destino real do qual obter imagem anterior ou banco                                          | Bloqueado              |
| Migrations locais         | 21 encontradas e aplicadas; schema atualizado                                                           | Conforme, apenas local |
| Release operacional local | `release-etapa27c-v1`, única ativa                                                                      | Conforme               |
| Replay local mais recente | `replay-input-bundle/2.0.0`, `EXACT_REPLAY`                                                             | Conforme               |

O Docker local usa `NODE_ENV=development` e o Compose da estação de trabalho. Ele não é um ambiente
de produção e não foi reclassificado como um só para permitir a publicação. O acesso local ao
Docker Hub não define nome de imagem, organização, servidor, domínio ou procedimento de deploy do
Sparta. A credencial GitHub disponível também não possui `read:packages`; isso não muda o fato
principal de que nenhum registry ou ambiente foi configurado.

## Artefatos congelados

| Arquivo                               |      Bytes | SHA-256                                                            |
| ------------------------------------- | ---------: | ------------------------------------------------------------------ |
| `Sparta-Setup-0.9.0-x64.exe`          | 95.702.766 | `78c77fad6e395f1adfe608fa04f3aea58273b72349e932cf8f60f9698a318411` |
| `Sparta-Setup-0.9.0-x64.exe.blockmap` |    101.558 | `50f9144964779c8a486f5e20a6c318dcb339b5a84d7589c54facfffbea6f4acc` |
| `checksums.txt`                       |        359 | `4342a136050ced06a00e276ca77a0a8c166e99fc9aabd517a896a59d45e9d1ef` |
| `sbom-api.json`                       |     16.654 | `4bc3621aa6a8936b5598b688274fcebc8eeec86b6d9d136eb3b5eb531744599b` |
| `sbom-desktop.json`                   |      3.559 | `7ac0b8838588cda8288a99e5ae64a98a8e1f55b25d350c1f203fb7eeab4528f4` |
| `sparta-release-manifest.json`        |      3.331 | `c21ff9dc5aa21102ba392bb3529ee7b82a6fe03c45cdb8694c21f9b32ba395c8` |

Todos os hashes listados em `checksums.txt` foram recalculados e conferem. O instalador congelado e
o de `dist-installer/` também têm o mesmo hash. Metadados observados: produto `Sparta`, versão de
arquivo e produto `0.9.0`, CompanyName `J-Pantaroto`, assinatura `NotSigned` e nenhum certificado
de signatário.

O `.blockmap` não seria publicado: não há atualização automática e, portanto, ele é desnecessário.

## Rastreabilidade do commit

O manifesto registra `6b43b512e7dcdf30844f482ea5c1731bade56008`, enquanto o candidato aprovado é
`c3b5c6f287dc8050371475f84a656c2d971447f5`. A diferença foi inspecionada: entre os dois commits
mudaram apenas `.github/workflows/ci.yml`, `.gitignore` e a inclusão versionada de manifesto, SBOM
e checksums. Nenhum arquivo de produto, motor, peso, schema ou replay mudou. Essa separação é
rastreável, mas deve continuar explícita em qualquer candidato sucessor.

## Bloqueadores

### 1. Arquivos de teste dentro do `app.asar`

A inspeção das 2.604 entradas do `app.asar` não encontrou `.env`, logs, chaves, certificados,
TypeScript nem source maps. Encontrou, porém, fixtures sintéticas do próprio projeto:

```text
node_modules/@sparta/riot/src/mappers/__fixtures__/match-detail.json
node_modules/@sparta/riot/src/mappers/__fixtures__/match-timeline.json
node_modules/@sparta/riot/dist/mappers/__fixtures__/match-detail.json
node_modules/@sparta/riot/dist/mappers/__fixtures__/match-timeline.json
```

Os identificadores são fictícios (`puuid-player-1`/`puuid-player-2`), portanto não há exposição de
dado de usuário. Ainda assim, são arquivos de teste indevidos e contradizem tanto a allowlist
documentada em `apps/desktop/electron-builder.yml` quanto o requisito da Etapa 30 de confirmar a
ausência de fontes e testes. Publicá-los violaria o critério “nenhum arquivo indevido publicado”.

Correção exige ajustar o empacotamento, gerar um novo instalador, atualizar manifesto e checksums,
repetir a validação de conteúdo, instalação, atualização, desinstalação e smoke test e aprovar um
novo commit candidato. Não é permitido modificar o binário congelado nem atribuí-lo ao commit
`c3b5c6f` depois de uma mudança não versionada.

### 2. Inventário obrigatório divergente

`docs/release-candidate.md` ainda registra um instalador `Sparta-Setup-0.1.0-x64.exe`; o espelho
`.ai/specs/release-candidate.md` está ainda mais antigo e também registra versão `0.1.0`. Isso
diverge do manifesto, SBOM e checksums reais de `0.9.0`. O inventário é gerado e não foi reescrito
à mão para esconder o histórico. Ele deve ser regenerado a partir do candidato sucessor e o
espelho deve ser sincronizado antes da publicação.

## Decisão sobre a GitHub Release

Se os bloqueadores forem corrigidos e um novo candidato for aprovado, a distribuição deve começar
como **prerelease**. A justificativa é objetiva: versão pré-1.0, instalador não assinado e ausência
de API pública — o instalador isolado não oferece o fluxo funcional completo a terceiros. Essa
decisão precisa ser reavaliada se uma API pública real for configurada antes da próxima tentativa.

## Resultado

- Tag `v0.9.0`: não criada.
- GitHub Release: não criada.
- Instalador remoto: não enviado.
- API: bloqueada por ausência de infraestrutura real.
- Release operacional: intacta.
- Replay: último bundle em `EXACT_REPLAY`.
- Estado da Etapa 30: `BLOCKED`, não `PUBLISHED` nem `PARTIALLY_PUBLISHED`.

A próxima ação válida é preparar e aprovar um novo candidato corrigido. A Etapa 31 não foi
iniciada.
