# Identidade visual do site público — "Spartan Signal" (Etapa 31M)

Redesign completo de `apps/site`, o site institucional publicado em `spartagg.com.br`. Escopo
exclusivamente de identidade, conteúdo público e acessibilidade — **nenhuma alteração de
infraestrutura** (Caddyfile, Dockerfile.site, DNS, MX, firewall, API, Postgres, Redis, auth, RSO
não foram tocados).

Mobalytics, U.GG e Blitz foram usados como referência de **maturidade** (hierarquia, densidade,
tratamento de captura) — nenhum layout, componente, cor, ícone ou texto foi copiado.

## 1. O conceito

A identidade não vem de arte temática (soldado, capacete, escudo desenhado). Vem de **geometria**:

| Elemento | Como aparece |
| --- | --- |
| Ponta de lança | Marcador de seção (`::before` do `.sp-eyebrow`), bullet de `.sp-facts`, separador de `.sp-chain`, nó do `.sp-stage` |
| Corte diagonal | `--chamfer` (canto superior direito + inferior esquerdo) em frames de captura, CTA primário e botão primário |
| Linha de formação | `.sp-section--ruled::before` (régua que não fecha nas pontas), régua horizontal do `.sp-flow` |
| Nó de status | `.sp-frame__node`, `.sp-signal__dot`, `.sp-status-dot` |
| Instrumento | Todo rótulo, status e numeração em `--font-mono` versal com `letter-spacing` largo |

Raio de borda quase zero (`--radius-xs: 2px`), superfícies rígidas, chanfro **seletivo** — a regra
explícita no CSS é não transformar todo elemento em forma temática.

## 2. Paleta e a regra de contraste que ela impõe

```
Obsidian  #07080A    Iron   #0D1015    Steel  #171B21
Bone      #F2F3F5    Ash    #8F969F    Faint  #7D848D
Crimson   #E21D2E    Signal #FF3347
```

Contraste **medido** (não estimado) contra Obsidian / Steel:

| Cor | vs Obsidian | vs Steel | Uso permitido |
| --- | --- | --- | --- |
| Bone | 18,9:1 | 16,4:1 | qualquer texto |
| Ash | 6,7:1 | 5,8:1 | corpo |
| Faint | 5,3:1 | 4,6:1 | legenda (ainda AA normal) |
| **Signal** | **5,6:1** | 4,8:1 | **link e texto pequeno em vermelho** |
| **Crimson** | **4,2:1** | 3,7:1 | **só preenchimento, borda, nó e texto GRANDE** |

Essa divisão é a decisão de design mais importante da paleta e **não é intercambiável**: Crimson
reprova AA em texto normal. Trocar `--signal` por `--crimson` num link quebra acessibilidade. Está
comentado nos tokens.

Verificação real no navegador: 14 elementos de texto medidos na home, **0 reprovados**. O caso
limite confirmou a regra — `.sp-hero__accent` (Crimson, 46px) deu 4,24:1, que passa porque é texto
grande (mínimo 3:1).

## 3. Tipografia

Stack de sistema, por decisão registrada: a CSP de produção é `default-src 'self'`, então nenhuma
fonte externa carregaria de qualquer forma, e auto-hospedar custaria peso sem ganho proporcional.

**Achado corrigido**: o `tokens.css` anterior declarava `"Manrope"` como primeira família, mas o
site **nunca carregava essa fonte** (sem `@import`, sem `<link>`) — ela existe só no Desktop, via
Google Fonts. O site sempre renderizou em fonte de sistema alegando outra coisa. Agora a stack é
honesta e explícita.

O mono (`--font-mono`) não é enfeite: ele carrega rótulo, status e numeração, e é o que faz o site
ler como instrumento em vez de panfleto.

## 4. Narrativa da homepage

1. **Header** sticky — marca, 4 links reais, CTA "Ver status"
2. **Hero** — selo de estado, título em duas linhas (segunda em Crimson), subtítulo factual, dois
   CTAs, **captura grande do Dashboard**
3. **Pilares** — 4 leituras reais, em grade de filete de 1px
4. **Como funciona** — 3 estágios ligados por linha de formação
5. **Produto real** — 2 blocos alternados com captura larga (Champion Select, Pós-game)
6. **Transparência** — 3 princípios, incluindo o que o produto *não* faz
7. **Status** — 4 linhas reais + link para o status completo
8. **CTA final** — "Entre na partida com contexto. Saia dela com evidência."
9. **Footer** institucional — Produto / Legal / Contato + faixa legal

### Fusão deliberada de duas seções

O pedido previa "Showcase de funcionalidades" **e** "Capturas reais" como seções separadas. Só
existem 3 capturas reais; usá-las duas vezes na mesma página seria repetição visível. As duas
seções foram fundidas em **"Produto real"**, que preserva a narrativa (produto em destaque +
divulgação de que as capturas são reais e redigidas) sem repetir imagem. O Dashboard fica no hero;
Champion Select e Pós-game ficam no showcase — cada captura aparece exatamente uma vez.

### Legibilidade das capturas

As capturas são de UI (1280×820, texto de ~13px). Um layout 50/50 as reduziria a ~600px — metade
da escala, texto ilegível. Por isso:

- **hero**: captura em largura larga (medido: 1087px, **0,85 da escala nativa**);
- **showcase**: coluna de texto estreita (260–330px) + captura ocupando o resto;
- abaixo de 1100px empilha, com o texto primeiro e a captura em largura total.

## 5. Três achados reais corrigidos

### 5.1 O Riot ID estava exposto nas capturas publicadas — `BLOQUEANTE`

A home afirmava "identidade da conta usada nos testes removida das imagens". **As três capturas
publicadas mostravam `Zekerus#117` legível**: em destaque no Dashboard (~24px) e no topbar + rodapé
da sidebar nas outras duas. Era simultaneamente um vazamento do identificador da conta de teste e
uma afirmação falsa no ar.

Corrigido com máscara **localizada** (nunca borrão da imagem inteira), por detecção automática do
bounding box do texto claro dentro de janelas de busca estreitas — em vez de coordenadas chutadas
sobre dado real. As janelas excluem de propósito o monograma do avatar e as linhas vizinhas.

Preservado sem alteração: `Servidor BR1 · americas · Suporte` (região e rota, não identificador),
todos os números, KDA, datas, campeões, itens e estados. Verificação objetiva pós-máscara: **0
pixels quase-brancos restantes** nas janelas de topbar e sidebar.

O Dashboard recebe um rótulo `CONTA DE TESTE` com aresta Crimson — a redação lê como deliberada,
não como falha de exportação.

### 5.2 21 estilos inline eram descartados pela CSP em produção — `REAL, ESTAVA NO AR`

A CSP servida pelo Caddy é `style-src 'self'` **sem** `unsafe-inline`. Atributo `style=` é
silenciosamente descartado pelo navegador. O site publicado tinha **21 deles em 8 páginas**
(`border-top: none`, `text-align: center`, `max-width: 640px`, `margin-top`…) — todos inertes em
produção, embora funcionassem em dev. O site no ar renderizava diferente do que o código sugeria.

Todos eliminados; o design system não usa nenhum estilo inline. Travado por teste (um por página).

### 5.3 Overflow horizontal de 75px em todas as 9 páginas a 390px

Encontrado pela varredura de larguras, não por inspeção manual. `.sp-footer__grid` misturava uma
trilha explícita (`minmax(240px, 1.4fr)`) com `repeat(auto-fit, minmax(150px, 1fr))`: essa
combinação **não quebra linha** — o auto-fit segue criando trilhas de 150px além do container —
produzindo 450px de largura mínima contra 375px de viewport.

Reescrito mobile-first e explícito (1 coluna → 3 colunas em 700px → 4 em 1040px). As outras grades
usam `auto-fit` puro, que não tem esse problema, e foram conferidas.

## 6. Validação executada

Medição real no dev server (Vite), via JS no navegador — não por inspeção visual.

| O quê | Resultado |
| --- | --- |
| 9 páginas × 5 larguras (360/390/768/1280/1920) | **45/45 sem overflow**, 0 imagem quebrada, 0 estilo inline, header e footer montados |
| Contraste em 14 elementos de texto | **0 reprovados** (mínimo 4,24:1 em texto grande, 4,72:1 em texto normal) |
| Menu mobile a 390px | `aria-expanded` false→true, `display` none→flex, toggle visível |
| Console | **0 erros** |
| Classes órfãs (usadas sem CSS) | **0** |
| CSS morto (definido sem uso) | **0** — 2 blocos removidos, 1 aplicado onde fazia sentido |
| Links internos mortos | **0** |
| Testes automatizados do site | **58** (eram 17) |

### Limitação honesta

**Screenshot da página construída não foi possível nesta sessão**: a Browser pane não estava sendo
exibida, e o compositor não gera frames nesse estado (`Screenshot timed out … the Browser pane is
not displayed`). A validação se apoiou em medição objetiva via DOM/CSSOM (geometria, estilos
computados, contraste calculado, console), que cobre overflow, contraste, responsividade e
comportamento — mas **não substitui um olhar humano sobre o resultado estético**. Recomendado abrir
`spartagg.com.br` após o deploy para conferência visual final.

## 7. O que permaneceu igual por compliance

- **Os dois avisos legais da Riot** em `termos.html` §11.1 e §11.2 — texto verbatim intocado
  (Etapa 31L.1). Só a apresentação mudou: passaram a usar `.sp-callout--legal`, com aresta Crimson
  e tipografia mono, o que os destaca sem reescrever uma vírgula.
- A referência curta de não-afiliação no rodapé de todas as páginas.
- Todo o texto de `privacidade.html`, `termos.html`, `seguranca.html` e `excluir-conta.html`,
  incluindo os marcadores `[Revisão jurídica necessária]`. A migração dessas páginas foi
  deliberadamente mecânica (só wrapper e nome de classe) para que o diff prove que o conteúdo
  legal não foi tocado.
- O status real: nenhuma linha foi arredondada para parecer mais pronta. Não há CTA de download
  enquanto a release 0.9.0 segue retirada — travado por teste.

## 8. Bloqueios e pendências reais

- **Só existem 3 capturas reais.** O showcase tem 2 blocos em vez de 3 porque a alternativa seria
  repetir uma imagem. Uma captura de "Perfil" ou "Evolução pessoal" fortaleceria a página — exige
  rodar o Electron real via CDP e redigir a identidade, e ficou fora do escopo desta etapa. Nenhuma
  interface fictícia foi criada para preencher o espaço.
- **`suporte@spartagg.com.br` foi publicado no rodapé** por instrução explícita, com evidência de
  que o domínio tem MX (`mx1/mx2.hostinger.com`). MX existir prova que o domínio recebe e-mail, não
  que essa caixa específica exista — **o responsável precisa confirmar que a caixa está criada e
  sendo lida**, senão mensagens de suporte se perdem em silêncio.
- **Acento faltando numa string do Desktop**, visível na captura do Champion Select ("League nao
  detectado", "sessao local", "campeoes"). É defeito do produto, não do site; corrigir exigiria
  alterar o Desktop, fora do escopo. Registrado aqui em vez de mascarado — alterar o texto dentro
  da captura seria falsificar o dado.
