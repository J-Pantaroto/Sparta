---
status: IMPLEMENTADA
solicitado_em: 2026-08-14 14:00
implementado_em: 2026-08-14 16:20
---

# Etapa 31N — Rotas públicas limpas e Central de Suporte

## Pedido original

> ETAPA — ROTAS PÚBLICAS LIMPAS E CENTRAL DE SUPORTE. Com o site já publicado em spartagg.com.br
> e a infraestrutura funcional (domínio, HTTPS, Caddy, Docker, healthcheck, suporte@spartagg.com.br,
> MX/SPF/DKIM/DMARC): remover `.html` das URLs públicas; garantir URLs canônicas limpas; preservar
> compatibilidade com URLs antigas por redirect permanente; criar uma Central de Suporte pública
> real em /suporte integrada ao design system Spartan Signal; preparar semanticamente o site para
> uma futura área autenticada sem implementá-la; preservar segurança, legal/compliance e
> infraestrutura. Inspecionar antes de alterar (apps/site, build, Vite multipágina, dist,
> Caddyfile, links internos, canonical, OG, sitemap, testes, 404). Não supor que rewrite no Caddy
> seja a melhor solução. Preferir arquitetura estática real; evitar limpeza por JavaScript e SPA
> routing. Redirect 301/308 sem loop e sem dois canônicos. A API pública NÃO deve ser habilitada,
> autenticação web NÃO deve ser criada, sistema de tickets NÃO deve ser implementado. Sem SLA
> inventado, sem formulário que simule envio, sem endpoint falso. Fora de escopo explícito:
> /login, /criar-conta, /register, /conta, auth, sessão, JWT, cookies de autenticação, banco de
> usuários, ticket backend, painel, reset de senha, verificação de e-mail, RSO, vínculo Riot,
> upload de anexos, API de suporte — e sem páginas "em breve" nem links mortos. Footer revisado
> (Produto/Confiança/Conta/Suporte) sem inventar redes sociais. SEO com canonical na URL limpa,
> 404 seguindo noindex. Varredura completa de links internos. Acessibilidade e responsividade em
> 360/390/768/1280/1920. CSP preservada, sem open redirect. Riot/compliance semanticamente
> intacto. Infraestrutura não alterada além do mínimo necessário no Caddyfile. 13 testes
> obrigatórios de regressão e, quando possível, validação HTTP real local.

## Notas de implementação

Relatório completo em `docs/public-routes-and-support.md`. Resumo:

**Estratégia**: arquivo plano + `try_files {path} {path}.html` no Caddy + 301 de `.html` para a
URL limpa. Escolhida sobre a saída em diretório porque esta produz `/como-funciona/` (com barra
final) e exigiria um redirect extra para não ter canônico duplicado; a escolhida entrega
exatamente as URLs pedidas com zero mudança de build. Trade-off registrado: as URLs limpas
dependem do `infra/Caddyfile`, que vive neste mesmo repositório.

**Open redirect evitado por construção**: o regex é `^/([^/].*)\.html$` e não `^/(.+)\.html$` —
com o segundo, `//exemplo.com/x.html` viraria `Location: //exemplo.com/x`, protocol-relative.
Testado com três variantes contra o Caddy real: todas resolvem para a própria origem.

**Central de Suporte** com 6 categorias, canal real, CTA mailto com assunto, sem formulário
(travado por teste), sem SLA inventado — a página declara explicitamente que não há prazo
comprometido.

**Validação HTTP real**: bloco do site extraído do Caddyfile de produção byte a byte (só o
endereço trocado), rodado em container `caddy:2-alpine` sobre o `dist`. 8 legados → 301, 9 rotas
limpas → 200, 1 salto sempre, 404 correto, headers preservados.

**Nota metodológica**: a varredura de layout (50/50 combinações) rodou no dev server porque a CSP
de produção (`frame-ancestors 'none'`) corretamente impede enquadrar as páginas servidas pelo
Caddy — confirmação de que o hardening está ativo.

**Não implementado, como exigido**: API pública, autenticação web, sessão, tickets. Travado por
teste: nenhuma página linka para /login, /criar-conta, /register, /conta ou /conta/tickets, e
esses arquivos não existem.
