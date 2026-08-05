---
status: IMPLEMENTADA
solicitado_em: 2026-08-04 17:10
implementado_em: 2026-08-04 18:20
---

# Etapa 29 — Preparação e congelamento da release final

## Pedido original

> Transformar o estado atual de `main` em um release candidate formal, reproduzível e pronto para
> publicação controlada: definir a versão oficial (sem presumir `1.0.0`), congelar as referências
> técnicas num manifesto gerado de dados reais, regerar os artefatos finais a partir de árvore limpa,
> preparar documentação de usuário e operação (release notes, runbook de publicação, runbook de
> rollback), validar instalação/atualização/desinstalação e smoke test com os artefatos congelados,
> registrar limitações classificadas, e produzir um parecer único `READY_FOR_PUBLICATION` ou
> `BLOCKED`.
>
> Restrições explícitas: não publicar artefato, não criar GitHub Release, não enviar imagem para
> registry, não alterar a release ativa, não recalibrar pesos, não modificar o motor, não incluir
> Production Key, não assinar artificialmente o instalador, não esconder limitações, não iniciar
> monitoramento pós-release. Não declarar reprodutibilidade bit a bit se a ferramenta insere
> metadado variável. Não reduzir bloqueador a limitação para concluir a etapa.

## Notas de implementação

Parecer final em `docs/release-readiness.md`: **`READY_FOR_PUBLICATION`**, sem nenhum
`PUBLICATION_BLOCKER`. Nada foi publicado.

### Versão 0.9.0, não 1.0.0

O escopo local está completo, mas os dados globais (matchup, meta, builds, runas) dependem de uma
Riot Production Key que o projeto não tem, o instalador não é assinado, e contratos públicos ainda
se movem — o `ReplayInputBundle` foi de `1.0.0` para `2.0.0` uma etapa atrás. Marcar 1.0.0
comunicaria escopo fechado e estabilidade de contrato; nenhum dos dois é verdade.

`scripts/sync-version.mjs` cria a fonte de verdade única (`package.json` da raiz) e propaga para 5
`package.json`, o `pyproject.toml` e **dois literais em código** que antes eram editados à mão: a
versão anunciada pelo OpenAPI e a exposta pelo bridge do preload ao renderer. `pnpm version:check`
entrou no CI.

### Manifesto de dados reais

`scripts/release-manifest.mjs` monta o `SpartaReleaseManifest` a partir de `git`, `docker image
inspect`, do arquivo em disco e do Postgres. Campo sem fonte real faz o gerador **falhar** — um
manifesto com valor inventado é pior que um ausente, porque parece verificado. As limitações vêm de
`release/known-limitations.json`, versionado e revisável num diff.

### Reprodutibilidade medida, não alegada

Duas gerações completas do mesmo commit (`docs/release-reproducibility.md`). **Determinísticos**:
`app.asar`, `Sparta.exe`, os SBOM, a árvore de 2604 entradas do asar e o conteúdo extraído do
instalador — 75 arquivos, byte a byte idênticos. **Funcionalmente equivalentes**: o `.exe` do NSIS
e a imagem da API.

A causa de cada diferença foi verificada, não suposta: no instalador, o `TimeDateStamp` do PE é
idêntico nos dois (é o stub pré-compilado do NSIS) e o campo que muda em `0xDA18` é o tamanho do
fluxo comprimido — a entrada da compressão é idêntica e a saída não. Na imagem, só as 6 camadas da
imagem-base coincidem, porque cada `COPY`/`RUN` grava mtime. Daí a regra nos runbooks: publicar a
imagem **por digest**, e verificar o instalador pelo conteúdo extraído, não pelo hash do `.exe`.

### Defeito real corrigido

**Os dados do usuário iam para `%APPDATA%\@sparta\desktop`.** O Electron deriva `app.getName()` do
campo `name` do `package.json` empacotado (`@sparta/desktop`), e a barra do escopo vira subpasta —
o usuário ganhava um diretório `@sparta` solto em AppData mais um `@spartadesktop-updater`. O guia
dizia `%APPDATA%\Sparta` e o caminho real era outro. `app.setName("Sparta")` antes do `whenReady`.
Corrigir agora não custa nada; depois de publicado, custaria abandonar o perfil de quem já tivesse
instalado.

### Defeito no próprio pipeline, achado na primeira execução

O `electron-builder` não limpa `dist-installer/`, então o instalador do 0.1.0 sobreviveu e o
manifesto do 0.9.0 registrou **ele** e o SHA-256 dele. Corrigido nos dois lados: o pipeline limpa
antes de empacotar e copia só o que carrega a versão do candidato no nome; o gerador seleciona pela
versão e reporta como problema qualquer instalador de outra versão no diretório.

### Instalação exercitada como um usuário real

Em processo **não elevado** (tarefa agendada com privilégio `LIMITED`): caminho padrão por usuário
sem pedir administrador, caminho com espaço e acento, atalhos sem duplicata, app abrindo de
`file://…/app.asar` sem Vite. Atualização por cima preservou os dados locais, **removeu** um arquivo
obsoleto plantado e não duplicou atalho. Desinstalação removeu pasta, atalhos e registro,
preservou os dados do usuário por desenho e não tocou no League.

Ao investigar por que uma instalação silenciosa foi para `C:\Program Files`, ficou claro que o
instalador declara `requestedExecutionLevel="asInvoker"` e nunca pede elevação — o destino por
máquina só acontece quando ele herda um token já elevado. Registrado como limitação, com o
mecanismo exato.

### Smoke test com os artefatos congelados

5 candidatos idênticos aos da linha de base, `SAVED`, bundle `replay-input-bundle/2.0.0` com a
configuração embutida, replay `EXACT_REPLAY` com 0 divergências, `release-etapa27c-v1` `ACTIVE`
conferindo com o manifesto em id/versão/`artifactHash`/`configHash`, 0 fallback no log, `SIGTERM` em
1296 ms com exit code 0, 10 telas com 0 erro de renderer/preload/main, 0 imagem quebrada e 0
`NaN`/`undefined`.

### Duas limitações descobertas e registradas, não silenciadas

O rótulo de replay antes da primeira verificação (`FULL_DERIVATION_REPLAY_UNAVAILABLE` cobre dois
estados distintos; o `reason` distingue, o rótulo visível não) e a instalação a partir de terminal
elevado. Nenhuma é bloqueador pelo critério da etapa, e nenhuma foi reclassificada para baixo para
permitir concluir.

## O que não foi feito, por instrução

Nenhuma publicação: sem GitHub Release, sem push para registry, sem distribuição do instalador, sem
publicação automática, sem monitoramento pós-release. Release ativa, pesos, motor e artefato
intocados. Nada assinado artificialmente.
