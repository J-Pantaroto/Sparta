# Shell, dashboard e sistema visual v2

## Escopo

A Etapa 31F reorganiza somente a experiência autenticada do desktop. O agregado
`PlayerProfileOverview`, autenticação, onboarding, ownership, fórmulas, recomendação, release
operacional e replay não foram alterados. O dashboard é uma leitura resumida do mesmo contrato do
Perfil, obtido por `GET /me/player-profile`; não existe uma segunda fonte analítica.

## Auditoria e destino dos elementos

| Área auditada                               | Situação anterior                                              | Decisão 31F                                                                   |
| ------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `AppShell`, sidebar e cabeçalho             | navegação plana, status e conta dispersos                      | **Refatorar** em shell persistente, sidebar agrupada e topbar contextual      |
| `Card`, badges, botões, avatars e analytics | componentes sólidos e testados                                 | **Reutilizar/evoluir** sem duplicação                                         |
| dashboard legado                            | três consultas, cards homogêneos e fonte concorrente ao Perfil | **Substituir** pela projeção de `PlayerProfileOverview`                       |
| tokens e tema por campeão                   | boa separação semântica, mas um único tema estrutural          | **Evoluir** para três temas, duas densidades e intensidade visual persistidas |
| alerts e estados locais                     | mensagens visuais inconsistentes                               | **Refatorar** para `GlobalNotice` e estados reutilizáveis                     |
| skin/splash                                 | identidade visual podia alcançar áreas sem relação com campeão | **Restringir** ao tema Adaptativo e a contextos reais; manter modo reduzido   |
| telas fora do shell autenticado             | autenticação/onboarding já adequados                           | **Preservar temporariamente**, fora do redesign desta etapa                   |
| laboratório/calibração                      | ferramenta interna                                             | **Preservar**, ocultando entrada em produção conforme regra existente         |

## Arquitetura do shell

A navegação lateral passa a ter quatro grupos:

- **Visão geral:** Dashboard e Perfil;
- **Análise:** Champion Select, Histórico de drafts, Pré-game, Partidas e pós-game;
- **Evolução:** Evolução pessoal, Histórico do motor e Laboratório em desenvolvimento;
- **Conta:** Configurações e Conta e segurança.

O item ativo é exposto por `aria-current="page"`. Todos os itens continuam botões reais e
operáveis por teclado. A sidebar pode ser recolhida, persiste a preferência local e fornece nome
acessível e tooltip nativo quando mostra somente ícones. Não há links duplicados de conta ou área
administrativa no produto.

A topbar apresenta título e contexto da página, última sincronização, estados compactos da API e
do League Client, refresh do dashboard e menu de conta. Em larguras menores, texto secundário é
reduzido antes de qualquer conteúdo estrutural. O conteúdo principal tem skip link e foco
programático.

## Dashboard

O dashboard faz uma consulta agregada autenticada e nunca aceita identidade enviada pelo desktop.
A hierarquia é:

1. hero com Riot ID, servidor, posição observada, amostra, win rate recente, desempenho e data;
2. aviso independente de dado desatualizado/parcial;
3. seis índices pessoais com fórmula, amostra e cobertura;
4. tendência observada em 7, 14 ou 30 dias, selecionável entre desempenho, KDA, objetivos, visão e
   farm;
5. partidas recentes e campeões mais usados;
6. ações rápidas e estado operacional.

Elo, ícone e nível são exibidos apenas quando existem. Ausência não recebe placeholder numérico e
zero observado permanece `0`. As métricas são índices do Sparta sobre a amostra pessoal, não notas
da Riot, comparação global ou probabilidade. O gráfico não interpola dias sem observação, separa
lacunas, inicia eixos factuais em zero e oferece legenda, tooltip e equivalente textual.

A sincronização usa `POST /players/sync` com o bearer da sessão e sem corpo ou identificador. O
estado indisponível explica o impacto e mantém a ação manual de Champion Select quando o League
está fechado. Mensagens externas são sanitizadas e não exibem stack, código interno ou credencial.

## Temas, densidade e intensidade

Preferências são locais e vivem em `sparta:visual-preferences-v2`:

| Eixo        | Opções                          | Efeito                                                                                          |
| ----------- | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| tema        | Espartano, Obsidian, Adaptativo | altera superfícies, bordas, elevação, foco, hover, seleção, gradiente, glow e paleta de gráfico |
| densidade   | Confortável, Compacta           | altera paddings, gaps, altura da topbar e largura da sidebar sem esconder informação            |
| intensidade | Completa, Reduzida              | controla arte ambiente e hero, sem remover dados ou estados                                     |

Verde, amarelo e vermelho mantêm significado fixo em todos os temas. Somente o tema Adaptativo
pode aplicar a cor extraída de uma splash relacionada ao campeão; Espartano e Obsidian removem o
accent inline. `prefers-reduced-motion` continua respeitado.

## Estados e acessibilidade

Loading usa skeleton sem flash de dados falsos. Vazio, ausência de conta, parcialidade,
desatualização, API indisponível, erro e sucesso têm mensagens e ações próprias. Cobertura nunca é
tratada como confiança ou qualidade. Foco visível, landmarks, labels, `aria-live`, contraste dos
tokens, navegação por Tab/Enter e texto alternativo foram preservados nos componentes novos.

## Responsividade e custo

A largura mínima suportada permanece 1000 px. Foram exercitados 1000, 1280 e 1600 px; em 1000 px
a sidebar e a topbar compactam antes que o dashboard perca estrutura. Escalas de 125% e 150% usam
os mesmos breakpoints fluidos e não dependem de posição absoluta.

Não foi adicionada dependência. O build do renderer passou de 94,34 para 109,41 kB de CSS
(+15,07 kB) e de 993,86 para 1.021,76 kB de JavaScript (+27,90 kB). A consulta inicial do dashboard
caiu de três endpoints para um agregado; refresh concorrente é protegido por sequência e não
sobrescreve resposta mais nova.

## Verificação

- pipeline integral com 1.171 testes TypeScript e 1 teste do analyzer aprovados;
- 95 testes do desktop, incluindo dashboard, shell, preferências, API, ausência/zero, erros,
  teclado e larguras 1000/1280/1600;
- typecheck, lint e build do desktop aprovados;
- Electron empacotado validado com dados pessoais reais e identidade local sanitizada em 1000,
  1280 e 1600 px; Espartano confortável e Obsidian compacto/reduzido inspecionados;
- recomendação controlada: cinco escolhas principais e uma alternativa usando a release ativa;
- `release-etapa27c-v1` continuou `ACTIVE`, com `artifactHash`, `configHash` e
  `validatedArtifactHash` intactos;
- replay real `replay-input-bundle/2.0.0`: `EXACT_REPLAY`, zero divergências e zero dependências
  ausentes.

Screenshots e servidor da validação visual foram temporários, continham identidade sanitizada e
não fazem parte do repositório nem do pacote.
