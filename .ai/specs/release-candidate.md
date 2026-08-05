# Candidato de release — inventário

<!-- GERADO por scripts/release-inventory.mjs. Não editar à mão: rode
     `node scripts/release-inventory.mjs` para atualizar. -->

Este arquivo descreve **um candidato local**. Nada aqui foi publicado: não há
GitHub Release, não há distribuição externa e o empacotamento roda sempre com
`--publish never`.

## Identificação

| Campo | Valor |
| --- | --- |
| Commit | `18ea00544fcfdf8cffb884ad8d7524ffee04db2f` |
| Versão do app | 0.9.0 |
| Versão do monorepo | 0.9.0 |
| Versão interna do instalador | 0.9.0 |
| Publisher | J-Pantaroto |
| Electron | 39.8.10 |
| Gerenciador de pacotes | pnpm@10.34.4 |
| Imagem-base da API | `node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0` |
| Imagem da API construída | `sha256:1268f2921b44c8abb085afb0e89527a4204c9bd66f66de4445ff10874a1badc4` |
| Tamanho da imagem | 513 MB |

## Assinatura de código

O instalador Windows sai **não assinado**. Não existe certificado de assinatura
de código neste projeto, e nada no empacotamento simula assinatura — verificável
com `Get-AuthenticodeSignature`, que devolve `NotSigned`.

Consequência prática, sem eufemismo: ao executar o instalador, o Windows
SmartScreen exibe "O Windows protegeu o computador" e exige que o usuário abra
"Mais informações" → "Executar assim mesmo". O aviso é legítimo — o sistema não
tem como atribuir o binário a um publicador verificado. Um instalador não
assinado também não acumula reputação no SmartScreen, então o aviso não
desaparece com o tempo por si só.

Distribuir para terceiros sem assinatura não é recomendado. Resolver isso exige
um certificado de assinatura de código (OV ou EV) emitido por uma autoridade
reconhecida — decisão de negócio, fora do escopo técnico desta etapa.

## Artefatos e checksums

| Arquivo | Bytes | SHA-256 |
| --- | --- | --- |
| Sparta-Setup-0.9.0-x64.exe | 95694968 | `24105e665e4cb94e41638ff7f85aed479b0a87c9442443a5d965baa6a2b228f9` |
| Sparta-Setup-0.9.0-x64.exe.blockmap | 101623 | `87854716b6e57edd22748528379af3f127ce2d6534f5e676348ee2a0fba2d83d` |

O instalador e o blockmap não são versionados; o inventário lê o diretório
canônico `artifacts/releases/0.9.0/` depois de ele ter sido limpo e
regenerado. O gerador rejeita ausência, versão diferente, candidato ambíguo e
metadados internos incompatíveis. Os checksums acima identificam esta build;
reconstruir a partir de outro commit produz outros valores.

## Migrations

21 migrations no repositório, aplicadas em ordem lexicográfica:

- `20260715120000_init`
- `20260716010000_nullable_participant_challenge_stats`
- `20260721220000_matchparticipant_team_and_unique`
- `20260722020000_postgame_report_unique`
- `20260722180000_player_profile_match_analysis_limit`
- `20260726120000_player_champion_stats_nullable_participation`
- `20260726150000_match_participant_objective_absolutes`
- `20260727220000_champion_tag_provenance`
- `20260727234500_http_cache_states`
- `20260728010000_match_observations`
- `20260728020600_player_champion_pool`
- `20260728033000_champion_execution_risk`
- `20260728120000_draft_session_persistence`
- `20260728163000_patch_intelligence`
- `20260728190000_draft_match_reconciliation`
- `20260728210000_draft_postgame_comparison`
- `20260730100000_draft_review`
- `20260731100000_calibration_lab`
- `20260731160000_replay_input_bundle`
- `20260803150000_recommendation_engine_releases`
- `20260804130000_match_participant_account_index`

A aplicação em um ambiente novo é feita pelo processo documentado em
`docs/database-migrations.md`, nunca por `migrate dev` nem por reescrita de
migration já aplicada.

## SBOM — dependências de produção

Somente o grafo **resolvido** com `--prod`. Ferramenta de desenvolvimento
(eslint, vitest, typescript, electron-builder) não aparece aqui porque não vai
para a imagem nem para o instalador.

### API — 140 pacotes

| Pacote | Licença |
| --- | --- |
| `@fastify/accept-negotiator@2.0.1` | MIT |
| `@fastify/ajv-compiler@4.0.5` | MIT |
| `@fastify/cors@11.2.0` | MIT |
| `@fastify/error@4.2.0` | MIT |
| `@fastify/fast-json-stringify-compiler@5.0.3` | MIT |
| `@fastify/forwarded@3.0.1` | MIT |
| `@fastify/merge-json-schemas@0.2.1` | MIT |
| `@fastify/proxy-addr@5.1.0` | MIT |
| `@fastify/rate-limit@11.1.0` | MIT |
| `@fastify/send@4.1.0` | MIT |
| `@fastify/static@10.1.2` | MIT |
| `@fastify/swagger-ui@5.2.6` | MIT |
| `@fastify/swagger@9.7.0` | MIT |
| `@lukeed/ms@2.0.2` | MIT |
| `@pinojs/redact@0.4.0` | MIT |
| `@prisma/client@6.19.3` | Apache-2.0 |
| `@prisma/config@6.19.3` | Apache-2.0 |
| `@prisma/debug@6.19.3` | Apache-2.0 |
| `@prisma/engines-version@7.1.1-3.c2990dca591cba766e3b7ef5d9e8a84796e47ab7` | Apache-2.0 |
| `@prisma/engines@6.19.3` | Apache-2.0 |
| `@prisma/fetch-engine@6.19.3` | Apache-2.0 |
| `@prisma/get-platform@6.19.3` | Apache-2.0 |
| `@sparta/core@0.9.0 (workspace)` | não declarada |
| `@sparta/riot@0.9.0 (workspace)` | não declarada |
| `@standard-schema/spec@1.1.0` | MIT |
| `abstract-logging@2.0.1` | MIT |
| `ajv-formats@3.0.1` | MIT |
| `ajv@8.20.0` | MIT |
| `atomic-sleep@1.0.0` | MIT |
| `avvio@9.2.0` | MIT |
| `balanced-match@4.0.4` | MIT |
| `boolbase@1.0.0` | ISC |
| `brace-expansion@5.0.9` | MIT |
| `c12@3.1.0` | MIT |
| `cheerio-select@2.1.0` | BSD-2-Clause |
| `cheerio@1.0.0` | MIT |
| `chokidar@4.0.3` | MIT |
| `citty@0.1.6` | MIT |
| `citty@0.2.2` | MIT |
| `confbox@0.2.4` | MIT |
| `consola@3.4.2` | MIT |
| `content-disposition@2.0.1` | MIT |
| `cookie@1.1.1` | MIT |
| `css-select@5.2.2` | BSD-2-Clause |
| `css-what@6.2.2` | BSD-2-Clause |
| `debug@4.4.3` | MIT |
| `deepmerge-ts@7.1.5` | BSD-3-Clause |
| `defu@6.1.7` | MIT |
| `depd@2.0.0` | MIT |
| `dequal@2.0.3` | MIT |
| `destr@2.0.5` | MIT |
| `dom-serializer@2.0.0` | MIT |
| `domelementtype@2.3.0` | BSD-2-Clause |
| `domhandler@5.0.3` | BSD-2-Clause |
| `domutils@3.2.2` | BSD-2-Clause |
| `dotenv@16.6.1` | BSD-2-Clause |
| `effect@3.21.0` | MIT |
| `empathic@2.0.0` | MIT |
| `encoding-sniffer@0.2.1` | MIT |
| `entities@4.5.0` | BSD-2-Clause |
| `entities@6.0.1` | BSD-2-Clause |
| `escape-html@1.0.3` | MIT |
| `exsolve@1.1.0` | MIT |
| `fast-check@3.23.2` | MIT |
| `fast-decode-uri-component@1.0.1` | MIT |
| `fast-deep-equal@3.1.3` | MIT |
| `fast-json-stringify@6.4.0` | MIT |
| `fast-querystring@1.1.2` | MIT |
| `fast-uri@4.1.2` | BSD-3-Clause |
| `fastify-plugin@5.1.0` | MIT |
| `fastify-plugin@6.0.0` | MIT |
| `fastify@5.9.0` | MIT |
| `fastq@1.20.1` | ISC |
| `find-my-way@9.7.0` | MIT |
| `giget@2.0.0` | MIT |
| `glob@13.0.6` | BlueOak-1.0.0 |
| `htmlparser2@9.1.0` | MIT |
| `http-errors@2.0.1` | MIT |
| `iconv-lite@0.6.3` | MIT |
| `inherits@2.0.4` | ISC |
| `ipaddr.js@2.4.0` | MIT |
| `jiti@2.7.0` | MIT |
| `json-schema-ref-resolver@3.0.0` | MIT |
| `json-schema-resolver@3.0.0` | MIT |
| `json-schema-traverse@1.0.0` | MIT |
| `light-my-request@6.6.0` | BSD-3-Clause |
| `lru-cache@11.5.1` | BlueOak-1.0.0 |
| `mime@3.0.0` | MIT |
| `minimatch@10.2.5` | BlueOak-1.0.0 |
| `minipass@7.1.3` | BlueOak-1.0.0 |
| `ms@2.1.3` | MIT |
| `node-fetch-native@1.6.7` | MIT |
| `nth-check@2.1.1` | BSD-2-Clause |
| `nypm@0.6.8` | MIT |
| `ohash@2.0.11` | MIT |
| `on-exit-leak-free@2.1.2` | MIT |
| `openapi-types@12.1.3` | MIT |
| `parse5-htmlparser2-tree-adapter@7.1.0` | MIT |
| `parse5-parser-stream@7.1.2` | MIT |
| `parse5@7.3.0` | MIT |
| `path-scurry@2.0.2` | BlueOak-1.0.0 |
| `pathe@2.0.3` | MIT |
| `perfect-debounce@1.0.0` | MIT |
| `pino-abstract-transport@3.0.0` | MIT |
| `pino-std-serializers@7.1.0` | MIT |
| `pino@10.3.1` | MIT |
| `pkg-types@2.3.1` | MIT |
| `prisma@6.19.3` | Apache-2.0 |
| `process-warning@4.0.1` | MIT |
| `process-warning@5.0.0` | MIT |
| `pure-rand@6.1.0` | MIT |
| `quick-format-unescaped@4.0.4` | MIT |
| `rc9@2.1.2` | MIT |
| `readdirp@4.1.2` | MIT |
| `real-require@0.2.0` | MIT |
| `real-require@1.0.0` | MIT |
| `require-from-string@2.0.2` | MIT |
| `ret@0.5.0` | MIT |
| `reusify@1.1.0` | MIT |
| `rfdc@1.4.1` | MIT |
| `safe-regex2@5.1.1` | MIT |
| `safe-stable-stringify@2.5.0` | MIT |
| `safer-buffer@2.1.2` | MIT |
| `secure-json-parse@4.1.0` | BSD-3-Clause |
| `semver@7.8.5` | ISC |
| `set-cookie-parser@2.7.2` | MIT |
| `setprototypeof@1.2.0` | ISC |
| `sonic-boom@4.2.1` | MIT |
| `split2@4.2.0` | ISC |
| `statuses@2.0.2` | MIT |
| `thread-stream@4.2.0` | MIT |
| `tinyexec@1.2.4` | MIT |
| `toad-cache@3.7.4` | MIT |
| `toidentifier@1.0.1` | MIT |
| `typescript@5.9.3` | Apache-2.0 |
| `undici@6.28.0` | MIT |
| `whatwg-encoding@3.1.1` | MIT |
| `whatwg-mimetype@4.0.0` | MIT |
| `yaml@2.9.0` | ISC |
| `zod@3.25.76` | MIT |

### Desktop — 28 pacotes

| Pacote | Licença |
| --- | --- |
| `@sparta/core@0.9.0 (workspace)` | não declarada |
| `@sparta/riot@0.9.0 (workspace)` | não declarada |
| `boolbase@1.0.0` | ISC |
| `cheerio-select@2.1.0` | BSD-2-Clause |
| `cheerio@1.0.0` | MIT |
| `css-select@5.2.2` | BSD-2-Clause |
| `css-what@6.2.2` | BSD-2-Clause |
| `dom-serializer@2.0.0` | MIT |
| `domelementtype@2.3.0` | BSD-2-Clause |
| `domhandler@5.0.3` | BSD-2-Clause |
| `domutils@3.2.2` | BSD-2-Clause |
| `encoding-sniffer@0.2.1` | MIT |
| `entities@4.5.0` | BSD-2-Clause |
| `entities@6.0.1` | BSD-2-Clause |
| `htmlparser2@9.1.0` | MIT |
| `iconv-lite@0.6.3` | MIT |
| `lucide-react@0.525.0` | ISC |
| `nth-check@2.1.1` | BSD-2-Clause |
| `parse5-htmlparser2-tree-adapter@7.1.0` | MIT |
| `parse5-parser-stream@7.1.2` | MIT |
| `parse5@7.3.0` | MIT |
| `react-dom@19.2.7` | MIT |
| `react@19.2.7` | MIT |
| `safer-buffer@2.1.2` | MIT |
| `scheduler@0.27.0` | MIT |
| `undici@6.28.0` | MIT |
| `whatwg-encoding@3.1.1` | MIT |
| `whatwg-mimetype@4.0.0` | MIT |

O runtime do Electron (Chromium + Node embutidos) não é um pacote npm e não
aparece na tabela acima; a versão está na seção de identificação.

## O que este inventário não contém

Nenhum segredo. O gerador não lê `.env`, não lê variável de ambiente do
projeto e não consulta o banco — só o repositório, o grafo do pnpm e os
artefatos em disco.
