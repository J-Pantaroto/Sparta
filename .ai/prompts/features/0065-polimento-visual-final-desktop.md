---
status: IMPLEMENTADA
solicitado_em: 2026-08-15 04:00
implementado_em: 2026-08-15 09:50
---

# Etapa 31M — Polimento visual final do Desktop

## Pedido original

> ETAPA 31M — POLIMENTO VISUAL FINAL DO DESKTOP. Aplique as regras permanentes registradas em
> `.ai/`. Contexto: o Sparta GG entrou em `Pending Review` no Riot Developer Portal; enquanto a
> Production Key / RSO não são aprovados, NÃO publicar a API e NÃO alterar os gates de produção. O
> Desktop já passou por redesign estrutural, Champion Select/pregame redesign, postgame/history
> redesign, history/calibration/release redesign, QA visual via Electron/CDP, correções técnicas
> pré-polish, hardening de IPC/navegação, correções de sessão/offline, lifecycle de LCU,
> latest-only postgame, autenticação/confirmação de e-mail/recuperação de senha. Objetivo
> exclusivo: levar o Desktop de "visualmente estável" para "produto visualmente finalizado",
> aumentando hierarquia visual, contraste, legibilidade, profundidade, acabamento, personalidade
> visual, consistência entre telas, qualidade percebida e clareza dos estados interativos. Deve
> parecer um produto premium real de LoL, sem copiar Mobalytics/U.GG/Blitz. Não fazer redesign
> estrutural amplo, não reconstruir telas que já funcionam, não virar feature development.
> Identidade: preservar a identidade própria do Desktop mas aproximar do acabamento Sparta GG —
> escuro profundo, superfícies em camadas, contraste controlado, vermelho como sinal (não
> preenchimento excessivo), geometria limpa, elementos angulares quando fizer sentido, sensação de
> precisão/análise/estratégia, evitando estética genérica de dashboard SaaS. Sem soldados/espartanos
> literais. Deve transmitir "inteligência competitiva pessoal", não "site gamer cheio de efeitos".
> Princípios: (1) profundidade — revisar backgrounds/cards/panels/borders/sombras/overlays/
> separators, eliminar superfícies chapadas, usar luminância e elevação sutis, evitar blur/glass
> excessivo; (2) hierarquia — cada tela deve deixar evidente onde olhar primeiro, o que é primário/
> contexto/ação/secundário, evitando telas de vários cards com o mesmo peso; (3) tipografia —
> revisar títulos/subtítulos/labels/dados numéricos/captions/line-height/tracking/contraste de
> texto secundário, dando presença aos dados importantes sem números gigantes só por estética; (4)
> espaçamento — padding interno, gaps, ritmo vertical, alinhamentos, agrupamento semântico,
> eliminando áreas comprimidas e vazios desnecessários; (5) estados interativos — uniformizar
> hover/focus-visible/pressed/selected/disabled/loading/error/success; clicáveis precisam parecer
> clicáveis; não depender só de cor; (6) dados e visualização — melhorar estatísticas/índices/
> tendências/champion cards/role cards/histórico/comparações/recomendações/confiança sem inventar
> gráficos ou métricas, sem alterar cálculos, sem converter indisponibilidade em zero; (7) ícones —
> consistência de tamanho/stroke/alinhamento/padding/uso semântico; (8) animações — só microinterações
> discretas (opacity, translate, scale leve, transitions), sem biblioteca nova, sem partículas/
> parallax/glow pulsando/animação contínua, respeitando `prefers-reduced-motion`; (9) cores —
> vermelho continua sinal/prioridade, neutros para estrutura, cor forte reservada para CTA/seleção/
> alerta/status/informação relevante. Revisar todas as principais experiências: autenticação
> (login, cadastro, esqueci senha, verificação de e-mail, erro/loading/offline — primeira impressão
> premium), onboarding (progressão, instruções, CTAs, estados Riot — sem mudar regras de
> identidade/RSO), Dashboard/Player Profile (prioridade a identidade, desempenho, tendências,
> champions, roles, partidas recentes, insights; evitar grid homogêneo), Champion Select/Pregame
> (tela mais importante: recomendação principal, alternativas, posição, matchup, runes/build,
> estratégia, disponibilidade, indicadores de atualização/freeze, draft state; a recomendação
> principal deve dominar sem virar chamativa demais; preservar integralmente LCU read-only,
> draftRevision, gameId, stale request cancellation, freeze visual, regras factual/provenance),
> Postgame (narrativa resultado → desempenho → diferenças vs pregame → estatísticas → insights, sem
> sugerir causalidade, sem mudar latest-only), Histórico/Perfil longitudinal (scannability,
> organização temporal, trends, champions, roles, matches, evidências; sem score agregado novo),
> Motor/Calibration/Release (continuam técnicas, porém refinadas: agrupamento, status, labels,
> versão ativa, configuração, integridade; sem esconder informação técnica por estética),
> Configurações (temas, densidade, intensidade visual, controles, estados selecionados; os três
> temas Espartano/Obsidian/Adaptativo permanecem; preservar densidade e intensidade; não remover
> opções). Responsividade: validar 1000/1280/1600px, nenhuma tela deve depender de 1600px, revisar
> wrapping/grids/sidebars/tabelas/cards/textos longos/botões/modais, evitar overflow horizontal
> estrutural. QA visual: repetir o fluxo Electron/CDP anterior, screenshots das principais telas nos
> três tamanhos, cobrindo temas/densidade/intensidade sem precisar de combinação cartesiana
> completa se já houver estratégia representativa documentada; comparar alinhamento, contraste,
> clipping, overflow, legibilidade, estados, consistência; corrigir regressões encontradas.
> Restrições críticas — NÃO alterar: motor de recomendação, pesos, métricas, scoring, provenance,
> regras de indisponibilidade, Riot API integration, LCU semantics, auth, session semantics, API
> contracts, database, migrations, Redis, e-mail, Resend, Caddy, Docker, site, Riot submission, RSO
> gates, release logic, calibration math. Não adicionar dados mockados/hardcoded para melhorar
> screenshots; não usar conteúdo falso em runtime; fixtures só em testes. Não adicionar dependências
> visuais sem justificativa excepcional. Não alterar CSP/security policies para acomodar visual.
> Acessibilidade: contraste, focus-visible, navegação por teclado, labels, buttons, estados não
> comunicados só por cor, reduced motion. Testes: preservar todos os existentes, adicionar só onde o
> polish introduzir comportamento visual relevante; executar testes Desktop, typecheck, lint, build,
> analyzer aplicável, suíte completa se as regras permanentes exigirem; nenhuma regressão funcional
> é aceitável. Documentação: registrar objetivo, principais refinamentos, telas revisadas, QA visual
> executado, problemas encontrados/corrigidos, limites preservados; atualizar spec, changelog,
> CLAUDE/.ai e o prompt da feature. Critérios de aceitação: todas as telas revisadas, visual
> consistente, hierarquia mais clara, aparência de produto final, sem redesign funcional, sem
> alteração no motor, sem mudança em Riot/API/auth, nenhum dado fictício, 1000/1280/1600 validados,
> temas/densidade/intensidade funcionando, QA sem overflow/clipping estrutural, testes/typecheck/
> lint/build verdes, commit/push na main.

## Notas de implementação

Relatório técnico completo em `docs/desktop-visual-polish.md` (espelhado em `.ai/specs/`). Resumo:

- **Critério da etapa**: o design system já estava maduro, então "polimento" corria o risco de
  virar troca de gosto. Cada mudança nasceu de um número medido (contraste WCAG, pixels de
  overflow, contagem de valores divergentes); o que não tinha defeito mensurável não foi tocado.
- **Regra de contraste do destaque** (a decisão central): a faixa travada do accent dinâmico
  garante visibilidade como preenchimento, mas não legibilidade como texto — azul em L=45% dá
  2,06:1, e o vermelho padrão 3,94:1. Separado em `--color-accent` (preenchimento/borda) e
  `--color-accent-text` (texto, derivado em runtime por `readableAccentText`), aplicado nos 11
  lugares que usavam accent como cor de texto.
- **Duas afirmações falsas em comentários derrubadas por medição**: `--text-on-accent` dizia que
  tinta escura sempre vence (pior caso real 2,04:1; `readableInkOnAccent` escolhe por medição,
  pior caso 4,58:1, exigindo preto **puro** — com `#08080a` o melhor caso ainda reprovava em
  4,47:1); e o anel de foco prometia um halo escuro que nenhuma regra implementava.
- **`--text-muted`** reprovava AA em toda superfície (3,38-3,99:1) sendo o token dos textos
  menores do app (102 usos): `#6f6f7b` → `#8a8a98`.
- **Profundidade**: tokens `--elevation-raised`/`--elevation-hover`; cards não projetavam sombra
  nenhuma; `feature`/`flat`/`inset` ganharam elevação coerente com o papel; estado `pressed` novo
  em cards clicáveis.
- **Tracking**: 19 rótulos uppercase idênticos usavam 5 valores diferentes; unificados em
  `--tracking-caps` (0.06em, a moda). Zero literal restante fora de `tokens.css`.
- **Ícones**: stroke já uniforme; normalizado só o desvio claro (15px → 16px, 11 chamadas + 1 CSS).
- **3 bugs reais de layout** achados pelo QA (7/30 combinações falhavam): itens de build
  silenciosamente escondidos (~4 de 8), linhas vazando 110px do cartão, e um `@media` que nunca
  poderia corrigir o Dashboard porque enxerga o viewport e não o container — resolvido com
  container queries e breakpoints somados dos mínimos reais. Mais dois menores (truncamento
  faltando no `strong` do histórico de drafts; "Sincronização" vazando 9px).
- **QA no Electron real via CDP**: 30/30 combinações limpas, 628 textos medidos nos 3 temas com 0
  abaixo de AA, temas/densidade/intensidade confirmados, caminho dinâmico de skin validado, Tab
  real e reduced motion confirmados, 18 screenshots.
- **Achado metodológico**: `pkill` não mata processo Windows — 5 instâncias empilhadas fizeram o
  CDP servir bundle velho e produzir uma leitura falsa; detectado, corrigido via PowerShell e tudo
  revalidado numa instância única.
- **Testes**: `theme/accent-color.test.ts` novo (7 testes, 12.960 combinações por asserção, com a
  luminância reimplementada da especificação em vez de importada do módulo sob teste). Confirmado
  que falha sem a correção. **1422 testes** no monorepo (desktop 171, eram 164).
- **Não regressão estrutural**: diff inteiro contido em `apps/desktop/src/renderer/`; zero arquivo
  em `packages/`, `apps/api`, `apps/site`, `infra/`, `prisma/` ou Docker. `release-etapa27c-v1`
  `ACTIVE` com hashes idênticos, confirmado no Postgres.
- **Fora de escopo, preservado**: rótulos crus de runa (sem catálogo local; inventar violaria a
  regra de dado real), identidade visual/glassmorphism/temas, LCU read-only, `draftRevision`,
  congelamento de snapshot, gates de produção e RSO.
