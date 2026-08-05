# Publicação controlada — Sparta 0.9.0

Espelho de `docs/release-publication-0.9.0.md`. A fonte de verdade é o arquivo em `docs/`.

## Estado atual — Etapa 30B

`PARTIALLY_PUBLISHED` em 2026-08-05. A tag anotada `v0.9.0` aponta para
`aa2366b3e5bb4b3e5227dcdec43eaf8c6977ba77`, e a GitHub Release
<https://github.com/J-Pantaroto/Sparta/releases/tag/v0.9.0> está publicada como prerelease, não
draft e não latest.

Foram anexados somente instalador, checksums, manifesto, dois SBOMs e notas da versão — seis
arquivos. Todos foram baixados novamente e comparados com as fontes locais. O instalador remoto
manteve SHA-256 `24105e665e4cb94e41638ff7f85aed479b0a87c9442443a5d965baa6a2b228f9`, versão
interna `0.9.0` e `NotSigned`. Não foi encontrado segredo, e a cópia temporária foi removida.

`API_PUBLICATION_STATUS=BLOCKED_BY_MISSING_INFRASTRUCTURE`. Nenhuma imagem, registry, Docker
remoto, migration externa ou deploy foi criado. Release operacional e replay permaneceram
`ACTIVE`/`EXACT_REPLAY`, e a Etapa 31 não foi iniciada.

## Registro histórico — Etapa 30A

`READY_FOR_DESKTOP_PUBLICATION` em 2026-08-05. A correção eliminou fixtures, mocks, snapshots,
testes, TypeScript e source maps do `app.asar` real; a inspeção aprovou 2.584 entradas. O inventário
estrito foi regenerado apenas com os artefatos `0.9.0` do commit
`18ea00544fcfdf8cffb884ad8d7524ffee04db2f`, cujo CI passou no run `31037753965`.

Instalação, atualização no mesmo caminho com espaços e acento, execução por `file:` sem Vite e
desinstalação passaram. A árvore instalada teve 75/75 arquivos sem excedentes. A validação
operacional repetiu o mesmo input/sessão, preservou `sessionId`/`snapshotId` com `UNCHANGED`,
manteve os cinco candidatos e produziu `EXACT_REPLAY` sem divergências.

A API continua `BLOCKED_BY_MISSING_INFRASTRUCTURE`. Nada foi publicado: sem tag, GitHub Release,
imagem remota, upload do instalador, deploy ou Etapa 31.

Hashes canônicos: instalador
`24105e665e4cb94e41638ff7f85aed479b0a87c9442443a5d965baa6a2b228f9`, blockmap
`87854716b6e57edd22748528379af3f127ce2d6534f5e676348ee2a0fba2d83d`, imagem local da API
`sha256:1268f2921b44c8abb085afb0e89527a4204c9bd66f66de4445ff10874a1badc4`.

## Registro histórico — Etapa 30

`BLOCKED` em 2026-08-05, antes de qualquer tag, GitHub Release, upload ou deploy externo. Os dois
bloqueadores locais abaixo foram resolvidos pela Etapa 30A; a falta de infraestrutura da API
permanece.

## Motivos

1. O `app.asar` congelado contém quatro cópias de fixtures sintéticas de teste do próprio
   `@sparta/riot`, sob `src/mappers/__fixtures__` e `dist/mappers/__fixtures__`. Não há segredo nem
   dado real, mas são arquivos indevidos e impedem confirmar a ausência de fontes/testes.
2. `docs/release-candidate.md` e seu espelho estão divergentes do candidato `0.9.0` e ainda
   registram artefatos `0.1.0`.
3. Não existe registry, ambiente, servidor, domínio, backup ou rollback real configurado para a
   API. O deploy da API permanece bloqueado sem infraestrutura inventada.

Git, CI, hashes, assinatura, imagem local, migrations locais, release ativa e replay foram
auditados. Detalhes, hashes completos e decisão de prerelease estão na fonte de verdade.
