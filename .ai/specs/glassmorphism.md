# Glassmorphism no site e no Desktop (Etapa 31K.1)

Pedido do usuário, entre a 31K (fundação pública) e a 31L (submissão Production à Riot): aplicar
glassmorphism tanto no site institucional quanto no aplicativo Desktop. Etapa puramente
presentacional — **nenhum arquivo TypeScript, nenhuma rota, nenhum componente React e nenhuma
lógica de domínio foi tocado**, só CSS.

## O que é glassmorphism aqui

Três ingredientes aplicados juntos, não separadamente — sem os três a superfície não lê como
"vidro":

1. **Translucidez** — fundo com alpha, não sólido.
2. **`backdrop-filter: blur(...)`** — o que de fato desfoca o que está atrás; sem isso,
   translucidez sozinha só produz uma superfície "suja", não vidro fosco.
3. **Borda clara e realce interno** — um hairline `rgba(255,255,255,0.08)` e um
   `inset 0 1px 0 rgba(255,255,255,0.05)` no topo, imitando luz pegando a borda física do vidro.

Um quarto ingrediente, silencioso mas necessário: **um fundo com cor por trás pra desfocar**. Sem
isso o `backdrop-filter` roda mas não produz efeito visível algum — é só custo de GPU sobre uma
cor sólida uniforme.

## Onde foi aplicado (e onde não foi, de propósito)

Aplicado nas superfícies que o usuário lê como **painel/contêiner flutuando sobre o fundo**:
cards (`.sp-card`), tabelas (`.sp-table`), a barra lateral e a barra superior do shell, o popover
de conta, os selos pequenos da topbar/sidebar (`.sp-player`, `.sp-system-pill`,
`.sp-sidebar__runtime`, `.sp-account-menu__trigger`), o cartão de login (`.sp-auth__card`), o
herói do Perfil (`.sp-profile-hero`), e no site: cabeçalho, menu mobile, cards de recurso,
callouts, passos do fluxo, capturas de tela e linhas de status.

**Não aplicado, deliberadamente**: botões (`.sp-btn`), campos de formulário (`.sp-input`/
`.sp-select`), badges/chips pequenos, tooltips. Controles interativos pedem contorno nítido pra
affordance — glass-sobre-glass em elementos pequenos costuma ficar borrado e prejudicar leitura,
e é um anti-padrão comum de implementações apressadas de glassmorphism. O `.sp-hero`/
`.sp-hero--feature` do Desktop (splash art de campeão) também ficou fora — ali o fundo já é uma
imagem real com scrim próprio; desfocar destruiria a arte que o herói existe pra mostrar.

## Desktop: tokens e desligamento em intensidade reduzida

Três tokens novos em `ui/tokens.css`: `--glass-blur` (20px), `--glass-blur-sm` (12px, pra
elementos menores como sidebar/topbar/popover/selos), `--glass-border` e `--glass-highlight`.
Todo `backdrop-filter` no app referencia esses tokens — nunca um valor de `px` literal — porque
isso permite desligar o efeito **num só lugar**:

```css
html[data-visual-intensity="reduced"] {
  --glass-blur: 0px;
  --glass-blur-sm: 0px;
}
```

`data-visual-intensity="reduced"` já existia (Fase 13/14) pra tirar splash art de fundo; o mesmo
pedido de "menos decoração" agora também desliga o vidro, sem precisar repetir a regra em cada
arquivo CSS que usa `backdrop-filter`. Confirmado real no Electron: alternar o atributo faz
`getComputedStyle(...).backdropFilter` cair pra `blur(0px)` imediatamente.

## Site: fundo ambiente

O site não tinha nenhum gradiente de fundo fora do herói — só preto sólido (`--bg-base`). Sem
cor nenhuma por trás, todo `backdrop-filter` adicionado seria invisível. `base.css` ganhou um
fundo fixo (`background-attachment: fixed`, não desce com o scroll) com dois glows radiais na cor
de marca (vermelho) em posições diferentes, sobre o gradiente escuro já existente — mesmo padrão
que o Desktop já usa desde a Fase 13, adaptado pro site (que não tem tema por skin).

## Validação real

**Site**: dev server real (Vite), as 9 páginas conferidas sem erro de console; `getComputedStyle`
confirmou `backdrop-filter: blur(18px)` no header e nos cards; menu mobile abre como painel de
vidro real sobre o herói (capturado em screenshot); nenhum texto perdeu legibilidade.

**Desktop**: **Electron real via CDP** (mesma metodologia da Etapa 31J — debug port temporário,
revertido antes do commit com diff líquido zero confirmado por `git diff`; login real via
`window.sparta.session.set` com token HMAC assinado pelo mesmo `AUTH_TOKEN_SECRET` do container).
Confirmado com `getComputedStyle` e screenshot real: Dashboard (card `feature` com o glow do tema
visivelmente desfocado atrás do retrato do jogador, sidebar e topbar translúcidas), popover de
conta (vidro flutuando sobre o conteúdo, `blur(12px)`), Perfil (herói analítico com o mesmo
tratamento), e o desligamento por `data-visual-intensity="reduced"` (`blur(0px)` confirmado).
**Zero erro de console, zero exceção não tratada** em toda a sessão de validação.

## Não regressão

Etapa 100% CSS — nenhum arquivo de `packages/core`, `apps/api` ou lógica de `apps/desktop`
tocado. `release-etapa27c-v1` continua `ACTIVE` com `artifactHash`/`configHash` idênticos aos
documentados; verificação direta no Postgres confirma o ponteiro inalterado (não foi necessário
gerar uma recomendação nova, já que CSS não pode afetar o motor por construção).
**1215 testes** no monorepo (core 635, riot 97, api 353, desktop 129, analyzer 1), todos verdes.
`typecheck`/`lint`/`build` completos nos 5 pacotes TypeScript.
