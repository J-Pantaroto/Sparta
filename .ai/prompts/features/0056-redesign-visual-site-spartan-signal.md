---
status: IMPLEMENTADA
solicitado_em: 2026-08-14 00:00
implementado_em: 2026-08-14 12:10
---

# Etapa 31M — Redesign visual do site público / identidade "Spartan Signal"

## Pedido original

> ETAPA — REDESIGN VISUAL DO SITE PÚBLICO / IDENTIDADE "SPARTAN SIGNAL". O site institucional já
> está público em spartagg.com.br. Redesenhar profundamente `apps/site` para representar a
> qualidade atual do produto e ter identidade própria. Usar Mobalytics/U.GG/Blitz apenas como
> referência de maturidade visual — nunca copiar layout, componentes, textos, cores ou estrutura.
> Antes de implementar: inventariar páginas/rotas/componentes/assets, identificar texto legal e
> compliance Riot, identificar screenshots reais, identificar links reais vs placeholders.
> Identidade "Spartan Signal": disciplina, precisão, formação, direção, dados, evidência —
> representada por geometria (pontas de lança, cortes diagonais, linhas de formação, nós de
> status, frames de escudo), não por soldados/capacetes. Paleta Obsidian #07080A, Iron #0D1015,
> Steel #171B21, Crimson #E21D2E, Signal Red #FF3347, Bone #F2F3F5, Ash #8F969F (refinável por
> contraste). Evitar "gaming preto + neon vermelho" genérico e excesso de border-radius.
> Homepage com narrativa: header, hero, pilares, como funciona, showcase, capturas reais,
> transparência, status, CTA final, footer. Não apresentar download se a release está retirada.
> Screenshots grandes e legíveis, identificadores redigidos por máscara localizada (não borrão
> total), sem alterar dados para marketing e sem métricas fictícias. Transparência como parte da
> identidade. Status real, sem hardcode falso. Footer institucional sem inventar redes/números/
> depoimentos. Preservar disclaimers Riot semanticamente. Aplicar o mesmo design system às
> páginas secundárias. Validar 360/390, 768, 1280, 1440, 1600/1920. Acessibilidade e
> prefers-reduced-motion. Apenas microinterações. Não enfraquecer a CSP, não adicionar analytics/
> trackers/dependências pesadas. Revisar SEO. Não alterar infraestrutura (firewall, portas, VPS,
> DNS, MX, API, Postgres, Redis, auth, RSO, deploy da API). Ao final: auditoria visual real do
> site construído em múltiplas larguras, corrigindo o que aparecer, e relatar páginas
> modificadas, design system, screenshots, mudanças de UX, validação, o que ficou igual por
> compliance e bloqueios reais.

## Notas de implementação

Relatório completo em `docs/site-visual-identity.md`. Resumo:

**Identidade "Spartan Signal"** — geometria em vez de arte temática: ponta de lança (marcador de
seção, bullet, separador), chanfro `--chamfer` (frames de captura, CTA), linha de formação
(réguas de seção, fluxo), nós de status, e mono versal em todo rótulo/status. Raio quase zero.

**Regra de contraste medida, não estimada**: Crimson `#E21D2E` dá 4,2:1 sobre Obsidian — passa AA
só em texto grande. Signal `#FF3347` dá 5,6:1 e passa em texto normal. Os dois tokens têm papéis
distintos e não intercambiáveis, comentado nos tokens. Verificado no navegador: 14 elementos de
texto medidos, 0 reprovados.

**Três achados reais corrigidos**:
1. `BLOQUEANTE` — o Riot ID `Zekerus#117` estava **legível nas 3 capturas publicadas** enquanto a
   home afirmava que a identidade tinha sido removida. Máscara localizada por detecção automática
   do bounding box (não coordenadas chutadas), preservando região/rota e todos os números.
2. **21 estilos inline** em 8 páginas eram silenciosamente descartados pela CSP de produção
   (`style-src 'self'` sem `unsafe-inline`) — o site no ar renderizava sem eles. Todos eliminados.
3. **75px de overflow horizontal em todas as 9 páginas a 390px**, causado por `.sp-footer__grid`
   misturar trilha explícita com `repeat(auto-fit, …)` — combinação que não quebra linha.

**Fusão deliberada**: "showcase" e "capturas reais" viraram uma seção só. Só existem 3 capturas;
duas seções repetiriam imagem. Cada captura aparece exatamente uma vez.

**Achado menor**: `tokens.css` declarava `Manrope` sem nunca carregar a fonte (ela só existe no
Desktop). Stack de sistema agora é explícita e honesta.

**Testes**: 58 no site (eram 17). Travam ausência de estilo inline por página, ausência de classe
órfã, ausência de link morto, ausência de CTA de download enquanto a release está retirada,
dimensões e `alt` em toda imagem, um `h1` por página, canonical/og:url, e 404 `noindex`.

**Validado**: 9 páginas × 5 larguras (360/390/768/1280/1920) = 45/45 sem overflow, 0 imagem
quebrada, 0 erro de console; menu mobile alternando `aria-expanded`. **Limitação**: screenshot da
página construída não foi possível (Browser pane não exibida), então a validação estética final
depende de conferência humana — registrado no relatório.

**Não tocado**: Caddyfile, Dockerfile.site, DNS, MX, API, Postgres, Redis, auth, RSO, Desktop. Os
dois avisos legais da Riot preservados verbatim; todo o texto das páginas legais preservado (a
migração dessas páginas foi mecânica de propósito, para o diff provar isso).
