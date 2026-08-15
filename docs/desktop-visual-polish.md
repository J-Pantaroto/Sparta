# Etapa 31M — Polimento visual final do Desktop

**Data:** 2026-08-15

**Escopo:** exclusivamente `apps/desktop/src/renderer/` — acabamento visual, hierarquia,
profundidade, contraste, estados interativos e consistência entre telas. Nenhum redesign
estrutural, nenhuma funcionalidade nova.

**Resultado:** **30/30 combinações tela × largura sem overflow estrutural**, **628 elementos de
texto medidos nos 3 temas com 0 abaixo de AA**, zero erro de console, zero exceção, zero resposta
HTTP >= 400.

## Princípio que guiou a etapa

O design system já estava maduro (tokens por função, um CSS por componente, prefixo `sp-`,
nenhuma classe legada). Uma etapa de "polimento" nesse estado corre o risco de virar mudança de
gosto — trocar valores porque parecem melhores, sem conseguir defender o porquê depois.

Por isso o critério aqui foi **medir antes de mexer**: cada alteração abaixo nasceu de um número
(contraste WCAG, pixels de overflow, contagem de valores divergentes), não de impressão. O que não
tinha defeito mensurável não foi tocado.

## 1. Regra de contraste do destaque — a decisão mais importante

`--color-accent` é dinâmico: muda com a skin escolhida, derivado da splash art
(`theme/accent-color.ts`). A faixa é travada em S >= 55% e L entre 45% e 62% para garantir que a
cor seja **visível**. Medindo, essa trava **não garante que ela seja legível como texto**:

| Matiz            | L=45% | L=62% (teto) |
| ---------------- | ----- | ------------ |
| Azul (240)       | 2,06  | 4,13         |
| Roxo (270)       | 2,58  | 4,90         |
| Vermelho (0)     | 3,10  | 5,43         |
| Amarelo (60)     | 8,42  | 12,09        |

O vermelho Espartano padrão (`#dc2626`) media **3,94:1** — reprova AA para texto normal. E o
accent era usado como cor de texto em **11 lugares** (eyebrow de seção, eyebrow do herói, link de
autenticação, ícone do item ativo da sidebar, inicial da conta, etc.).

**Correção**: separação de papéis, a mesma regra que o site já aplica desde a Etapa 31M do site —
princípio compartilhado, não cópia de design.

- `--color-accent` — preenchimento, borda, marcador. **Nunca texto.**
- `--color-accent-text` — a única aprovada para texto sobre superfície escura. Mesma matiz e
  saturação (preserva a identidade da skin), clareada até cruzar 4,5:1.

Para skins dinâmicas isso é derivado em runtime por `readableAccentText`, que sobe a luminosidade
em passos de 1% até o limiar. Estático: Espartano `#e24b4b` (4,84:1), Obsidiana `#9b8afb` (6,73:1,
já passava).

## 2. Tinta sobre o preenchimento do destaque

O token `--text-on-accent` afirmava, em comentário, que tinta escura tem "contraste melhor e mais
estável que branco pra qualquer matiz" dentro da faixa travada. **A medição derrubou a afirmação**:
com tinta escura sempre, o pior caso da faixa cai a **2,04:1**, e o `.sp-skip-link` — um elemento
de acessibilidade — media **4,14:1** no tema padrão.

`readableInkOnAccent` passa a escolher entre preto e branco **por medição, a cada accent**, o que
leva o pior caso da faixa inteira a **4,58:1**.

Detalhe medido: a tinta escura precisou ser **preto puro** (`#000000`), não o quase-preto `#08080a`
usado no resto do app. Com `#08080a`, mesmo escolhendo a melhor das duas opções, o pior caso ainda
caía a 4,47:1 e reprovava. A diferença só importa aqui, onde a tinta disputa contraste com um
preenchimento saturado.

## 3. `--text-muted` reprovava AA em toda superfície

`#6f6f7b` media 3,38:1 sobre `--surface-4` e 3,99:1 sobre `--surface-1` — abaixo de AA em **todas**
as superfícies. E é justamente o token dos textos **menores** do app (10–11px: rótulo de grupo da
sidebar, cabeçalho de tabela, meta de identidade, hint de campo), ou seja, a pior combinação
possível: menor tamanho com o menor contraste. São 102 usos.

`#8a8a98` passa em todas (4,93:1 na mais clara) e preserva os três degraus de hierarquia sobre
`--surface-4`: **15,27 / 6,87 / 4,93**.

## 4. Anel de foco: promessa não implementada e cor sem garantia

Duas correções no mesmo lugar:

1. O anel usava `--color-accent` — pelo item 1, um azul em L=45% daria 2,06:1, abaixo dos 3:1 que
   um indicador de foco precisa. Passou a usar `--color-accent-text`.
2. O comentário prometia "um halo escuro por trás pra continuar legível sobre splash art", mas
   **nenhuma regra implementava isso** — sobre o herói (splash clara) o anel sumia. O halo agora
   existe, via `box-shadow` externo.

Confirmado no app real com Tab de verdade (`Input.dispatchKeyEvent`): `:focus-visible` ativo,
`outline-width: 2px`, cor `rgb(226, 75, 75)` (a variante legível) e o halo `rgba(4,4,5,0.72) 0 0 0
4px`.

## 5. Profundidade: superfícies que não projetavam nada

`.sp-card` tinha apenas `--glass-highlight` (realce **interno** no topo) e nenhuma sombra
projetada — lia como adesivo colado no fundo, não como superfície apoiada sobre ele. Dois tokens
novos:

- `--elevation-raised` — repouso (realce interno + sombra de contato).
- `--elevation-hover` — sombra mais profunda, para o `translateY(-1px)` do hover ter profundidade
  correspondente em vez de o card apenas escorregar para cima.

Cada variante ganhou a elevação coerente com seu papel: `feature` sobe para `--shadow-lg` (a
hierarquia passa a ser legível pela profundidade, não só pela cor da borda); `flat` fica sem sombra
(agrupa sem competir); `inset` ganha sombra **interna** (é conteúdo afundado, o oposto de elevado).

Também foi adicionado o estado **pressed** que faltava em cards clicáveis — só os botões tinham, e
um clique em card não dava nenhum retorno tátil.

## 6. Tracking: a mesma peça com cinco espaçamentos diferentes

Auditoria de `letter-spacing`: **21 valores literais**, dos quais **19 em rótulos UPPERCASE
semanticamente idênticos** (eyebrow de seção, cabeçalho de tabela, rótulo de grupo) usando **cinco
valores distintos** — 0.04, 0.06, 0.08, 0.1 e 0.12em. A mesma peça aparecia com espaçamento
diferente dependendo da tela.

Três tokens por função (`--tracking-tight`, `--tracking-label`, `--tracking-caps`), com
`--tracking-caps` em 0.06em — a **moda** dos valores já existentes, escolhida de propósito para
unificar os cinco sem redesenhar nenhum. Zero `letter-spacing` literal restante fora de
`tokens.css`.

## 7. Ícones

Stroke já era uniforme (`2` em 100% dos SVGs medidos). Tamanhos tinham 8 degraus: 16 (70 usos), 13
(48), 18 (46), 14 (18), 15 (7), 22 (5), 20 (1), 11 (1). Normalizado apenas o desvio claro —
**15px → 16px** (mesma função de ícone inline padrão, off-by-one contra o degrau dominante), em 11
chamadas TSX e 1 regra CSS. Os degraus 13/14/18/22 têm uso consistente e contexto próprio; 11 e 20
ficaram como estão, registrados aqui em vez de mexidos sem critério.

## 8. Bugs reais de layout encontrados pelo QA

O QA mediu overflow **estrutural** (conteúdo que estoura o próprio container), excluindo
containers com scroll declarado e elementos truncando por `text-overflow: ellipsis` — truncamento
com reticências é comportamento correto e sempre produz `scrollWidth > clientWidth`, então contá-lo
geraria falso positivo.

Primeira execução: **7 de 30 combinações com problema**. Três defeitos distintos:

### 8.1 Itens da build silenciosamente escondidos

`.sp-recent-match__loadout` é `flex-wrap: nowrap` + `overflow: hidden` numa coluna `auto`. Os 8
ícones de item pedem 264px; a coluna recebia **160px** no cartão do Dashboard. Resultado: **~4 dos
8 itens desapareciam sem nenhum indicativo** — o usuário via meia build achando que via a build
inteira. Perda real de informação, não detalhe decorativo.

Corrigido fazendo a configuração **quebrar em duas fileiras** dentro de uma coluna de 120px (4
ícones por fileira: 4×26 + 3×4 = 116px), preservando **todos** os itens observados.

### 8.2 Linhas de partida escapando do cartão

`.sp-dashboard-matches` é `display: grid` sem `grid-template-columns`. A trilha implícita é `auto`,
que resolve para o min-content do filho (~586px por causa dos mínimos de `.sp-recent-match`) — com
o cartão em 530px, a linha **vazava 110px para fora**, em todas as larguras de janela.

Corrigido com `grid-template-columns: minmax(0, 1fr)` nas três listas de partida, permitindo a
trilha encolher abaixo do min-content do filho.

### 8.3 Media query que nunca poderia resolver o caso

A mesma `RecentMatchRow` serve o Perfil (coluna larga) e o Dashboard (cartão estreito). Havia um
`@media (max-width: 1280px)` degradando as colunas — mas media query enxerga o **viewport**, e o
cartão do Dashboard continua com ~530px mesmo numa janela de 1600px. Por isso o Dashboard estourava
em 1000, 1280 **e** 1600.

Substituído por **container queries** (`container-type: inline-size`, Chromium 105+; o app roda em
Electron 39 / Chromium 142). A linha passa a reagir à largura **disponível**. Cortes medidos, não
arbitrários — somando mínimos + gaps + padding: linha completa ~924px, sem
objetivo/disponibilidade ~798px, sem a configuração ~662px; os breakpoints ficam logo acima de cada
soma.

### 8.4 Outros dois

- `.sp-draft-history__identity`: só o `span` truncava, o `strong` não — o título definia o
  min-content e **invadia a coluna seguinte em 17–19px**. Além disso a coluna era espremida a 64px,
  deixando o subtítulo em ~10 caracteres seguidos de reticências (texto que não informa nada).
  Corrigido com truncamento no `strong` e piso de 190px na coluna.
- `.sp-dashboard-system__row`: "Sincronização" (palavra única, sem onde quebrar) vazava 9px numa
  coluna de 67px. Piso de 96px no rótulo.

Após as correções: **30/30 limpo**.

### 8.5 Achado posterior: anel de foco em alvo programático

Ao capturar o tour de telas do produto (depois do commit da etapa), a tela de entrar apareceu com
um **anel vermelho em volta do título "Entrar"**. Investigado no app real: o `<h1>` do
`AuthLayout` tem `tabindex="-1"` e recebe `.focus()` quando a etapa muda — padrão de
acessibilidade legítimo, para o leitor de tela pousar no lugar certo. O Chromium mesmo assim casa
`:focus-visible` nesse elemento.

O anel **já existia antes desta etapa** (o `:focus-visible` global sempre desenhou outline); o
halo adicionado no item 4 apenas o tornou óbvio, transformando um contorno fino num retângulo em
volta do título. O mesmo valia para o `<main tabindex="-1">` do `AppShell`, destino do skip-link —
usá-lo desenharia um anel em volta da área de conteúdo inteira.

Corrigido com `[tabindex="-1"]:focus-visible { outline: none; box-shadow: none }`: alvo de foco
programático não é posição de navegação por teclado, então não recebe indicador visual. Confirmado
no app real que o título **continua recebendo foco** (o anúncio para leitor de tela segue
funcionando) e que o Tab real continua mostrando o anel de 2px + halo nos controles.

## QA visual executado

Electron real via CDP (não aba de navegador), conta real Zekerus#117, sessão injetada por
`window.sparta.session.set` — a mesma API IPC protegida por `safeStorage` que a tela de login usa,
apenas preenchida programaticamente.

- **10 telas × 3 larguras (1000/1280/1600)** = 30 combinações → 0 overflow estrutural, 0 imagem
  quebrada, 0 `NaN`/`Infinity`/`undefined`, 0 erro de console, 0 exceção, 0 HTTP >= 400.
- **Contraste medido no DOM real**, cada texto contra o fundo efetivamente pintado atrás dele
  (subindo a árvore até achar um fundo opaco): Espartano/Dashboard 196 textos, Obsidiana/Perfil 400,
  Adaptativo/Champion Select 32 — **628 no total, 0 abaixo de AA**.
- **Temas** aplicados pela tela real de Configurações: os três (`spartan`/`obsidian`/`adaptive`)
  trocam e o eyebrow permanece >= 4,5:1 em todos.
- **Densidade**: confortável 64px → compacta 56px de topbar.
- **Intensidade visual**: `--glass-blur` 20px → 0px e `backdrop-filter` do card acompanha.
- **Caminho dinâmico** (o mais importante para a regra de contraste): tema Adaptativo com skin
  real derivou `hsl(218 100% 62%)`, com `accent-text` a **5,43:1** e tinta `#000000` a **5,96:1**
  sobre o preenchimento — ambos AA, derivados em runtime.
- **Foco por teclado** com Tab real e **reduced motion** (transições caem para ~0s e nenhum
  conteúdo fica escondido) confirmados.
- 18 screenshots capturados (6 telas × 3 larguras).

### Achado metodológico

Durante o QA, `pkill -f electron` (Git Bash) **não mata processo Windows**. Cinco instâncias do
Electron ficaram empilhadas e o CDP conectava sempre à mais antiga — que servia um bundle anterior.
Isso produziu uma leitura falsa (`--text-on-accent` aparecendo como `#08080a` quando o bundle em
disco já tinha `#ffffff`). Detectado ao rastrear a origem do valor, corrigido matando os processos
via PowerShell e **revalidando tudo do zero numa instância única**. Os números deste relatório são
todos da instância limpa.

## Testes

`theme/accent-color.test.ts` (novo, 7 testes) trava as duas garantias de contraste percorrendo a
faixa travada inteira (72 matizes × 10 saturações × 18 luminosidades = 12.960 combinações por
asserção). A luminância relativa é **reimplementada no teste a partir da especificação WCAG**, em
vez de importada do módulo sob teste — reusar a função interna faria o teste concordar consigo
mesmo mesmo que os dois lados estivessem errados juntos.

Confirmado que o teste **falha sem a correção**: desligando a subida de luminosidade, 3 dos 5
testes daquele bloco reprovam.

**1422 testes** no monorepo (raiz 25, site 117, core 635, riot 98, api 376, desktop **171** — eram
164). `typecheck`/`lint`/`build` completos nos 5 pacotes. `apps/api` reproduziu a flakiness já
documentada desde a Etapa 26b sob execução paralela (2 arquivos, conjunto diferente a cada
execução) e passou **376/376 isolado** — o pacote não tem um único arquivo tocado por esta etapa.

## Não regressão

O diff inteiro está contido em `apps/desktop/src/renderer/` — **zero arquivo** em `packages/`,
`apps/api`, `apps/site`, `infra/`, `prisma/` ou Docker. Como o motor, os pesos, as métricas, a
proveniência e os contratos de API não têm arquivo tocado, não existe caminho pelo qual a
recomendação pudesse mudar.

Confirmado direto no Postgres: `release-etapa27c-v1` `ACTIVE`, `artifactHash` `8878a657…` e
`configHash` `fa9dbde1…` idênticos aos documentados desde a Etapa 27c, com o ponteiro conferindo.

## Preservado deliberadamente

- **Rótulos crus de runa** ("Runa 8128") no histórico de partidas. Não existe catálogo local de
  runas; inventar um nome violaria a regra de dado real do projeto. Continua registrado como item
  LOW/POLISH da auditoria pré-final.
- **Ícones em 11px, 20px, 22px** — contextos próprios e uso consistente; normalizar sem critério
  seria mudança de gosto.
- **Identidade visual**: paleta, glassmorphism, splash art por skin, os três temas, densidade e
  intensidade — todos intactos. As cores semânticas (verde/amarelo/vermelho) continuam fixas de
  propósito.
- **LCU read-only, `draftRevision`, `gameId`, cancelamento de requisição obsoleta, congelamento
  visual do snapshot e as regras factual/proveniência** — nenhum arquivo desses caminhos foi
  tocado.
- **Gates de produção, RSO, submissão Riot, API pública** — fora de escopo por instrução explícita
  e não tocados.
