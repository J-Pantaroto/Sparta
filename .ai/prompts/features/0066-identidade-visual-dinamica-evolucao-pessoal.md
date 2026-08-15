---
status: IMPLEMENTADO
solicitado_em: 2026-08-15 11:00
implementado_em: 2026-08-15 12:44
---

# Etapa 31M.1 — Identidade visual dinâmica + Evolução pessoal do Desktop

## Pedido original

> ETAPA 31M.1 — IDENTIDADE VISUAL DINÂMICA + EVOLUÇÃO PESSOAL DO DESKTOP. Aplique as regras
> permanentes registradas em `.ai/`. Contexto: após a Etapa 31M e a captura visual completa do
> Desktop real, foram identificadas três decisões visuais que ainda impedem considerar o Desktop
> finalizado: (1) a tela "Evolução pessoal" ainda apresenta evolução majoritariamente através de
> progress bars estáticas; (2) a identidade visual baseada no campeão/skin aparece principalmente
> em um card/banner isolado, sem integrar suficientemente a composição da tela; (3) o branding do
> Desktop ainda utiliza um bloco vermelho com a letra "S", enquanto o site já possui o
> símbolo/ícone oficial do Sparta GG. Não é auditoria — é implementação visual direcionada. Não
> mexer no motor, API, auth, LCU, Riot, infraestrutura ou cálculos.
>
> 1. EVOLUÇÃO PESSOAL: transformar em visualização temporal real. Usar gráficos só quando houver
>    série histórica real suficiente (linha por partida, área/linha, sparklines, comparação entre
>    blocos temporais). Não criar métrica agregada fictícia, não inventar valores intermediários,
>    não suavizar a ponto de alterar interpretação, não fabricar histórico com poucas partidas. Com
>    8 partidas, o gráfico representa essas 8. Sem histórico suficiente: "Histórico insuficiente
>    para medir evolução" é preferível a gráfico artificial. Hierarquia: jornada de progresso →
>    visão temporal principal → indicadores em evolução → foco sugerido → detalhes/frequência
>    recente. Progress bars podem continuar como informação secundária, não centrais. Verificar
>    solução já existente antes de adicionar dependência; preferir SVG/CSS/componentes internos.
>    Não biblioteca pesada. Identidade visual: fundo escuro, linhas limpas, grid discreto, pontos só
>    quando agregam, vermelho como sinal, verde/amarelo com significado, labels legíveis, tooltip
>    acessível. Compreensível sem depender só de cor.
> 2. IDENTIDADE DO CAMPEÃO NO BACKGROUND: artwork como camada de ambiente, não preso a
>    banner/card isolado. Escala maior, pode ultrapassar o banner superior, composição atrás da
>    área principal, opacity controlada, máscaras/gradients/vignette/fade/recortes intencionais,
>    cards permanecendo legíveis. Evitar wallpaper totalmente visível, contraste ruim, rosto atrás
>    de texto, blur/glow excessivo, repetir a mesma splash em vários cards. Preservar
>    integralmente o sistema de accent dinâmico; artwork acompanha a troca de skin, transição
>    discreta, legibilidade estável, respeitar reduced motion.
> 3. TEMA PADRÃO = SPARTA, NÃO AHRI: estado visual padrão "Sparta" quando não houver campeão
>    destacado/skin/contexto neutro. Usar somente assets reais da marca já no repositório
>    (auditar `apps/site/` primeiro). Não gerar imagem por IA, não criar arte raster fictícia, não
>    baixar logo genérico. Compor com símbolo Sparta, geometria Spartan Signal, diagonais,
>    formação/linhas, textura discreta, vermelho como sinal, obsidian/iron como base, espaço
>    negativo — deve parecer identidade nativa, não placeholder.
> 4. SUBSTITUIR O "S" PELO SÍMBOLO OFICIAL: auditar o asset correto no site antes de trocar. Não
>    redesenhar o símbolo, não criar segunda versão da marca. Fonte de verdade única ou
>    compartilhamento limpo do asset; se copiar pro bundle Desktop por causa do empacotamento
>    Electron, documentar a origem. Revisar sidebar, login, auth, loading, empty states, ícone
>    interno — substituir só onde representar a MARCA, não "S" de conteúdo normal.
> 5. LOGIN como referência conceitual (não template a copiar). Aplicar o estado padrão Sparta na
>    autenticação quando não houver contexto dinâmico de campeão.
> 6. PRESERVAR O POLIMENTO DA 31M: `--color-accent-text`, contraste AA, focus-visible,
>    cards/elevation, tracking, container queries, layouts corrigidos, temas, densidade,
>    intensidade visual. A nova composição de background não pode quebrar os 628 elementos
>    validados sem abaixo de AA.
> 7. TEXTOS INCORRETOS: corrigir "League nao detectado" → "League não detectado", "campeoes" →
>    "campeões". Busca limitada por strings visíveis semelhantes, não revisão editorial ampla.
> 8. RÓTULO "RUNA 8128": não inventar nome. Se não existir fonte factual através de Riot/Data
>    Dragon já usada pelo projeto, preservar o identificador honesto e documentar a limitação; só
>    melhorar a apresentação visual do ID cru.
> 9. QA VISUAL: repetir Electron/CDP em processo REAL e ÚNICO — a etapa anterior descobriu que
>    `pkill` no Git Bash não mata processo Windows e o CDP conectava a bundles antigos; garantir
>    explicitamente instância única antes de medir. Validar 1000/1280/1600px nas telas: Login,
>    Dashboard, Perfil, Champion Select, Histórico de drafts, Pré-game, Pós-game, Evolução pessoal,
>    Histórico do motor, Configurações. Testar os 3 temas e uma troca real de campeão/skin no
>    Adaptativo. Capturar especialmente: Evolução pessoal com dados reais, estado padrão Sparta,
>    estado com campeão/skin, sidebar com símbolo novo, login. Validar contraste, clipping,
>    overflow, background interferindo com conteúdo, gráficos, tooltips, reduced motion, console,
>    exceções, HTTP.
> 10. RESTRIÇÕES: não alterar scoring, métricas, recommendation engine, release ativa,
>     provenance, factual availability, API contracts, banco, Prisma, auth, sessões, Riot
>     integration, RSO, LCU, Caddy, Docker, site funcional, Resend, Production Application. Não
>     mocks em runtime, não gráficos com dados fictícios.
> 11. REGRESSÕES DA PRÉVIA (seção duplicada "9" no pedido original): a correção do anel de foco em
>     `<h1 tabindex="-1">` (commit `399d990`) deve ser preservada — foco programático continua
>     funcionando para tecnologias assistivas, sem desenhar anel visual; `<main>` do skip-link
>     idem; Tab real continua mostrando foco em controles interativos; as novas camadas de
>     background/branding não podem interferir nesses estados. Corrigir também os textos "League
>     nao detectado"/"campeoes"; para "Runa 8128", verificar se existe resolução factual via
>     Riot/Data Dragon antes de decidir manter o ID cru — não tratar o estado de espera do
>     Champion Select como erro, não substituir "Indisponível"/histórico insuficiente por dado
>     simulado.
>
> Critérios de aceitação: evolução temporal real comunicada, progress bars não mais centrais,
> zero métrica/gráfico fictício, artwork integrado ao background com conteúdo legível, estado
> neutro Sparta (não Ahri), símbolo oficial substituindo o "S" onde representa marca,
> temas/densidade/intensidade funcionando, Adaptativo derivando paleta corretamente, contraste AA
> preservado, 1000/1280/1600 sem overflow estrutural, QA com instância Electron única,
> testes/typecheck/lint/build verdes, release/motor inalterados, commit/push na main.
>
> Relatar ao final: como Evolução pessoal mudou, quais gráficos e de quais dados reais derivam,
> comportamento com histórico insuficiente, como o artwork foi integrado ao background, como
> funciona o fallback Sparta, qual asset substituiu o "S", correções de texto, teste do
> Adaptativo, screenshots, contraste, QA por viewport, testes, arquivos alterados, itens não
> alterados, commit final.

## Notas de implementação

- Continuação concluída sobre a base `399d990`, preservando as mudanças parciais existentes e
  auditando cada uma antes de completar a etapa.
- Evolução pessoal usa `PlayerProfileOverview.performanceTrend`: linha/área de
  `performanceIndex` e sparklines de `kda`, `csPerMinute`, `visionScorePerMinute` e
  `objectiveParticipation`. Um ponto por partida real; sem suavização, interpolação ou métrica
  nova. Menos de três observações produz o estado explícito de histórico insuficiente.
- `AppShell` concentra uma única camada ambiente da skin; sem campeão, login e shell usam a
  identidade Sparta. O fallback fixo de Ahri foi removido.
- Símbolo oficial copiado byte a byte de `apps/site/public/img/favicon.png` para o bundle renderer;
  SHA-256 `62e228ba9aa3aebf645b606becf0285f4909660cf9df1034f8e819b8e1ba29e6`.
- “League não detectado”/“campeões” corrigidos. “Runa 8128” preservada porque não há catálogo
  factual local e uma nova integração Riot é proibida nesta etapa.
- QA Electron/CDP real em instância única: 30/30 combinações (10 telas × 1000/1280/1600) sem
  overflow, imagens quebradas ou texto inválido; temas Espartano/Obsidiana/Adaptativo, Viego Fera
  Lunar, contraste AA, densidade/intensidade, reduced motion, foco/tooltip e runtime validados;
  zero erro de console, exceção ou HTTP >= 400.
- Gates locais: versão 0.9.0 consistente em 8 lugares, Prisma generate, typecheck, lint, build,
  **1.427 testes TypeScript** (25 raiz + 117 site + 635 core + 98 riot + 376 API + 176 Desktop) e
  1 teste do analyzer, todos verdes.
- Diff funcional restrito a `apps/desktop/src/renderer/`. Postgres confirmou
  `release-etapa27c-v1` `ACTIVE`, ponteiro/hashes congelados e replay mais recente
  `EXACT_REPLAY`, sem divergências, rejeições ou dependências ausentes.
- Relatório: `docs/desktop-dynamic-identity-growth.md`, espelhado em
  `.ai/specs/desktop-dynamic-identity-growth.md`.
