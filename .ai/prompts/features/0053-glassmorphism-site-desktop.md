---
status: IMPLEMENTADA
solicitado_em: 2026-08-07 21:35
implementado_em: 2026-08-07 22:50
---

# Etapa 31K.1 — Glassmorphism no site e no Desktop

## Pedido original

> Antes das próximas etapas precisava que tanto no site quanto no app desktop vc aplicasse
> glassmorphism.

## Resultado

Etapa 100% CSS, sem tocar TypeScript, rota ou lógica de domínio. Três tokens de vidro
(`--glass-blur`/`--glass-blur-sm`/`--glass-border`/`--glass-highlight`) adicionados ao design
system do Desktop e ao site; aplicados às superfícies-painel (cards, tabela, sidebar, topbar,
popover de conta, selos pequenos, cartão de login, herói do Perfil no Desktop; header, menu
mobile, cards, callouts, passos do fluxo, capturas e linhas de status no site) — nunca em
botões/campos/badges pequenos, onde vidro-sobre-vidro prejudicaria a affordance. `--glass-blur`
zera sob `data-visual-intensity="reduced"` (Desktop), desligando o efeito num só lugar. O site
ganhou um fundo ambiente fixo (glow radial na cor de marca) que não existia antes — sem cor
nenhuma atrás, o desfoque não teria nada pra desfocar.

Validado real: site no dev server (9 páginas, zero erro de console, menu mobile como painel de
vidro real); Desktop no Electron real via CDP (mesma metodologia da Etapa 31J — debug port
temporário, revertido com diff líquido zero; login real via `window.sparta.session.set`),
`getComputedStyle` confirmando `backdrop-filter` real em cada superfície, screenshots reais do
Dashboard/popover/Perfil, desligamento por intensidade reduzida confirmado, zero erro de console.

Não regressão: `release-etapa27c-v1` `ACTIVE` com hashes idênticos (CSS não pode afetar o motor
por construção). 1215 testes verdes no monorepo (core 635, riot 97, api 353, desktop 129,
analyzer 1); `typecheck`/`lint`/`build` completos nos 5 pacotes. Ver `docs/glassmorphism.md`.
