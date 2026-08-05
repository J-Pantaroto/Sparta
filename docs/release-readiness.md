# Parecer de prontidão — Sparta 0.9.0

## Resultado

> ## `READY_FOR_PUBLICATION`

Nenhum item classificado como `PUBLICATION_BLOCKER`. O candidato está congelado,
os artefatos existem, o manifesto é completo e derivado de fontes reais, a
documentação está pronta, e instalação, atualização, desinstalação e smoke test
foram exercitados de verdade.

**Isto autoriza publicar, não publica.** Nada foi publicado nesta etapa: sem
GitHub Release, sem push para registry, sem distribuição do instalador. A
publicação segue `docs/runbook-publication.md` e é uma decisão separada.

## Versão

**0.9.0**, e não `1.0.0`.

O produto está completo para o escopo local — perfil, champion select, pré-game,
pós-game, histórico e replay auditável funcionam com dados reais. O que falta
para um 1.0 não é acabamento, é uma dimensão inteira: os dados globais (matchup,
meta, builds, runas) dependem de uma Riot Production Key que o projeto não tem, e
o instalador não é assinado. Além disso, contratos públicos ainda se movem — o
`ReplayInputBundle` foi de `1.0.0` para `2.0.0` uma etapa atrás.

Marcar 1.0.0 comunicaria escopo fechado e estabilidade de contrato. Nenhum dos
dois é verdade hoje.

A versão tem **uma** fonte de verdade (`package.json` da raiz) e oito lugares
derivados dela, verificados no CI por `pnpm version:check`.

## Base do parecer

| Critério de aceite | Situação |
| --- | --- |
| Versão oficial definida | 0.9.0, propagada e verificada em 8 lugares |
| Release candidate congelado | `artifacts/releases/0.9.0/`, commit registrado no manifesto |
| Manifesto completo | Todos os campos preenchidos de fonte real; o gerador falha se alguma não responder |
| SBOM | API 140 pacotes, desktop 28, só produção, com licença |
| Checksums | SHA-256 de cada artefato em `checksums.txt` e no manifesto |
| Documentação de usuário | `docs/user-guide.md`, `docs/release-notes.md` |
| Runbooks validados | `docs/runbook-publication.md`, `docs/runbook-rollback.md`; comandos exercitados localmente |
| Instalação/atualização/desinstalação | Exercitadas — ver abaixo |
| Release ativa íntegra | `release-etapa27c-v1` `ACTIVE`, `artifactHash` e `configHash` idênticos ao manifesto |
| Replay exato | `EXACT_REPLAY`, 0 divergências |
| Bloqueadores | Nenhum |

## O que foi medido

### Manifesto

Gerado por `scripts/release-manifest.mjs` a partir de `git`, `docker image
inspect`, do arquivo em disco e do Postgres. Campos sem fonte real fazem o
gerador **falhar**, em vez de preencher com valor plausível.

O instalador é selecionado pelo nome da versão, e a presença de instalador de
outra versão no diretório é reportada como problema — guarda acrescentada depois
de a primeira execução do pipeline registrar o `.exe` do 0.1.0 como sendo o do
0.9.0.

A assinatura é consultada no **binário** (`Get-AuthenticodeSignature`), não no
log do empacotador, que imprime "signing with signtool.exe" mesmo sem
certificado.

### Artefatos e reprodutibilidade

Duas gerações completas do mesmo commit. Detalhe em
`docs/release-reproducibility.md`.

- **Determinísticos**: `app.asar`, `Sparta.exe`, os dois SBOM, a árvore de 2604
  entradas do asar, e o conteúdo extraído do instalador — 75 arquivos, 360 MB,
  **byte a byte idênticos**.
- **Funcionalmente equivalentes**: o `.exe` do NSIS (a compressão não é
  determinística; a entrada é idêntica e a saída não) e a imagem da API (mtimes
  nas camadas; 6 de 21 camadas coincidem, exatamente as da imagem-base).

Consequência registrada nos runbooks: a imagem se publica **por digest**, e a
verificação do instalador contra o código se faz pelo conteúdo extraído, não
pelo hash do `.exe`.

### Instalação, atualização e desinstalação

Exercitadas com o instalador congelado, em processo **não elevado** (tarefa
agendada com privilégio `LIMITED`), que é o caminho do usuário real.

| Verificação | Resultado |
| --- | --- |
| Instalação por usuário, caminho padrão | `%LOCALAPPDATA%\Programs\Sparta`, sem pedir administrador |
| Caminho com espaço e acentuação | `…\Sparta Instalação Acentuada`, app abre e passa as 10 telas |
| Atalhos | 1 na área de trabalho, 1 no menu Iniciar |
| Inicialização | Carrega de `file://…/app.asar`, **sem Vite** |
| Autenticação e API | Conta real na tela, 10 telas com dado real |
| Atualização por cima | Dados locais preservados; arquivo obsoleto plantado **removido**; árvore idêntica; atalhos **não** duplicados; 1 entrada de desinstalação |
| Desinstalação | Pasta, os dois atalhos e a entrada de registro removidos |
| Dados do usuário | Preservados por desenho (`deleteAppDataOnUninstall: false`) |
| League of Legends | Intacto |

### Smoke test com os artefatos congelados

| Item | Resultado |
| --- | --- |
| `/health` | 200 |
| Token inválido | 401 |
| Token válido | 200, conta correta |
| Recomendação real | **5 candidatos** (Viego 58.7/0.9, Udyr 58.5/0.5, Vi 55.3/0.5, Nocturne 53.3/0.5, Graves 50.1/0.5) |
| Persistência | `SAVED` com snapshot |
| Bundle | `replay-input-bundle/2.0.0`, configuração `RELEASE` embutida |
| Replay | `EXACT_REPLAY`, 0 divergências |
| Release operacional | `release-etapa27c-v1` `ACTIVE`, `currentlyActive`, conferindo com o manifesto em id, versão, `artifactHash` e `configHash` |
| Fallback inesperado | 0 ocorrências no log |
| Encerramento gracioso | `SIGTERM` → 1296 ms, exit code 0 |
| Telas (Dashboard, Perfil, Evolução, Champion Select, Pré-game, Pós-game, Histórico de drafts, Histórico do motor, Laboratório, Configurações) | 10/10 com dado real |
| Erros de renderer / preload / processo principal | **0** |
| Imagens quebradas, `NaN`/`Infinity`/`undefined` | **0** |
| Isolamento no app instalado | `ipcRenderer`/`require`/`process`/`Buffer`/`global`/`module` todos `undefined`; CSP aplicada; `window.open` externo devolve `null` |

## Defeito real corrigido nesta etapa

**Os dados do usuário iam para `%APPDATA%\@sparta\desktop`.** O Electron deriva
`app.getName()` do campo `name` do `package.json` empacotado — `@sparta/desktop`,
nome de pacote do workspace. A barra do escopo virava subpasta, e o usuário
ganhava um diretório `@sparta` solto em AppData, mais um
`%LOCALAPPDATA%\@spartadesktop-updater`. O guia do usuário dizia
`%APPDATA%\Sparta`; o caminho real era outro.

Corrigido com `app.setName("Sparta")` antes do `whenReady`. **Corrigir agora não
custa nada; depois de publicado, custaria abandonar o perfil de quem já tivesse
instalado** — é exatamente o tipo de defeito que uma etapa de congelamento
existe para pegar.

## Limitações classificadas

Fonte versionada: `release/known-limitations.json`. Nenhuma é
`PUBLICATION_BLOCKER`.

| Item | Classificação |
| --- | --- |
| Instalador Windows não assinado (aviso do SmartScreen) | `ACCEPTED_RISK` |
| Auditoria de dependências não cobre pacotes do sistema operacional | `ACCEPTED_RISK` |
| Sem matchup, meta, builds e runas globais (Riot Production Key) | `KNOWN_LIMITATION` |
| Detecção dentro de um champion select real nunca observada ponta a ponta | `KNOWN_LIMITATION` |
| A API não é distribuída junto do instalador | `KNOWN_LIMITATION` |
| Chave de desenvolvimento da Riot expira em 24 h | `KNOWN_LIMITATION` |
| Instalador não reproduzível byte a byte | `KNOWN_LIMITATION` |
| Rótulo de replay antes da primeira verificação | `KNOWN_LIMITATION` |
| Instalação a partir de terminal elevado vai para Program Files | `KNOWN_LIMITATION` |
| Sem atualização automática | `FUTURE_FEATURE` |

### Por que nenhuma delas é bloqueador

O critério é o da própria etapa: bloqueia quem impede instalação, compromete
segurança, quebra autenticação, altera o motor, impede rollback, produz replay
divergente ou expõe credencial ou dado pessoal.

- **Instalador não assinado** cria atrito e desconfiança, não impede instalar —
  medido: `ExitCode 0`, app funcionando. É `ACCEPTED_RISK` porque o risco é real
  e foi avaliado, não porque é pequeno.
- **Ausência de dados globais** é escopo declarado, não falha. Nenhum número é
  estimado no lugar: as métricas saem como indisponíveis com motivo.
- **Detecção do champion select real** funciona por construção e por teste
  automatizado em todo o caminho a partir da derivação; falta observá-la com o
  League aberto. Se o vocabulário do LCU mudar, o produto cai no modo manual —
  degrada, não quebra.
- **Rótulo de replay** e **instalação elevada** são defeitos reais, cosméticos e
  de alcance restrito, corrigíveis depois sem custo de migração. Foram
  registrados com o mecanismo exato, não amenizados.

Duas limitações foram **descobertas** pela validação desta etapa (o rótulo de
replay e a instalação elevada) e entraram na lista em vez de serem silenciadas.
Nenhuma reclassificação para baixo foi feita para permitir concluir a etapa.

## Antes de publicar

1. Ler `docs/runbook-publication.md` inteiro.
2. Fazer e **testar** o backup do banco.
3. Registrar o digest da imagem no ar e a release do motor ativa.
4. Publicar a imagem **por digest** e conferir contra `api.imageDigest`.
5. Liberar o instalador **por último**, junto do SHA-256 e do aviso de que não é
   assinado.

Qualquer critério de aborto de `docs/runbook-rollback.md` que dispare interrompe
a publicação.
