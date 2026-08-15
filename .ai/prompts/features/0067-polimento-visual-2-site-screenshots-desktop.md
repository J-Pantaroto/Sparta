---
status: IMPLEMENTADA
solicitado_em: 2026-08-15 12:50
implementado_em: 2026-08-15 13:27
---

# Etapa 31N — Polimento visual 2 do site com screenshots finais do Desktop

## Pedido original

> Aplicar as regras permanentes de `.ai/` e executar somente a Etapa 31N. Sem redesenhar a
> estrutura aprovada do site, substituir as capturas antigas por derivados públicos das cinco
> capturas reais pós-31M.1 existentes em `%TEMP%/sparta-qa-31m1`: Login Sparta, Dashboard Sparta,
> Evolução pessoal, Configurações com tema Adaptativo/Viego e Dashboard Adaptativo/Viego.
>
> Inspecionar cada origem e cada arquivo final visualmente. O Riot ID `Zekerus#117` não pode ser
> publicado: cobrir de forma sólida e localizada todas as repetições em header, card e sidebar,
> preservando métricas, gráficos, arte do campeão e estrutura. Auditar também PUUID, e-mail,
> tokens, chaves, hostname, IP, caminhos locais, usuário do Windows e infraestrutura. Automação é
> proteção adicional, nunca substituto da inspeção visual. Manter os originais de QA e criar em
> `apps/site/public/images/product/` derivados redigidos, otimizados e próprios para o site,
> documentando a origem.
>
> Dar prioridade ao Hero, tornando o aplicativo real imediatamente reconhecível com crop, frame,
> profundidade e geometria Spartan Signal sem esconder a UI. Destacar a captura real de
> **Evolução partida a partida**, sem recriar gráfico ou dados em HTML. Demonstrar o tema
> Adaptativo com clareza de que ele altera somente a apresentação visual, jamais score,
> recomendação ou análise. Não transformar a home em galeria: uma imagem dominante e no máximo
> uma ou duas complementares. Revisar crops manualmente.
>
> Otimizar imagens para web, preferindo WebP/AVIF, medir peso antes/depois, declarar dimensões,
> priorizar somente o Hero, lazy-load fora da primeira viewport e evitar CLS. Em 390px e 768px,
> simplificar camadas e ocultar recorte secundário quando necessário, mantendo a imagem principal
> legível e sem overflow.
>
> Polir sobretudo `/`; apoiar o fluxo em `/como-funciona` e relacionar imagens em
> `/funcionalidades`; limitar `/status` ao polimento mínimo e preservar `/suporte`, páginas legais
> e callbacks. Não ampliar o escopo editorial nem alterar Desktop, API, auth, banco, Riot/RSO,
> Resend, Docker, Postgres, Redis, Caddy, DNS, integração de produção, suporte, textos legais,
> clean URLs, tipografia/tokens estruturais ou CSP. Não adicionar dependência pesada, inline style,
> mock ou dado fictício.
>
> Executar QA real em 390/768/1280/1600 para `/`, `/como-funciona`, `/funcionalidades`, `/status`
> e `/suporte`; verificar regressão em `/privacidade`, `/termos`, `/seguranca`, `/excluir-conta`,
> `/confirmar-email` e `/redefinir-senha`. Checar overflow, clipping, crops, imagens, CLS, CSP,
> console, 404, legibilidade e reduced motion. Antes do commit, listar e abrir todas as imagens
> públicas, repetir a auditoria de privacidade e procurar automaticamente os marcadores conhecidos.
> Concluir somente com testes, typecheck, lint, build, deploy compatível e commit/push em `main`.

## Notas de implementação

- Relatório técnico e inventário de origens: `docs/site-product-screenshots-polish.md`, espelhado em
  `.ai/specs/site-product-screenshots-polish.md`.
- Quatro derivados WebP redigidos substituem os três JPEGs antigos; a tela de login foi auditada e
  descartada porque o Dashboard comunica melhor o produto no Hero.
- Testes automatizados em `apps/site/src/product-assets.test.ts` travam inventário, formato/peso,
  remoção dos legados, marcadores sensíveis, dimensões, prioridade/lazy-load e reduced motion.
- Gates integrais: versão 0.9.0 consistente, Prisma generate, typecheck, lint, build, **1.432 testes
  TypeScript**, analyzer e Dockerfile do site verdes. QA no navegador: 44/44 combinações de rota e
  viewport, 12/12 cenários de lazy-load, HTTP e console limpos.
