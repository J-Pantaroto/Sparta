# Dossiê de submissão Production — Sparta GG (Etapa 31L)

Status: **pacote preparado, não enviado**. Nada neste documento foi submetido ao Developer Portal
da Riot. Campos que só o responsável pelo produto pode decidir permanecem marcados
`TO_CONFIRM_IN_PORTAL` ou `[DECISÃO DO TITULAR]`, nunca preenchidos por invenção.

Ver também `docs/riot-policy-compliance-matrix.md` (políticas revalidadas e matriz de
conformidade) e `docs/riot-api-inventory.md` (APIs, tráfego, rate limits).

---

## 3. Definição canônica do produto

**Sparta GG é uma ferramenta de análise pessoal, histórico e apoio à decisão pré e pós-partida
para o próprio jogador de League of Legends.** Ela organiza o histórico de partidas que o jogador
já tem, mostra índices sobre o desempenho observado, apresenta múltiplas opções de campeão
durante o Champion Select com as razões por trás de cada uma, e compara o que era esperado antes
de uma partida com o que de fato aconteceu nela.

O Sparta GG **não joga pelo usuário, não escolhe campeão automaticamente, não faz lock-in, não
automatiza nenhuma ação no cliente do League of Legends, e não utiliza nenhuma informação oculta
do jogo**. Ele sempre oferece múltiplas opções, nunca uma única escolha imposta, e a decisão final
continua inteiramente com o jogador, dentro do próprio cliente oficial da Riot.

Termos que o Sparta GG **evita deliberadamente**, porque descreveriam o produto de forma incorreta
e incompatível com a política de integridade de jogo da Riot:

- "IA que decide por você" — o Sparta nunca decide; ele apresenta opções com evidência.
- "Preditor de vitória" — nenhuma métrica do produto representa probabilidade de vitória.
- "Sistema que encontra a escolha certa" — não existe "a" escolha certa; há opções com trade-offs.
- "Calculadora de elo/MMR" — o Sparta não calcula, estima nem substitui o sistema de
  classificação oficial da Riot.

## 4. Descrição curta (Developer Portal)

### English (para o campo principal, se o Portal exigir inglês)

> Sparta GG is a personal analytics and decision-support tool for League of Legends players. It
> reads a player's own authorized match history and turns it into personal performance indices,
> trend tracking, and champion-select guidance — always as multiple explained options, never a
> single automatic choice. During Champion Select, Sparta GG observes the player's own draft
> session (position, revealed allies/enemies, completed bans) through the local League Client API
> in read-only mode, and suggests several champions from the player's own pool with the reasons
> behind each suggestion; the player always confirms the pick manually inside the official League
> Client. After a match, Sparta GG compares what was expected before the game with what was
> actually observed in it, using Match-V5 data, without claiming causality or grading the earlier
> recommendation as right or wrong. Global meta data (win rates, tier lists, global matchups) is
> currently unavailable and is not claimed. Sparta GG performs no automation of picks, bans,
> summoner spells, or runes, and never writes to the League Client.

(≈195 palavras.)

### Português (para documentação interna)

> O Sparta GG é uma ferramenta de análise pessoal e apoio à decisão para jogadores de League of
> Legends. Ele lê o histórico de partidas autorizado do próprio jogador e o transforma em índices
> pessoais de desempenho, acompanhamento de tendência e orientação no Champion Select — sempre
> como múltiplas opções explicadas, nunca uma escolha automática única. Durante o Champion Select,
> o Sparta observa a sessão de draft do próprio jogador (posição, aliados/inimigos revelados, bans
> concluídos) através da API local do League Client em modo somente leitura, e sugere vários
> campeões do pool do próprio jogador com as razões por trás de cada sugestão; o jogador sempre
> confirma a escolha manualmente dentro do cliente oficial do League. Depois de uma partida, o
> Sparta compara o que era esperado antes do jogo com o que foi de fato observado nele, usando
> dados do Match-V5, sem alegar causalidade nem classificar a recomendação anterior como certa ou
> errada. Dados de meta global (win rate, tier list, matchup global) estão atualmente
> indisponíveis e não são alegados. O Sparta não automatiza picks, bans, feitiços de invocador ou
> runas, e nunca escreve no League Client.

## 5. Descrição detalhada

### Product overview

Sparta GG é composto por um aplicativo Desktop (Electron/React) e um backend próprio (Fastify/
PostgreSQL) que consome as APIs oficiais da Riot em nome do jogador autenticado. O produto cobre
o ciclo pré-partida → partida → pós-partida → evolução, sempre a partir de dados observados, nunca
inferidos ou inventados.

### Player problem

Jogadores de League of Legends têm acesso ao próprio histórico de partidas espalhado por
ferramentas desconectadas, sem um lugar único que junte "o que eu já joguei", "o que devo
considerar escolher agora, dado o que eu sei" e "o que de fato aconteceu comparado ao que eu
esperava". O Sparta GG resolve essa fragmentação usando exclusivamente dados que a própria Riot já
disponibiliza sobre a conta autorizada do jogador.

### Core user flow

Ver seção 6 (fluxo completo) e seção 7 (Champion Select em detalhe).

### Data sources

- Riot Account-V1 (`/accounts/me`, via RSO quando disponível) — identidade verificada do jogador.
- Riot Match-V5 (lista de IDs, detalhe e timeline de partida) — histórico e métricas observadas.
- Data Dragon (CDN pública, sem autenticação) — nomes e ícones estáticos de campeões e itens.
- League Client API (LCU), local, read-only — estado do draft em andamento.

Inventário completo com propósito/retenção/visibilidade por dado: `docs/riot-api-inventory.md` e
seção 12 abaixo.

### Pre-game functionality

- Dashboard e Perfil: índices pessoais sobre a amostra observada do próprio jogador.
- Champion Select: de 3 a 5 recomendações de campeão, com razões e alertas, a partir do pool
  pessoal, da posição detectada e do que está revelado no draft real.
- Pré-game: resumo factual da composição conhecida no momento (sem inferir o que não foi
  revelado).

### Post-game functionality

- Comparação entre o esperado (histórico pessoal no campeão/posição) e o observado (métricas reais
  da partida via Match-V5), com linha do tempo de eventos factuais, sem narrativa causal.
- Evolução pessoal: acompanhamento de pontos fracos identificados ao longo de várias partidas
  (melhorando/piorando/ainda sem comparação suficiente).

### Security

Ver seção 26 (resumo) e `docs/security-audit.md` (auditoria completa, Etapa 28a/28b).

### Privacy

Ver seção 27 (resumo) e `docs/account-deletion-draft.md`.

### Game integrity

Ver seção 7 (Champion Select) e a matriz de conformidade completa em
`docs/riot-policy-compliance-matrix.md`.

### Current limitations

- API pública ainda não está no ar; produto funciona hoje só em desenvolvimento local.
- RSO ainda não está ativo; identidade real depende de aprovação da Production Key.
- Meta global, win rate global e tier list global **não existem** no produto — não são
  "temporariamente indisponíveis", são inexistentes nesta versão.
- Domínio, VPS e e-mail de suporte públicos ainda dependem de provisionamento pelo responsável
  (Etapa 31K, `docs/public-foundation-infrastructure.md`).

### Future integration with RSO

Ver seção 11. A integração final com RSO só será implementada **depois** da aprovação da Riot,
usando exclusivamente credenciais e instruções fornecidas oficialmente no onboarding — nada foi
inventado ou simulado com credencial real.

Nenhuma funcionalidade futura especulativa (modo carreira, coach ao vivo) é apresentada como parte
do produto submetido — ver seções 23 e 24.

## 6. Fluxo real do usuário

```text
Criar conta Sparta
  ↓
Confirmar e-mail
  ↓
Vincular conta Riot
  ↓
Sincronizar histórico autorizado
  ↓
Dashboard / Perfil
  ↓
Champion Select
  ↓
Recomendações múltiplas
  ↓
Pré-game
  ↓
Partida (fora do Sparta, no cliente oficial da Riot)
  ↓
Pós-game
  ↓
Evolução pessoal
```

| Etapa | Estado |
| --- | --- |
| Criar conta Sparta | **Disponível hoje em desenvolvimento** — `POST /auth/register`, funcional local |
| Confirmar e-mail | **Disponível hoje em desenvolvimento** (provider real de e-mail ainda pendente para produção — `BLOCKED_BY_EMAIL_PROVIDER_CONFIGURATION`) |
| Vincular conta Riot | **Disponível hoje em desenvolvimento** via vínculo legado (`UNVERIFIED_LEGACY`, só fora de produção); **dependente de Production Key/RSO** para produção real (`VERIFIED_BY_RSO`) |
| Sincronizar histórico autorizado | **Disponível hoje em desenvolvimento** — `POST /players/sync`, usa Match-V5 real |
| Dashboard / Perfil | **Disponível hoje em desenvolvimento** — telas completas, dado real |
| Champion Select | **Disponível hoje em desenvolvimento** — leitura real do LCU quando o cliente está aberto |
| Recomendações múltiplas | **Disponível hoje em desenvolvimento** — motor real, 3 a 5 candidatos |
| Pré-game | **Disponível hoje em desenvolvimento** |
| Partida | **Não público** — o Sparta não participa da partida; ela acontece inteiramente no cliente oficial |
| Pós-game | **Disponível hoje em desenvolvimento** — usa Match-V5 real |
| Evolução pessoal | **Disponível hoje em desenvolvimento** |

Nenhum passo deste fluxo foi construído artificialmente só para esta submissão — todos já existem
e são exercitados em desenvolvimento local com a conta real de teste, conforme documentado nas
Etapas 1 a 31K deste projeto.

## 7. Fluxo de Champion Select — ótica de Game Integrity

Esta é a área de maior risco de integridade competitiva, então é detalhada à parte.

**O que o Sparta faz:**

- Lê a sessão de champion select do League Client via `GET /lol-champ-select/v1/session`, **read-
  only** — `packages/riot/src/lcu/read-only-client.ts` usa exclusivamente `method: "GET"` em toda
  a integração LCU (confirmado por busca no código: zero ocorrência de outro verbo HTTP).
- A posição do jogador só é usada quando é **factualmente conhecida**: detectada via
  `assignedPosition` do próprio LCU, ou escolhida manualmente pelo jogador no modo de simulação
  (fora de uma sessão real). Nunca chutada — posição desconhecida produz zero recomendações, não
  um palpite (Etapa 6, `docs/data-provenance.md`).
- Aliados e inimigos só entram na análise quando **já estão revelados** na sessão real (campeão
  escolhido, banimento concluído). Nada é inferido sobre quem ainda não apareceu.
- O motor devolve **de 3 a 5** recomendações, nunca uma única, cada uma com razões e alertas
  explícitos (`packages/core/src/draft/recommendation-engine.ts`).
- A escolha final é **sempre manual**: o jogador confirma o campeão dentro do próprio cliente da
  Riot. O botão "Confirmar campeão" da interface do Sparta só registra a escolha **no Sparta**
  (para gerar a build sugerida e a análise pré-game) — não envia nenhum comando ao League Client.

**O que o Sparta explicitamente NÃO faz:**

- Nenhuma automação de pick, ban, lock-in, troca de campeão ou runas.
- Nenhuma escrita no League Client — confirmado por código: o único método HTTP usado pelo cliente
  LCU inteiro é `GET`.
- Nenhuma informação oculta: sem leitura de cooldown de habilidade inimiga, sem summoner spell
  inimigo antes de ser revelado, sem qualquer dado que o jogo não expõe ao próprio jogador naquele
  momento.
- Nenhuma informação futura: o Sparta não sabe e não tenta adivinhar o que ainda vai acontecer no
  draft.
- Nenhuma manipulação do League Client — os únicos handlers IPC do processo principal relacionados
  a sessão/League são todos de leitura (`sparta:lcu-state`) ou de fluxo do próprio Sparta
  (`sparta:session:*`, `sparta:riot-auth:open`, `sparta:download-skin`) — nenhum envia comando ao
  cliente da Riot (auditoria completa em `apps/desktop/src/main/index.ts`, confirmado por busca de
  todos os `ipcMain.handle` registrados).

## 8. Natureza das recomendações

O motor de recomendação (`packages/core/src/draft/recommendation-engine.ts`) usa:

- histórico pessoal do jogador com o campeão/posição;
- pool de campeões observado (partidas reais) mais inclusões manuais do próprio jogador;
- experiência pessoal por função (quantidade de partidas, recência);
- capacidades da composição conhecida (engage, peel, frontline, wave clear, etc., derivadas de
  dados públicos da Data Dragon);
- risco de execução (dificuldade oficial do campeão combinada com experiência pessoal, nunca com
  win rate);
- matchup pessoal contra o adversário de rota, **somente quando há confronto observado de verdade**
  no histórico do próprio jogador;
- os dados efetivamente disponíveis no momento exato do draft.

**Garantias explícitas:**

- Matchup global ausente **não** recebe um valor fictício de preenchimento — fica marcado como
  indisponível, com o motivo (Etapa 3, `docs/data-provenance.md`).
- Ausência de dado é preservada como ausência em toda a cadeia — nunca vira 0 ou 50 artificial
  (Etapas 2, 3 e 4 do projeto, dedicadas inteiramente a esse invariante).
- O score de cada recomendação **não representa chance de vitória**. Essa frase aparece
  literalmente na interface do produto: `apps/desktop/src/renderer/src/features/
  PreGameScreen.tsx` — "Não é confiança estatística nem chance de vitória"; e em
  `PostGameScreen.tsx` — "Cobertura não é confiança, qualidade da partida ou chance de vitória".
- O score **não representa certeza** — cada candidato carrega cobertura de dados e confiança
  estatística como campos separados e explícitos, nunca embutidos escondidos no número final.
- O primeiro colocado (top-1) **não é uma ordem compulsória** — a interface sempre mostra os
  demais candidatos lado a lado, com razões próprias, e o jogador escolhe livremente entre
  qualquer um deles ou nenhum.

## 9. Dados globais

Registro explícito, sem eufemismo:

> **Global meta data is currently unavailable.**

O Sparta GG não alega, em nenhuma tela ou documento público:

- meta global (win rate por campeão na base geral de jogadores);
- tier list global;
- matchup global (confronto agregado entre dois campeões na base geral);

A decisão sobre uma fonte candidata para meta global está registrada em `docs/adr/0002-global-
meta-source.md` (Etapa 18): agregação própria sobre APIs oficiais da Riot é apenas
`SELF_AGGREGATION_CANDIDATE`, e depende de Production Key que cubra esse uso explicitamente,
aprovação de retenção/exposição de agregados e orçamento — nada disso existe hoje, e nenhum
endpoint relacionado está ativo.

## 10. Pós-game

O relatório pós-game (`packages/core/src/postgame/post-game-analysis.ts`):

- compara fatos do histórico pessoal pré-partida (baseline do jogador no campeão/posição) com
  dados observados na partida via Match-V5;
- usa exclusivamente Match-V5 (detalhe da partida + timeline) e o histórico próprio já
  sincronizado;
- **não atribui causalidade** — a timeline lista fatos com timestamp ("14:23 DRAGON registrado"),
  nunca "X causou Y" (princípio documentado desde a Etapa 15/31H);
- **não cria contrafactual** — não simula "o que teria acontecido se";
- **não classifica a recomendação anterior como certa ou errada usando vitória/derrota** — o
  domínio deste módulo não tem nenhum campo de "acerto"; vitória e derrota nunca entram como
  critério de avaliação da escolha (mesmo princípio aplicado à revisão humana da Etapa 24 e à
  observabilidade longitudinal da Etapa 23).

## 11. RSO

> **RSO integration prepared architecturally but not active.**

O fluxo completo (transação `state` one-time com hash, callback, troca de código, consulta a
Account-V1 `/accounts/me`) está desenhado e as rotas existem
(`docs/identity-authorization-riot-readiness.md`), mas **nenhum adapter real, client secret ou
credencial RSO foi criado ou simulado**. Em produção, `RSO_REQUIRED` é o único modo aceito e
somente `VERIFIED_BY_RSO` libera dados pessoais.

Enquanto RSO não está disponível:

- nenhum Riot ID digitado manualmente comprova propriedade de conta;
- `UNVERIFIED_LEGACY` nunca libera as rotas pessoais em produção (`NODE_ENV=production` exige
  `RSO_REQUIRED`, sem exceção nem fallback silencioso);
- nenhum login Riot falso foi criado — o vínculo legado por Riot ID só existe fora de produção,
  com flag explícita e rotulado como "ambiente local controlado" na interface.

A integração final com o provedor real de RSO só será implementada **depois** que a Riot fornecer
credenciais e instruções oficiais de onboarding, seguindo exatamente o método documentado por ela
— não um método adivinhado.

## 12. Dados utilizados — inventário

| Dado | Fonte | Finalidade | Retenção | Público/privado |
| --- | --- | --- | --- | --- |
| Conta Sparta (email, hash de senha, nome de exibição) | Cadastro no Sparta | Autenticação e identidade da conta | Enquanto a conta estiver ativa; exclusão sob pedido em até 30 dias | Privado |
| Riot ID (`gameName`/`tagLine`) | Account-V1 (ou vínculo legado fora de produção) | Exibir e confirmar a identidade vinculada | Enquanto o vínculo existir | Privado |
| PUUID | Account-V1 `/accounts/me` (RSO) ou lookup por Riot ID (legado) | Chave técnica interna para todas as consultas Match-V5 | Enquanto o vínculo existir; PUUID é específico por API key da Riot — rotação de key invalida o mapeamento (ver §1, fonte 9) | Privado, nunca exposto em log de acesso (Etapa 28b) |
| Região/plataforma/roteamento | Account-V1 | Rotear corretamente as chamadas Riot | Enquanto o vínculo existir | Privado |
| Histórico de partidas (IDs, detalhe, timeline) | Match-V5 | Perfil, recomendações, pós-game, evolução | Enquanto a conta estiver ativa | Privado |
| Participantes de uma partida (os 10 jogadores) | Match-V5 | Contexto factual do pós-game (times, sem nível — a Riot não persiste nível em nenhuma tabela usada) | Enquanto a conta estiver ativa | Privado (dado de terceiros de uma partida compartilhada, tratado com o mesmo cuidado) |
| Observações de loadout (itens, runas, feitiços por partida) | Match-V5 | Histórico pessoal de build por campeão | Enquanto a conta estiver ativa | Privado |
| Draft observado (posição, aliados/inimigos revelados, bans) | LCU local, read-only | Recomendação em tempo real no Champion Select | Snapshot da sessão, persistido para o histórico de drafts do próprio jogador | Privado |
| Estatísticas agregadas pessoais (índices, tendências, pontos fortes/fracos) | Derivado do histórico próprio | Dashboard, Perfil, Evolução | Enquanto a conta estiver ativa | Privado |
| Champion/item/rune (nomes e ícones estáticos) | Data Dragon (CDN pública) | Exibição visual | Não persistido como dado do jogador — é catálogo público, cacheado | Público (dado da Riot, não do jogador) |

Nenhum dado fora desta lista é coletado ou planejado para o fluxo submetido. Nenhum dado global
(de outros jogadores fora de uma partida compartilhada) é coletado.

## 13. Arquitetura

```text
Desktop (Electron)
   |
   | HTTPS (produção; hoje localhost em desenvolvimento)
   v
Sparta API (Fastify)
   |
   +--- Riot APIs (Account-V1, Match-V5) — server-side, RIOT_API_KEY nunca sai daqui
   |
   +--- PostgreSQL (dados da conta Sparta e do histórico sincronizado)

Desktop (Electron, processo principal)
   |
   | localhost, read-only, Basic Auth do próprio lockfile do cliente
   v
League Client (LCU) — leitura da sessão de champion select/gameflow
```

RSO futuro (não ativo):

```text
Jogador
  |
  v
Riot Authorization (auth.riotgames.com)
  |
  v
Sparta callback (HTTPS, state one-time)
  |
  v
Identidade Riot verificada (VERIFIED_BY_RSO)
```

Nada revelado aqui inclui secrets, endpoints internos além do necessário para entender o fluxo,
hostnames privados, credenciais ou detalhes de firewall — apenas os três componentes e a direção
do tráfego.

## 14. API key

Confirmado por auditoria de código nesta etapa (busca por `RIOT_API_KEY` em todo o repositório):

- a Production Key **nunca** ficará no Desktop — hoje ela só existe em `apps/api` (backend);
- todas as chamadas Riot autenticadas são feitas pelo backend (`packages/riot/src/clients/riot-
  api-client.ts`, chamado só por `apps/api/src/modules/riot-integration/` e `.../sync/`);
- secrets ficam no ambiente do servidor (variável `RIOT_API_KEY`, nunca em arquivo versionado);
- HTTPS obrigatório em produção — o boot da API falha sem `PUBLIC_API_URL` HTTPS explícita;
- a key não está e nunca esteve commitada — confirmado pela mesma auditoria e pela auditoria de
  secrets já feita na Etapa 31K para os arquivos daquela etapa, repetida aqui para o repositório
  como um todo com o mesmo resultado: zero ocorrência de valor de key real em qualquer arquivo
  versionado.

## 15. Screenshots oficiais

Já sanitizadas e publicadas em `apps/site/public/img/` desde a Etapa 31K:

| Arquivo | Tela | Sanitização aplicada |
| --- | --- | --- |
| `screenshot-dashboard.jpg` | Dashboard | Identidade da conta de teste redigida por região de pixel (Python/PIL) |
| `screenshot-champion-select.jpg` | Champion Select | Tela de espera sem sessão real — nenhuma identidade visível, sanitização não foi necessária |
| `screenshot-postgame.jpg` | Pós-game / histórico de partidas | Nenhuma identidade de conta visível na composição do enquadramento, sanitização não foi necessária |

Nenhuma captura de Laboratório, releases ou tela técnica do motor está entre as publicadas — eram
deliberadamente excluídas desde a seleção original (Etapa 31K). Uma quarta captura (Perfil, com um
heading grande exibindo o nome da conta) foi avaliada e **descartada** por não ter ficado limpa o
suficiente após a redação — três capturas limpas foram consideradas melhores que quatro com uma
malfeita.

E-mail, tokens, PUUID, IDs técnicos e hashes: confirmado ausente nas três imagens (nenhuma delas
mostra qualquer um desses elementos — Dashboard e Pós-game mostram estatísticas de jogo, Champion
Select mostra a tela de espera sem sessão). O Riot ID da conta de teste (`Zekerus#117`) não
aparece em nenhuma das três imagens finais publicadas.

## 16. Legendas das screenshots

Linguagem objetiva, sem marketing exagerado:

- **Dashboard** — "Personal overview built from the player's own authorized match history: index
  scores, recent trend, and champion pool — no global comparison, no win-rate prediction."
- **Champion Select** — "Reads the player's real draft session from the League Client in read-only
  mode and presents several champion options based on the player's own history and the visible
  draft state. The application does not select, ban, or lock a champion."
- **Post-game** — "Compares what was expected before the match with what was actually observed in
  it, using match data already available to the player. No causal claims, no win/loss grading of
  the earlier suggestion."

## 17. Site público esperado

Todos classificados como `PLANNED_PUBLIC_URL` — **nenhum está online hoje** (Etapa 31K terminou em
`BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING`; domínio/VPS/e-mail não provisionados):

- `https://spartagg.com.br` — `PLANNED_PUBLIC_URL`
- `https://spartagg.com.br/como-funciona` — `PLANNED_PUBLIC_URL`
- `https://spartagg.com.br/funcionalidades` — `PLANNED_PUBLIC_URL`
- `https://spartagg.com.br/privacidade` — `PLANNED_PUBLIC_URL`
- `https://spartagg.com.br/termos` — `PLANNED_PUBLIC_URL`
- `https://spartagg.com.br/excluir-conta` — `PLANNED_PUBLIC_URL`
- `https://spartagg.com.br/status` — `PLANNED_PUBLIC_URL`

O conteúdo de cada uma já existe e foi validado localmente (`apps/site/`, Etapa 31K) — o que falta
é exclusivamente a publicação real, que depende do checklist de aquisição em
`docs/public-foundation-infrastructure.md` §9.

## 18. Verificação de domínio

Runbook preparado para quando a Riot fornecer o conteúdo de verificação:

1. A Riot envia o valor exato a ser publicado (token/string de verificação).
2. O valor é colocado, **sem nenhuma modificação**, em um arquivo estático servido em
   `https://spartagg.com.br/riot.txt`.
3. `infra/Caddyfile` (Etapa 31K.1) já serve arquivos estáticos da raiz do site — nenhuma
   configuração adicional de rota é necessária além de adicionar o arquivo em `apps/site/public/`.
4. Confirmar acesso público ao arquivo via `curl -I https://spartagg.com.br/riot.txt` (200, texto
   plano) antes de notificar a Riot.

O conteúdo do arquivo é:

```text
EXACT_VALUE_PROVIDED_BY_RIOT
```

**Nunca** um valor inventado ou um placeholder que pareça válido — o arquivo simplesmente não
existe até a Riot fornecer o conteúdo real.

## 19. Disclaimer

Verificado nesta etapa (ver `docs/riot-policy-compliance-matrix.md` §2 para a análise completa):

- O disclaimer do **Legal Jibber Jabber** está presente e verbatim em `apps/site/termos.html`
  (seção 11 daquela página), confirmado contra a fonte oficial nesta sessão.
- **Falta** o disclaimer específico da política de Desenvolvedor de League of Legends ("[Your
  Product Name] is not endorsed by Riot Games and does not reflect the views or opinions of Riot
  Games or anyone officially involved in producing or managing Riot Games properties.") — os dois
  não são intercambiáveis, cobrem políticas diferentes que se aplicam simultaneamente ao Sparta.
- **Falta** qualquer disclaimer dentro do próprio aplicativo Desktop — confirmado por busca no
  código-fonte, zero ocorrência.

Ação registrada no checklist (`docs/riot-submission-checklist.md`): adicionar o segundo texto ao
site (junto ao já existente, não em substituição) e adicionar um dos dois textos a uma tela do
Desktop (ex.: Configurações → Sobre) antes do envio.

## 20. Propriedade intelectual

Auditoria de assets do produto e do site, feita nesta etapa (busca por todos os arquivos de imagem
versionados no repositório):

| Asset | Classificação | Evidência |
| --- | --- | --- |
| `apps/desktop/build/icon.png` (ícone do app, usado também como favicon do site) | `Sparta-owned` | Marca própria (Λ vermelho sobre fundo escuro), sem elemento de logo da Riot/League |
| Ícones de campeão/item/runa exibidos em tela | `Data Dragon` | **Nunca commitados nem embutidos no binário** — buscados ao vivo da CDN pública oficial da Riot em tempo de execução (`apps/desktop/src/renderer/src/services/datadragon.ts`); zero arquivo de campeão/item/runa versionado no repositório |
| Splash art de campeão (tema visual) | `Data Dragon` / `Community Dragon` | Mesmo padrão — buscado ao vivo, nunca redistribuído pelo Sparta |
| Emblemas de rank | `Não usado` | O produto não exibe rank/elo (indisponível até integração League-V4, fora de escopo) |
| Favicon | `Sparta-owned` | Mesmo arquivo do ícone do app |
| Screenshots do produto (3 imagens) | `Sparta-owned` (mostram, mas não redistribuem, assets da Riot exibidos dentro da própria interface do produto) | Capturas do próprio Sparta, sanitizadas — ver §15 |

**Nenhum asset foi presumido utilizável só por ter sido encontrado online.** Todo ícone/arte de
campeão vem exclusivamente da CDN pública e documentada da Data Dragon, com fallback para
Community Dragon (mesmo padrão, ambos públicos e sem autenticação, uso normal e esperado para
consumidores da API Riot) — nunca de uma fonte não oficial.

## 21. Marca Sparta GG

Confirmado:

- O logo/marca principal exibido em todo o produto é "Sparta"/"Sparta GG", nunca um logo da Riot
  ou do League of Legends.
- A Riot não aparece em nenhuma tela como patrocinadora — o único lugar em que "Riot Games" é
  mencionado é no disclaimer obrigatório e nas seções factuais de privacidade/segurança que
  descrevem a integração.
- "League of Legends" não é usado como marca do produto — aparece só descritivamente, para
  explicar do que o produto trata.
- O site institucional (`apps/site/`) não imita o cliente oficial do League nem o Developer
  Portal da Riot — usa identidade visual própria (dark premium, Manrope, glassmorphism na cor de
  marca própria do Sparta).
- As screenshots publicadas mostram claramente um produto de terceiro distinto, com sua própria
  interface, sidebar e navegação — nenhuma delas é um recorte do cliente oficial do League.

## 22. Monetização

> **No monetization at the current submission stage.**

Não há plano premium, assinatura, cobrança ou qualquer forma de monetização implementada ou
anunciada em nenhuma tela do produto ou do site. Nenhum plano futuro de monetização foi
documentado nem deve ser inventado para esta submissão.

## 23. Modo carreira

**Não incluído** como funcionalidade do produto submetido. Não aparece no site principal, nas
screenshots selecionadas, na descrição curta/detalhada ou no fluxo de usuário submetido.

Registro interno: *Future concept — not part of this application.*

## 24. Coach ao vivo

**Não incluído.** Não mencionado como funcionalidade futura nesta primeira submissão. Só será
discutido com a Riot se ela perguntar explicitamente sobre roadmap durante a avaliação — o Sparta
não vai introduzir esse tópico proativamente numa etapa em que a prioridade é obter a primeira
aprovação com o escopo já existente.

## 25. Laboratório interno

**Não apresentado como feature de jogador** em nenhum material desta submissão. Classificação:

> Internal calibration / audit tooling.

Pode ser citado, se ajudar a avaliação da Riot e sem confundir a explicação do produto, apenas
para demonstrar que o Sparta tem:

- auditabilidade (cada recomendação persistida pode ser reproduzida exatamente a partir do que
  existia no momento do draft — `docs/replay-input-bundle.md`);
- controle de releases (mudança de peso/configuração do motor passa por um ciclo formal de
  validação e ativação, nunca aplicada direto em produção sem histórico — `docs/release-
  operations.md`);
- reprodutibilidade (o motor reconstruído offline a partir de um snapshot antigo produz
  exatamente o mesmo resultado, verificado automaticamente — `EXACT_REPLAY`).

Isso demonstra maturidade de engenharia à Riot, mas não é e não deve ser descrito como algo que o
jogador final usa.

## 26. Segurança — resumo

Detalhe completo em `docs/security-audit.md` (Etapas 28a/28b) e `docs/identity-authorization-riot-
readiness.md` (Etapa 31C). Resumo objetivo, sem transformar esta submissão em relatório de
pentest:

- Autenticação: senha com `scrypt` nativo, sessão assinada HMAC-SHA256, nunca reversível.
- Confirmação de e-mail: token CSPRNG de 32 bytes, hash SHA-256 persistido (nunca o token em
  claro), uso único, expira, revoga emissões anteriores.
- Autorização: toda rota tem classe executável (`PUBLIC`/`AUTHENTICATED`/`OWN_RESOURCE`/
  `ADMINISTRATIVE`/`INTERNAL_ONLY`); o boot falha se uma rota não tiver política — não existe rota
  "esquecida" sem dono.
- Isolamento de propriedade: todo recurso pessoal deriva o dono do token de sessão; identificador
  de outra conta na URL responde 404, nunca o dado de outra pessoa.
- Gate RSO: produção só aceita `VERIFIED_BY_RSO`; nenhum fallback silencioso para vínculo legado.
- HTTPS: obrigatório em produção — boot falha sem URL pública HTTPS explícita.
- Secrets: `RIOT_API_KEY` e `AUTH_TOKEN_SECRET` só no ambiente do servidor, nunca no binário
  distribuído nem versionados.
- Tokens de verificação: só o hash é persistido, nunca o valor em claro.
- `safeStorage` do Electron (DPAPI no Windows): a sessão persistida no Desktop é cifrada pelo
  sistema operacional, não fica em texto plano no disco do usuário.
- Redação de PUUID em logs: identificadores pessoais em rotas viram rótulo opaco antes de irem
  para o log de acesso.
- Auditoria de dependências: `pnpm audit` monitorado a cada etapa relevante, alertas Dependabot
  corrigidos quando abertos (ex.: Etapa 31G.1).

## 27. Privacidade — resumo

Consistente com a futura página pública (`apps/site/privacidade.html`, já escrita na Etapa 31K,
ainda não publicada):

- Minimização: só o dado necessário para as funcionalidades descritas é coletado; nada de coleta
  especulativa "para o futuro".
- Finalidade: cada categoria de dado tem um propósito descrito no inventário (§12).
- Retenção: enquanto a conta estiver ativa.
- Elegibilidade para remoção: 365 dias de inatividade.
- Exclusão sob solicitação: concluída em até 30 dias corridos a partir da confirmação do pedido
  (processo detalhado em `docs/account-deletion-draft.md` — hoje é um desenho operacional, ainda
  não um endpoint público, porque a API pública ainda não existe).
- Suporte: canal público só será divulgado quando `suporte@spartagg.com.br` estiver de fato
  recebendo e-mail (não antes — Etapa 31K, `docs/public-foundation-infrastructure.md`).
- Dados Riot: tratados com o mesmo cuidado que dados da própria conta Sparta, nunca vendidos,
  nunca usados para publicidade comportamental.
- Isolamento: um usuário nunca acessa dado de outro, nem por identificador direto (ver §26).

**Nenhuma promessa incompatível com a implementação atual foi criada** — cada afirmação acima tem
correspondência direta em código ou processo já existente, auditado nesta etapa.

## 28. Formulário Production — pré-preenchido

Campos observáveis sem realizar submissão real. Onde um campo só aparece depois de iniciar o fluxo
de fato, ele está marcado `TO_CONFIRM_IN_PORTAL` em vez de inventado.

| Campo | Resposta proposta |
| --- | --- |
| Application name | Sparta GG |
| Website | `https://spartagg.com.br` (`PLANNED_PUBLIC_URL` — ver §17; não enviar até estar publicado) |
| Product description | Ver §4 (versão em inglês) |
| Detailed description | Ver §5 |
| Use case | Personal analytics / decision support tool (histórico pessoal, apoio ao draft, comparação pós-partida) — categoria compatível com os casos aprovados descritos na política (fonte 1 da matriz de conformidade: "player statistics and visualizations... training tools that allow players to view their own match histories and aggregate stats") |
| User flow | Ver §6 |
| APIs requested | Account-V1, Match-V5 — inventário completo com endpoints exatos em `docs/riot-api-inventory.md` |
| Expected traffic | Ver `docs/riot-api-inventory.md` §30 (estimativa modelada, não usuários reais) |
| Authentication | RSO (Riot Sign-On), quando aprovado; hoje o produto opera só em desenvolvimento local |
| RSO requirement | Sim, para identidade verificada em produção — ver §11 |
| Data storage | PostgreSQL próprio, hospedado em infraestrutura ainda a ser provisionada (Etapa 31K) — ver §12 e §13 |
| Security | Ver §26 |
| Privacy | Ver §27 |
| Monetization | Ver §22 — nenhuma |
| Contact | `TO_CONFIRM_IN_PORTAL` — depende do e-mail de suporte público estar ativo (Etapa 31K) |
| Additional notes | Perguntar explicitamente sobre a lista de endpoints LCU aprovados (ver `docs/riot-policy-compliance-matrix.md`, item `NEEDS_RIOT_REVIEW`) |
| Legal entity / responsible party | `[DECISÃO DO TITULAR]` — não inventado, mesma pendência já registrada desde a Etapa 31C |
| Target audience / age rating / countries | `[DECISÃO DO TITULAR]` — mesma pendência |

Campos que dependem do layout exato do formulário atual do Developer Portal e não puderam ser
observados sem iniciar uma submissão real: marcados `TO_CONFIRM_IN_PORTAL` no lugar de qualquer
suposição sobre nomes de campo específicos.
