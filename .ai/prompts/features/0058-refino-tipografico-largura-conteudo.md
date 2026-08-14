---
status: IMPLEMENTADA
solicitado_em: 2026-08-14 17:00
implementado_em: 2026-08-14 17:20
---

# Etapa 31O — Refino tipográfico e largura de conteúdo do site

## Pedido original

> ETAPA — REFINO TIPOGRÁFICO E LARGURA DE CONTEÚDO DO SITE. Não é um novo redesign — passe
> exclusivo sobre largura de texto, tipografia, comprimento de linha, hierarquia e ritmo
> vertical. Screenshots e efeitos visuais ficam para uma etapa futura. Em telas largas, muitas
> seções têm coluna de texto excessivamente estreita: título quebrando cedo demais, parágrafo com
> cara de coluna mobile dentro de desktop, área lateral vazia grande, páginas legais
> desnecessariamente estreitas, sensação visual menos madura que o resto do design. Não resolver
> alargando tudo indiscriminadamente — criar/refinar no design system categorias claras de
> largura de conteúdo (ex.: copy compacta, copy marketing, copy editorial, copy legal) com
> nomes/tokens/classes adequados ao código atual. Revisar especialmente na home: Hero (permitir
> mais largura em desktop sem competir com a screenshot; títulos de marketing devem ocupar 1-2
> linhas quando houver espaço, sem forçar quebra artificial), título/subtexto de "Quatro
> leituras...", seção "Como funciona", seção "Capturas do aplicativo", Transparência,
> Disponibilidade, CTA final. Página "Como funciona": aumentar largura útil de leitura sem virar
> linha gigante. Página "Funcionalidades": revisar largura da introdução, copy dos cards,
> distância entre título e grade — sem reconstruir a grade se já funciona. Páginas legais
> (`/termos`, `/privacidade`, `/seguranca`, `/excluir-conta`): largura confortável equivalente a
> 70-90 caracteres por linha, sem alterar nenhuma palavra do conteúdo legal ou dos disclaimers
> Riot. Ritmo vertical: reduzir seletivamente ~15-25% onde havia espaço excessivo, sem compactar
> o site inteiro. Responsividade: mudanças majoritariamente de desktop, validar no mínimo em
> 360/390/768/1280/1440/1920, mobile sem regressão. Tipografia: revisar max-width, font-size,
> line-height, letter-spacing, largura de título/parágrafo — evitar só aumentar font-size.
> Explicitamente fora de escopo: identidade Spartan Signal, paleta, screenshots, máscaras de
> conta, efeitos de imagem, header, comportamento do Caddy, rotas, API, autenticação, tickets,
> Desktop, infraestrutura, conteúdo legal/factual, status real do produto. Não adicionar
> bibliotecas. Não adicionar animações. Não fazer um redesign novo. [Nota: a mesma mensagem
> pediu, ao final, "também adicione mais elementos interativos/transições ao rolar a página" —
> tensão com "não adicionar animações", resolvida estendendo o mecanismo de reveal já existente
> (ver notas de implementação) em vez de introduzir algo novo.] Entregáveis finais: zero
> overflow, zero regressão mobile, preservar testes existentes e ajustar só quando necessário,
> rodar testes/typecheck/lint/build aplicáveis, commit/push normal, relatar quais
> classes/tokens de largura foram criados/alterados, quais páginas foram ajustadas, e se alguma
> seção ficou deliberadamente estreita e por quê.

## Notas de implementação

Relatório técnico completo em `docs/site-typography-width.md` (espelhado em
`.ai/specs/site-typography-width.md`). Resumo:

- 4 tokens novos em `tokens.css` (`--measure-compact` 34ch, `--measure-marketing` 62ch,
  `--measure-editorial` 74ch, `--measure-legal` 86ch), cada um com propósito de leitura
  documentado em comentário.
- `.sp-container--prose` (páginas legais + `status.html`) passou de 68ch para `--measure-legal`
  (86ch); nova classe `.sp-container--editorial` (74ch, só usada em `como-funciona.html`);
  `.sp-prose` deixou de definir largura própria (evita duas fontes de verdade competindo).
- `.sp-hero__copy` (home): de `46rem` fixo para `clamp(46rem, 32vw + 22rem, 58rem)` — confirmado
  por inspeção do HTML que não compete com a captura (blocos empilhados, não lado a lado).
- `.sp-section__head` 62ch→74ch, `.sp-lede`/`.sp-hero__sub` 60/54ch→62ch, `.sp-cta h2` 22ch→26ch,
  `.sp-footer__brand p` tokenizado (mesmo valor, 34ch).
- `funcionalidades.html`: seção de pilares trocou `.sp-container` por `.sp-container--wide`,
  alinhando com o mesmo componente na home; grid (`.sp-pillars`) não foi tocado.
- `--space-9/10/12/14` (degraus grandes de espaçamento) reduzidos 14-21%; `--space-1` a `--space-8`
  (espaço interno de componente) intocados de propósito.
- 8 seções em 6 páginas internas ganharam `data-reveal` (mecanismo já existente desde a Etapa
  31M, com guarda de `prefers-reduced-motion` e sem esconder conteúdo sem JS) — resolve a tensão
  do pedido sem introduzir nada novo.
- **Nenhum teste novo**: mudança 100% CSS/atributo de apresentação, sem comportamento novo a
  cobrir; os 102 testes já existentes do site continuaram passando sem alteração (nenhum fixava
  valor de `ch`/`px`). `pnpm typecheck`/`lint`/`build`/`test` limpos nos 5 pacotes + analyzer
  Python 1/1 — 1340 testes no total, mesmo número de antes.
- Validado no dev server real via `getComputedStyle`/`getBoundingClientRect` em 360/390/768/
  1280/1440/1920px, cobrindo as 9 páginas públicas reais em pelo menos uma largura cada e as
  páginas mais alteradas (home, como-funciona, funcionalidades, privacidade) em todas as 6
  larguras. Zero overflow em todas as combinações. Screenshot não foi possível nesta sessão
  (Browser pane sem composição de frame, mesma limitação da Etapa 31M) — validação por
  DOM/CSSOM, não visual humana.
- Nada tocado fora de `apps/site`: identidade, paleta, screenshots, header, Caddy, rotas, API,
  Desktop, conteúdo legal (confirmado presente e intocado, incluindo marcadores `[Revisão
  jurídica necessária]`).
