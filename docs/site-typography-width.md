# Refino tipográfico e largura de conteúdo do site (Etapa 31O)

Passe exclusivo de largura de texto, tipografia, comprimento de linha, hierarquia e ritmo
vertical sobre `apps/site`, publicado em `spartagg.com.br`. **Nenhuma mudança de identidade
visual, paleta, screenshot, header, comportamento do Caddy, rota, backend ou conteúdo legal** —
só CSS de largura/espaçamento e duas classes de container novas. Continuação direta da Etapa
31M (identidade Spartan Signal) e 31N (rotas limpas + suporte), que já haviam entregue o sistema
de design; esta etapa corrige uma lacuna que ficou de fora das duas: colunas de texto estreitas
demais em telas largas, sem uma categoria de largura por tipo de conteúdo.

## 1. Diagnóstico (antes de alterar)

Inspeção de `tokens.css`, `site.css` e das 10 páginas HTML confirmou o problema descrito no
pedido, com uma causa concreta: **duas categorias de conteúdo textualmente muito diferentes
compartilhavam a mesma largura**. `.sp-container--prose` + `.sp-prose` (68ch + gutters) era usada
tanto pelas 4 páginas legais (`termos`, `privacidade`, `seguranca`, `excluir-conta`) quanto pelo
corpo de "Como funciona" — prosa legal densa e escaneada por título numerado, e prosa editorial
explicativa lida de ponta a ponta, no mesmo valor. `status.html` usava só `.sp-container--prose`
(sem `.sp-prose`) para uma lista de status, então esse container não era 100% código morto.

`.sp-hero__copy` (texto do herói da home) tinha `max-width: 46rem` **fixo**, mesmo não competindo
por espaço com a captura — os dois (`sp-hero__copy` e `sp-hero__art`) são blocos empilhados
verticalmente, não lado a lado, então travar em 736px em qualquer largura de tela deixava até
~500px de espaço morto ao lado em desktop grande. `funcionalidades.html` usava `.sp-container`
(1200px) na seção de pilares, enquanto a seção equivalente da home usava `.sp-container--wide`
(1400px) para o mesmo componente (`.sp-pillars`) — inconsistência sem motivo técnico.

## 2. Categorias de largura de leitura (novo, `tokens.css`)

Quatro tokens novos, cada um com um propósito de leitura diferente — não é só estética:

```css
--measure-compact: 34ch;   /* selo, legenda, blurb curto — nunca vira parágrafo de verdade */
--measure-marketing: 62ch; /* subtítulo/lede de seção — punchy, poucas linhas por desenho */
--measure-editorial: 74ch; /* corpo explicativo (Como funciona) — lido de ponta a ponta */
--measure-legal: 86ch;     /* prosa legal densa — ESCANEADA por título, não lida linearmente */
```

A diferença editorial (74ch) vs. legal (86ch) é deliberada: texto legal é referência consultada
por seção numerada, e aceita uma linha mais larga sem perder conforto porque o leitor pula entre
blocos em vez de seguir linha a linha; o "Como funciona" é lido em sequência, então fica mais
estreito mesmo sendo bem mais largo que o valor único (68ch) que os dois compartilhavam antes.

Aplicação:

| Classe/seletor | Antes | Depois |
| --- | --- | --- |
| `.sp-container--prose` (páginas legais + `status.html`) | 68ch + gutters | `--measure-legal` (86ch) + gutters |
| `.sp-container--editorial` (novo; só "Como funciona") | — | `--measure-editorial` (74ch) + gutters |
| `.sp-prose` | definia a própria largura (68ch) | só tipografia — a largura vem do container (evita duas fontes de verdade competindo na mesma propriedade) |
| `.sp-section__head` (título+lede de toda seção) | 62ch | `--measure-editorial` (74ch) |
| `.sp-lede` / `.sp-hero__sub` | 60ch / 54ch | `--measure-marketing` (62ch) |
| `.sp-footer__brand p` | 34ch literal | `--measure-compact` (34ch, tokenizado) |
| `.sp-hero__copy` (só a home) | `46rem` fixo | `clamp(46rem, 32vw + 22rem, 58rem)` — cresce em telas largas, nunca menor que antes |
| `.sp-cta h2` | 22ch | 26ch (leve alívio; continua um título de impacto centralizado, categoria própria) |

`como-funciona.html` trocou `sp-container--prose` por `sp-container--editorial` no bloco das 6
etapas — único ajuste de classe em HTML fora da correção de container do `funcionalidades.html`
(ver §4). As 4 páginas legais e `status.html` não precisaram de nenhuma mudança de HTML: a
largura maior chegou só pela mudança do valor do container que já usavam.

## 3. Hero da home: crescer sem competir com a captura

Confirmado por inspeção do HTML (`index.html`) antes de mexer: `.sp-hero__copy` e
`.sp-hero__art` (a captura) são dois blocos filhos diretos de `.sp-container.sp-container--wide`,
**empilhados verticalmente** — não há grid/flex lado a lado. Ou seja, largura de texto maior no
Hero nunca reduz o espaço da captura; a trava em 46rem era puramente um limite arbitrário sem
função de layout.

`max-width: clamp(46rem, 32vw + 22rem, 58rem)` — o mínimo do clamp (`46rem`) preserva o valor
antigo em telas menores (nunca fica mais estreito que antes); o preferido cresce com a viewport;
o teto (`58rem` = 928px) evita uma linha de parágrafo longa demais mesmo em monitores muito
largos. Medido: 736px em 1280px de viewport → **761,6px**; em 1920px → **928px** (o teto). O
título continua com a quebra deliberada em duas linhas (`<span class="sp-hero__accent">
display:block`) — isso é identidade visual (a linha crimson de destaque), não um efeito colateral
de largura estreita, e não foi tocado.

## 4. `funcionalidades.html`: alinhar com o padrão já usado na home

A seção de pilares (`.sp-pillars`, 8 itens — mais que os 4 da home) usava `.sp-container` simples
(1200px) enquanto a seção equivalente da home (`.sp-pillars`, mesmo componente) já usava
`.sp-container--wide` (1400px). Sem motivo para divergir e sem mudança no grid em si
(`repeat(auto-fit, minmax(232px, 1fr))` continua intocado — "não reconstruir o grid, só revisar
largura", conforme pedido) — só a classe do container mudou. Medido: 1265px → **1400px** (viewport
grande), passando a caber 5 colunas em vez de 4 no mesmo espaço, melhor aproveitamento do desktop
largo com um componente já existente.

Introdução (`.sp-hero__sub`) e distância título↔grade (`.sp-section__head { margin-bottom }`) já
se beneficiam das mudanças de §2 e §5 sem edição adicional, por reuso das classes compartilhadas.

## 5. Ritmo vertical: reduzido seletivamente, não compactado

`--space-9/10/12/14` (os degraus **grandes** — padding de `.sp-section`, gap do showcase,
margem do rodapé, padding do herói/CTA) foram reduzidos entre 14% e 21%:

| Token | Antes | Depois | Redução |
| --- | --- | --- | --- |
| `--space-9` | 56px | 48px | -14% |
| `--space-10` | 72px | 60px | -17% |
| `--space-12` | 104px | 84px | -19% |
| `--space-14` | 136px | 108px | -21% |

Deliberadamente **não** tocados: `--space-1` a `--space-8`, que controlam espaço **dentro** de
componentes (padding de card, botão, linha de status, gap de bullet) — reduzir esses comprimiria
o site inteiro, e o pedido era cortar o excesso **entre** blocos, preservando "respiro entre
blocos importantes". Como esses quatro tokens já alimentavam `padding-block` de `.sp-section`/
`.sp-section--tight`, `margin-bottom` de `.sp-section__head`, `padding-block` do herói, `gap` do
showcase, `padding` do CTA e `margin-top` do rodapé — a redução chegou a todas essas propriedades
de uma vez, sem editar cada regra individualmente.

## 6. Elementos interativos ao rolar a página

O pedido continha uma tensão: "não adicionar animações" na seção de restrições, mas terminava
pedindo "mais elementos interativos/transições ao rolar a página". Resolvido pelo caminho mais
conservador possível, sem introduzir nada novo: o site já tem um mecanismo de *reveal* ao rolar
(`data-reveal` + `IntersectionObserver`, `src/scripts/layout.ts`, desde a Etapa 31M) que respeita
`prefers-reduced-motion` e nunca esconde conteúdo sem JS (guarda `html[data-reveal-ready]`,
escrita só pelo próprio script). Esse mecanismo cobria **só a home** — as 9 páginas internas não
tinham nenhuma seção marcada. Estendido a essas páginas (8 seções em 6 arquivos:
`como-funciona.html`, `funcionalidades.html`, `privacidade.html`, `termos.html`,
`seguranca.html`, `excluir-conta.html`, `status.html`, `suporte.html`), sempre no bloco de
conteúdo principal, nunca no herói (mesmo padrão da home). Zero código novo, zero biblioteca,
zero animação nova — só ampliação de cobertura de uma animação que já existia e já era aprovada.

## 7. O que ficou deliberadamente de fora

Nenhuma mudança em: identidade Spartan Signal, paleta, screenshots, máscaras de conta,
header/nav, comportamento do Caddy, rotas, API, autenticação, tickets, Desktop, infraestrutura,
conteúdo legal ou factual (incluindo os marcadores `[Revisão jurídica necessária]`, confirmados
presentes e intocados por leitura direta do DOM depois da mudança). `.sp-showcase__row` (coluna
de texto estreita ao lado da captura em "Capturas do aplicativo") não foi alterada — o pedido
excluiu explicitamente screenshots e efeitos visuais desta etapa, e aquela coluna estreita é
desenho deliberado, documentado desde a Etapa 31M, para não reduzir a captura a meia escala.
`--content-max`/`--content-wide` (largura de *container*, não de texto) não mudaram, exceto o
único container que trocou de classe (`funcionalidades.html`, já registrado em §4).

## 8. Validação

**102 testes do site** (suíte pré-existente, sem alteração — nenhuma asserção fixava um valor de
`ch`/`px` específico, então a mudança de medida não quebrou nada) + typecheck/lint/build limpos
nos 5 pacotes TypeScript + analyzer Python 1/1. **1340 testes no total do monorepo**, mesmo
número de antes da etapa (CSS/HTML puro, sem teste novo necessário — não há comportamento novo a
cobrir, só apresentação).

Medido no dev server real (Vite), via inspeção de `getComputedStyle`/`getBoundingClientRect`
(não captura de tela — a Browser pane não estava disponível pra compor frames nesta sessão,
mesma limitação já registrada na Etapa 31M):

| Largura | Páginas conferidas | Overflow horizontal |
| --- | --- | --- |
| 360px | home, como-funciona | 0/2 |
| 390px | as 9 páginas públicas reais (todas exceto `404.html`) | 0/9 |
| 768px | home, como-funciona, funcionalidades, privacidade | 0/4 |
| 1280px | home, funcionalidades, privacidade | 0/3 |
| 1440px | home, funcionalidades | 0/2 |
| 1920px | home, como-funciona, funcionalidades, privacidade | 0/4 |

Valores medidos batendo com o cálculo esperado em cada caso (herói 736→928px em 1920px; prosa
editorial 68ch→734px; prosa legal 68ch→838px; container de pilares 1265→1400px). Um artefato de
ferramenta foi encontrado e contornado durante a validação: `resize_window` sem uma navegação
completa em seguida deixava o motor de layout com o cálculo de `vw` desatualizado (media queries
recalculavam, mas as expressões `vw` dentro de `clamp()` ficavam presas na largura anterior) —
contornado navegando (recarregando) a página depois de cada `resize_window` e antes de medir;
não é um bug do site, é uma particularidade da ferramenta de automação usada só nesta sessão de
validação.

Zero erro de console em todas as páginas visitadas. O mecanismo de reveal foi confirmado
funcionando como desenhado: neste ambiente de teste `prefers-reduced-motion: reduce` retorna
`true` por padrão, e a guarda correspondente pulou a animação corretamente (conteúdo em
`opacity: 1`, `data-reveal-ready` nunca escrito) — o mesmo comportamento documentado na Etapa
31M para essa condição, agora também presente nas 8 seções novas.
