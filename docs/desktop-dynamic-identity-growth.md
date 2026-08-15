# Etapa 31M.1 — Identidade visual dinâmica e evolução pessoal

**Estado:** implementada e validada em 2026-08-15<br>
**Escopo:** somente renderer do Sparta Desktop e documentação<br>
**Base preservada:** `399d9909d0e3fae5c13dfd2bded9885bd31c6e1e`

## Resultado

A tela **Evolução pessoal** deixou de comunicar progresso principalmente por barras estáticas. A
hierarquia agora começa por uma série temporal partida a partida e continua com quatro séries
auxiliares factuais. A comparação por blocos e as barras existentes permanecem como contexto
secundário, depois da leitura temporal.

A arte do campeão/skin deixou de ser repetida no hero de cada página. Quando há uma escolha visual,
o `AppShell` usa uma única camada ambiente ampla, atrás da área principal, com opacidade, máscara,
gradientes e vinheta. Quando não há campeão escolhido, o produto usa a identidade neutra do Sparta:
símbolo oficial, geometria Spartan Signal e superfícies obsidianas. Ahri não é mais um fallback
implícito.

## Evolução temporal factual

### Fonte e gráficos

A tela consulta duas fontes que já existiam, sem alterar contratos:

- `GET /me/player-profile` por `fetchMyPlayerProfile`: a série
  `PlayerProfileOverview.performanceTrend` fornece uma observação real por partida;
- `GET /players/:puuid/growth-journey` por `fetchGrowthJourney`: preserva a comparação agregada já
  existente entre blocos de relatórios pós-game e o foco mais recorrente.

O gráfico principal usa exatamente `performanceTrend[].performanceIndex`. Cada ponto mantém o
`matchId`, o instante observado, o valor e o resultado factual da partida. Os quatro sparklines
secundários usam os mesmos jogos e somente campos já persistidos na série:

| Visualização              | Campo factual            |
| ------------------------- | ------------------------ |
| Linha/área principal      | `performanceIndex`       |
| KDA observado             | `kda`                    |
| Farm por minuto           | `csPerMinute`            |
| Visão por minuto          | `visionScorePerMinute`   |
| Participação em objetivos | `objectiveParticipation` |

O componente interno `TemporalChart` é SVG puro. Não foi adicionada biblioteca. Ele ordena as
observações pelo instante, não cria pontos intermediários, não aplica média móvel e não suaviza a
linha. Zero observado é preservado como zero. No histórico real validado havia **22 partidas**: o
gráfico produziu exatamente 22 pontos e 22 entradas no fallback textual; os quatro sinais auxiliares
produziram quatro sparklines.

Cada ponto é alcançável por foco e expõe um `<title>` factual. A lista textual abaixo do SVG torna o
conteúdo compreensível sem hover e sem depender somente de cor. Vitória e derrota diferenciam os
pontos, mas não são tratadas como julgamento de melhora.

### Histórico insuficiente

O limiar visual é de três observações reais. Abaixo dele, a tela não desenha gráfico nem sparkline e
mostra **“Histórico insuficiente para medir evolução”**, incluindo a quantidade observada. Testes
travam os dois comportamentos: oito partidas geram exatamente oito pontos, incluindo zero real; duas
partidas não geram uma série artificial.

## Identidade visual dinâmica

### Camada ambiente

`AppShell` passou a ser o único dono da arte temática global. A camada é não interativa
(`pointer-events: none`), fica atrás do conteúdo, usa baixa opacidade, `mask-image`, gradientes e
vinheta. Cards e heroes receberam véus translúcidos suficientes para preservar a leitura. A mesma
splash não é repetida nos heroes; uma arte diretamente informativa, como a do campeão escolhido no
Pré-game, continua permitida no conteúdo.

A troca de campeão/skin mantém o sistema de accent da Etapa 31M. O QA aplicou pela interface real:

- tema: **Adaptativo**;
- campeão: **Viego**;
- skin: **Viego Fera Lunar**, índice 1;
- splash: Data Dragon `Viego_1.jpg`;
- accent derivado: `hsl(23 100% 62%)`;
- duplicações da mesma splash em hero: zero.

Com intensidade visual reduzida, a camada ambiente fica oculta e o glass blur vai a zero. Com
`prefers-reduced-motion`, a transição cai para duração mínima e o gráfico continua disponível.

### Fallback Sparta e símbolo oficial

O antigo `DEFAULT_CHAMPION` fixo em Ahri foi substituído por um estado explícito de ausência de
campeão. Esse estado não é persistido como se fosse conteúdo do jogador. Sem skin escolhida:

- login e fluxos de autenticação usam `SpartaIdentityBackdrop`;
- o shell usa uma composição neutra Sparta;
- o Adaptativo volta ao accent estático seguro até existir uma splash real;
- nenhuma URL fictícia ou imagem gerada é usada.

O bloco vermelho com “S” foi substituído, nos contextos de marca, pelo favicon oficial já existente
em `apps/site/public/img/favicon.png`. Por necessidade do bundle Electron, uma cópia byte a byte vive
em `apps/desktop/src/renderer/src/assets/spartan-signal-mark.png`. Os três arquivos abaixo têm o
mesmo SHA-256:

`62e228ba9aa3aebf645b606becf0285f4909660cf9df1034f8e819b8e1ba29e6`

- `apps/site/public/img/favicon.png` — fonte auditada;
- `apps/desktop/build/icon.png` — ícone já empacotado;
- `apps/desktop/src/renderer/src/assets/spartan-signal-mark.png` — cópia para import do renderer.

Não houve ImageGen, download de logo ou redesenho do símbolo.

## Correções pontuais e acessibilidade

- strings visíveis corrigidas para **“League não detectado”**, **“campeões”**, “seleção” e “sessão”
  nos contextos encontrados;
- “Runa 8128” foi preservada: o renderer não possui catálogo factual de runas e o nome só existe
  quando já veio enriquecido/persistido. Integrar uma fonte nova da Riot seria fora do escopo;
- o foco programático do `<h1 tabindex="-1">` do commit `399d990` continua sem anel visual;
- Tab real levou o foco ao input de e-mail com anel de 2 px e halo;
- corrigida uma regra local de `Field.css` que anulava o `focus-visible` global por especificidade;
- iniciais sobre preenchimento de accent agora usam `--text-on-accent`, preservando a garantia de
  contraste dinâmica;
- gráficos têm descrição, pontos focáveis e fallback textual.

## QA no Electron real

O QA foi executado em uma única instância real do Electron via CDP. Antes e depois foram
confirmados zero processos residuais e zero listeners na porta temporária. A instrumentação de CDP
foi aplicada apenas durante o QA e removida; `apps/desktop/src/main/index.ts` terminou sem diff.

Matriz: **10 telas × 3 larguras = 30 combinações**.

- larguras: 1000, 1280 e 1600 px;
- telas: Login, Dashboard, Perfil, Champion Select, Histórico de drafts, Pré-game, Partidas e
  pós-game, Evolução pessoal, Histórico do motor e Configurações;
- 30/30 sem overflow estrutural;
- zero imagem quebrada;
- zero `NaN`/`undefined` visível;
- zero erro de console;
- zero exceção;
- zero resposta HTTP >= 400;
- uma única page target do app.

Contraste foi medido no DOM real nos temas Espartano, Obsidiana e Adaptativo. Cinco varreduras de
tela cobriram 588 ocorrências de texto e uma varredura adicional do estado Viego cobriu 65; nenhuma
ficou abaixo de AA. Densidade compacta, intensidade reduzida, reduced motion, foco real por Tab,
tooltip dos pontos e troca efetiva de skin foram confirmados.

Capturas produzidas pelo QA (fora do repositório):

- `01-login-sparta-1280.png`;
- `02-dashboard-sparta-1280.png`;
- `03-evolucao-real-sparta-1280.png`;
- `04-configuracoes-adaptativo-viego-skin-1280.png`;
- `05-dashboard-adaptativo-viego-skin-1280.png`.

Relatório bruto: `%TEMP%/sparta-qa-31m1/qa-report.json`.

## Testes de regressão

Foram adicionados testes para:

- quantidade exata de pontos e preservação de zero real;
- ausência de gráfico com histórico insuficiente;
- posição secundária da comparação agregada;
- fallback Sparta e uso do símbolo oficial no login;
- preservação do foco programático do título;
- estado neutro do contexto sem Ahri;
- símbolo oficial e backdrop neutro no shell.

Gates locais concluídos:

- versão 0.9.0 consistente nos 8 pontos versionados;
- Prisma Client gerado a partir do schema vigente;
- typecheck, lint e build completos nos cinco pacotes;
- **1.427 testes TypeScript**: 25 raiz, 117 site, 635 core, 98 riot, 376 API e 176 Desktop;
- analyzer: 1 teste aprovado.

O CI remoto é confirmado após o push final.

## Não regressão funcional

O diff de produto está contido em `apps/desktop/src/renderer/`. Não há mudanças em `packages/core`,
`packages/riot`, `apps/api`, Prisma, banco, auth, sessões, LCU, Caddy, Docker, site, pesos, scoring,
métricas, provenance ou contratos.

Consulta somente leitura ao Postgres confirmou:

- `release-etapa27c-v1`: `ACTIVE`, com o ponteiro apontando para ela;
- `artifactHash`:
  `8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90`;
- `configHash`:
  `fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38`;
- `validatedArtifactHash == artifactHash`;
- bundle mais recente verificado: `replay-input-bundle/2.0.0`, `EXACT_REPLAY`, zero divergências,
  zero rejeições e zero dependências ausentes.
