# Design System

Etapa 31D: `AuthLayout` sustenta progresso acessível Conta → Email → Riot → Pronto; shell possui
ações consistentes de Conta, Configurações e Sair. Não houve redesign analítico geral.

O design system do Sparta vive em `apps/desktop/src/renderer/src/ui/` — componentes e CSS
colocados lado a lado, com `ui/index.ts` como único ponto de import.

Ele **não** mora em `packages/ui` (pacote removido): aquele pacote não tinha pipeline de CSS
e não tinha outro consumidor possível — API e analyzer não renderizam UI. Manter os
componentes lá separaria o CSS do TSX e dividiria a fonte de verdade em vez de unificá-la.

## Camadas

| Arquivo                        | Responsabilidade                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `ui/tokens.css`                | Todos os tokens, organizados por função                                               |
| `ui/base.css`                  | Reset, tipografia do documento, foco por teclado, `prefers-reduced-motion`, scrollbar |
| `ui/<Componente>.tsx` + `.css` | Um componente, um CSS colocado                                                        |
| `styles/global.css`            | Só o que ainda não migrou (telas de autenticação e restos de tela)                    |

## Regras

1. **Prefixo `sp-` e BEM-lite** (`sp-card`, `sp-card__header`, `sp-card--feature`).
2. **Nunca estilizar elemento descendente genérico** (`.card span`, `.panel strong`). Regras
   assim casam em qualquer profundidade e já pintaram o número do `ScoreBadge` da cor errada
   por engano (bug real da Fase 9b).
3. **Nenhum hex, raio ou duração literal em componente.** Se falta um valor, nasce um token.
4. **Sem estilo inline pra aparência.** Inline só pra dado (a URL de uma splash art, a largura
   calculada de uma barra).

## Dois eixos de cor

- **Destaque** (`--color-accent`, `--color-accent-soft`, `--color-accent-glow`) — identidade.
  Muda com a skin escolhida: o `FeaturedChampionProvider` sobrescreve esses três tokens em
  runtime com a cor extraída da splash art (`theme/accent-color.ts`), travada numa faixa de
  saturação/luminosidade que garante contraste contra o fundo quase preto. **Os nomes não
  podem mudar** — há código em runtime que os escreve por nome.
- **Semântico** (`--color-green`, `--color-yellow`, `--color-red`) — significado. Fixo de
  propósito: se seguisse a skin, "bom" e "ruim" trocariam de cor a cada tema e perderiam o
  sentido. Usado por `ScoreBadge`, `StatBar` e `SignalChip`, sempre a partir dos limiares já
  exportados de `dimension-signals.ts` — a leitura visual bate com o texto do domínio.

## Direção visual

- Superfícies escuras com níveis de elevação explícitos (`--surface-1` a `--surface-4`);
- bordas discretas, escala de raio real (elementos pequenos não usam o raio dos painéis);
- splash art só no herói da tela — atrás de texto pequeno ela prejudica leitura;
- animações entre 120 ms e 250 ms, em `transform`/`opacity`;
- movimento reservado pra comunicar estado (o ponto pulsante de "detectado ao vivo"), não pra
  decorar.

O desktop evita visual de landing page e abre direto na experiência de produto. A leitura
rápida durante champion select é prioridade.
