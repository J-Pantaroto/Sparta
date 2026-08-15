# Etapa 31N — Screenshots finais do Desktop no site

**Estado:** implementada e validada em 2026-08-15<br>
**Escopo funcional:** somente `apps/site`<br>
**Base preservada:** `671d22c3ff9dedbde710f72986a4d8d869fdff55`

## Resultado

O site agora mostra o Desktop posterior à Etapa 31M.1. O Dashboard Adaptativo é o artefato
dominante do Hero; a série real **Evolução partida a partida** e as preferências do tema Adaptativo
formam os dois apoios da home. O produto continua sendo a imagem principal: moldura, recorte,
profundidade e geometria Spartan Signal pertencem ao layout e não recriam nenhum conteúdo da UI.

Nenhum gráfico, métrica ou estado foi fabricado. O tema Adaptativo é descrito em todos os usos como
uma preferência exclusivamente visual, sem efeito em score, recomendação ou análise.

## Inventário e proveniência

Os PNGs de QA permaneceram em `%TEMP%/sparta-qa-31m1`; nenhum original foi sobrescrito. Os quatro
derivados públicos preservam 1280 × 860 pixels, removem metadados, usam WebP com qualidade 84 e
aplicam a aproximação final de cada seção por `object-fit`/`object-position`, sem duplicar rasters.

| Derivado público          | Origem real                                                          | Uso                                            | Redação aplicada                                        |     Peso | SHA-256           |
| ------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- | -------: | ----------------- |
| `dashboard-sparta.webp`   | `02-dashboard-sparta-1280.png` (`f1acdf11…f029488`)                  | apoio em Como funciona e Funcionalidades       | chip superior, nome no card principal e card da sidebar | 49.348 B | `e1ea9954…7d383d` |
| `personal-growth.webp`    | `03-evolucao-real-sparta-1280.png` (`741fc311…eed6f`)                | Evolução pessoal na home e Como funciona       | chip superior e card da sidebar                         | 48.350 B | `ea0f6de0…21d5dd` |
| `adaptive-theme.webp`     | `04-configuracoes-adaptativo-viego-skin-1280.png` (`35e958a3…aee17`) | preferências visuais na home e Funcionalidades | chip superior e card da sidebar                         | 47.620 B | `facb7f6d…503867` |
| `dashboard-adaptive.webp` | `05-dashboard-adaptativo-viego-skin-1280.png` (`337c76b0…3b0802`)    | imagem prioritária do Hero                     | chip superior, nome no card principal e card da sidebar | 52.292 B | `2298025b…156c3`  |

`01-login-sparta-1280.png` (`5178512f…98d3e`, 164.146 B) foi aberta e auditada, mas descartada do
site: a identidade neutra já aparece nas capturas de apoio e o Login comunica menos sobre a proposta
do produto do que o Dashboard.

### Assets substituídos

| Asset antigo removido                |          Peso |
| ------------------------------------ | ------------: |
| `img/screenshot-dashboard.jpg`       |     137.617 B |
| `img/screenshot-champion-select.jpg` |     124.038 B |
| `img/screenshot-postgame.jpg`        |     162.609 B |
| **Total antigo**                     | **424.264 B** |

Os quatro novos WebPs somam **197.610 B**: redução de **226.654 B (53,4%)** mesmo com um asset a
mais. As quatro origens PNG utilizadas somavam 1.326.580 B; os derivados públicos são 85,1% menores.

## Redação e privacidade

A redação foi feita por derivação determinística com ImageMagick. Retângulos sólidos `#0b0b0d`
cobrem somente os pixels do Riot ID; não há blur reversível nem replacement gerado. Cada ocorrência
foi inspecionada no chip superior, no card principal quando presente e no card inferior da sidebar.
Uma primeira inspeção visual detectou duas repetições esquecidas na sidebar; os derivados foram
regenerados e todos os quatro arquivos finais foram reabertos depois da correção.

A inspeção final procurou Riot ID, PUUID, e-mail, token, chave, hostname, IP, caminho local, usuário
Windows e infraestrutura. Nenhum apareceu nos quatro arquivos. O scan binário e textual adicional
não encontrou `Zekerus`, `#117`, `srv1902513`, `187.127.48.89`, `C:\Users\` ou `sparta@`; o teste
automatizado repete essa guarda em todo `public` e nas três páginas que usam os assets. `-strip`
removeu perfis/comentários embutidos; os nomes públicos também não contêm identificadores.

## Integração visual

### Home e Hero

- O antigo Dashboard virou o Dashboard Adaptativo pós-31M.1, em frame assimétrico com nó de status,
  linhas de formação, edge highlight, sombra e glow localizado.
- O Hero reserva a proporção antes do carregamento, declara 1280 × 860 e é a única imagem com
  `fetchpriority="high"`.
- A imagem continua legível e reconhecível; o crop aproxima o Dashboard sem esconder sua estrutura.
- A apresentação do produto foi reduzida a uma captura dominante e duas complementares, evitando
  uma galeria de miniaturas.

### Evolução e tema Adaptativo

- A home usa a captura real de Evolução pessoal e aproxima o gráfico **Evolução partida a partida**.
  O gráfico não foi redesenhado em HTML e mantém os 22 pontos observados na tela original.
- A captura de Configurações mostra o tema Adaptativo e Viego Fera Lunar. A copy informa que a
  preferência muda somente aparência; cores semânticas e conteúdo não mudam.
- `/como-funciona` recebeu um par visual compacto entre fluxo e explicação longa: estado atual e
  série temporal.
- `/funcionalidades` recebeu uma preferência visual factual e um par compacto que separa leitura
  pessoal de apresentação.
- Status, suporte, legal, exclusão e callbacks não foram reestruturados.

## Responsividade, carregamento e acessibilidade

Em 390px os CTAs empilham, as imagens principais continuam presentes em recorte quadrado legível,
a decoração perde o glow e o segundo item de pares auxiliares é ocultado. Em 768px os pares empilham;
em 1280/1600 as capturas recuperam a composição ampla. Não houve overflow horizontal. A regra de
`prefers-reduced-motion` elimina zoom/transição decorativa, mantendo todo o conteúdo.

Imagens fora do Hero usam `loading="lazy"`; todas declaram dimensões e `decoding="async"`. O WebP é
servido como `image/webp`. O CSS e HTML não adicionam estilo inline, script externo nem origem nova;
a CSP e o Caddy existentes não foram alterados.

## QA

- Matriz automatizada no navegador real: **44/44** combinações (11 rotas × 390/768/1280/1600) sem
  overflow estrutural, imagem quebrada, dimensão inválida ou texto `NaN`/`undefined`/`Infinity`.
- Lazy-load: **12/12** combinações das três páginas de produto; após scroll, todos os assets
  completaram com `naturalWidth=1280` e `naturalHeight=860`.
- Inspeção manual: Hero 1280, home/Evolução 1280, home 390, Como funciona 768, Funcionalidades 1280,
  Status 1600, Suporte 390, Privacidade 768 e Confirmar email 390.
- HTTP: 11/11 rotas e 4/4 imagens responderam 200; imagens com `Content-Type: image/webp`.
- Console: zero erro. CSP: zero violação. Crops, clipping, legibilidade e máscara foram conferidos
  visualmente.
- Testes específicos do site: typecheck, lint, build e **122/122 testes** verdes.

## Escopo preservado

Desktop, API, auth, banco, Riot/RSO, Resend, Postgres, Redis, Caddy, DNS, Docker, infraestrutura,
textos legais, suporte, confirmação/reset de senha, clean URLs e tokens tipográficos/editoriais não
foram alterados. Não foi adicionada dependência e nenhum dado fictício foi criado.

## Arquivos funcionais

- `apps/site/index.html`
- `apps/site/como-funciona.html`
- `apps/site/funcionalidades.html`
- `apps/site/src/styles/site.css`
- `apps/site/src/product-assets.test.ts`
- `apps/site/public/images/product/*.webp`
- remoção dos três JPEGs legados em `apps/site/public/img/`

## Gates finais

- versão 0.9.0 consistente em 8 lugares;
- Prisma Client 6.19.3 gerado;
- typecheck, lint e build integrais verdes;
- **1.432/1.432 testes TypeScript**: 25 scripts + 122 site + 635 core + 98 Riot + 376 API + 176
  Desktop;
- analyzer: 1/1 teste verde;
- `Dockerfile.site` construído até a imagem `sha256:d3d7c46a…7497fc9`, preservando o Caddy atual;
- `git diff --check` e Prettier verdes.
