# Publicação controlada — Sparta 0.9.0

## Etapa 30A — estado atual

> ## `READY_FOR_DESKTOP_PUBLICATION`

O candidato local corrigido foi regenerado do zero e recongelado em 2026-08-05 a partir do commit
`18ea00544fcfdf8cffb884ad8d7524ffee04db2f`. Os dois bloqueadores encontrados na Etapa 30 foram
eliminados: o `app.asar` real não contém fixtures, mocks, snapshots, testes, fontes TypeScript,
source maps, `.env` ou payload sintético da Riot, e o inventário agora aceita somente o conjunto
canônico e não ambíguo da versão corrente.

A API pública continua com o estado explícito **`BLOCKED_BY_MISSING_INFRASTRUCTURE`**: não existe
registry, ambiente, servidor, domínio, backup ou rollback real configurado. Esse bloqueio não foi
disfarçado com o Compose local e não invalida a prontidão do artefato desktop. Nenhuma tag, GitHub
Release, imagem remota, publicação do instalador ou Etapa 31 foi criada/iniciada.

### Candidato recongelado

| Arquivo                               |      Bytes | SHA-256                                                            |
| ------------------------------------- | ---------: | ------------------------------------------------------------------ |
| `Sparta-Setup-0.9.0-x64.exe`          | 95.694.968 | `24105e665e4cb94e41638ff7f85aed479b0a87c9442443a5d965baa6a2b228f9` |
| `Sparta-Setup-0.9.0-x64.exe.blockmap` |    101.623 | `87854716b6e57edd22748528379af3f127ce2d6534f5e676348ee2a0fba2d83d` |
| `checksums.txt`                       |        359 | `f385666bc25f13d590f65ed68984f0bbf2252ea4c2153ed9a0233c888a8f8abb` |
| `sbom-api.json`                       |     16.654 | `f8cf1af575d854b73aa0431dcbef0b293768afcd06b17f68ade59035a8bfa744` |
| `sbom-desktop.json`                   |      3.559 | `40eacd9f64cb3ddc2fc3768015e258bef149ee50560abc507b9af8bfb18d2c14` |
| `sparta-release-manifest.json`        |      3.625 | `cd121d14b23c2479051cd72538e4a57cdab80f229fa07d3a9bceada0b87ef336` |

O instalador preserva produto `Sparta`, FileVersion/ProductVersion `0.9.0`, CompanyName
`J-Pantaroto` e assinatura `NotSigned`. O manifesto registra a imagem local da API
`sha256:1268f2921b44c8abb085afb0e89527a4204c9bd66f66de4445ff10874a1badc4`, 21 migrations,
`release-etapa27c-v1` ativa, os hashes funcionais da release e replay
`replay-input-bundle/2.0.0` em `EXACT_REPLAY`.

### Evidências da correção e validação

- O CI do commit-fonte concluiu com sucesso no run `31037753965`; a geração local repetiu
  version check, typecheck, lint, build, 1.089 testes TypeScript e 1 teste Python.
- A origem foi corrigida no build do `@sparta/riot` e nas exclusões gerais do electron-builder;
  o verificador abriu o `app.asar` real com `@electron/asar` e aprovou 2.584 entradas, com zero
  achados proibidos.
- A descoberta de artefatos rejeita ausência, versão antiga, duplicidade, ambiguidade e metadados
  internos divergentes. O inventário e seu espelho registram apenas `0.9.0`.
- Instalação antiga e atualização pelo novo candidato foram exercitadas no mesmo caminho com
  espaços e acento. O `app.asar` foi substituído pelo hash da build nova; a árvore instalada ficou
  em 75/75 arquivos, sem excedentes, com um atalho em cada local e uma entrada de desinstalação.
- O executável instalado carregou de `file:` sem Vite, com preload disponível, documento completo,
  zero exceção de renderer, zero erro de console e nenhum `NaN`, `Infinity` ou `undefined` visível.
  A desinstalação removeu pasta, atalhos e registro com exit code 0.
- A API local foi recriada com a imagem nova. O mesmo input e a mesma sessão devolveram os mesmos
  IDs e persistência `UNCHANGED`: Viego 58,7/0,9; Udyr 58,5/0,5; Vi 55,3/0,5; Nocturne 53,3/0,5;
  Graves 50,1/0,5. O replay foi `EXACT_REPLAY`, com zero divergências e zero dependências ausentes.
- O release ativo continuou com ID `0d8a2ce4-7e42-4cb1-9bdb-fd2b9ef2e0e9`, `artifactHash`
  `8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90` e `configHash`
  `fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38`. Houve zero fallback
  real, zero erro de hash e zero log de nível erro/fatal; token inválido permaneceu em 401.

O parecer significa somente que o candidato desktop está apto para uma decisão posterior de
publicação. Não autoriza inventar a infraestrutura da API nem transforma a validação local em
deploy de produção.

## Registro histórico — Etapa 30

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

Esse bloqueio histórico foi resolvido pelo candidato da Etapa 30A descrito no início do documento.
A Etapa 31 não foi iniciada.
