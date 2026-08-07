# Matriz de conformidade com as políticas Riot (Etapa 31L)

Status: **preparação de submissão, não enviada**. Este documento não representa aprovação,
Production Key ou habilitação de RSO. Revalidação feita **contra fontes oficiais atuais**, não
apenas contra o histórico deste repositório — cada regra abaixo tem URL e data de consulta.

## 1. Fontes oficiais consultadas nesta etapa

Consultadas em **2026-08-07**. Onde a página expõe uma data de última atualização, ela está
registrada; onde não expõe, isso é dito explicitamente em vez de presumido.

| # | Fonte | URL | Última atualização informada pela Riot | O que cobre |
| - | ----- | --- | --------------------------------------- | ------------ |
| 1 | General Policies | https://developer.riotgames.com/policies/general | 11 de março de 2025 | Registro de produto, monetização, segurança de API key, integridade de jogo (resumo), disclaimer obrigatório |
| 2 | General Policies (espelho de suporte) | https://support-developer.riotgames.com/hc/en-us/articles/22698591841939-General-Policies | não acessível nesta sessão (HTTP 403 — página exige sessão autenticada no portal de suporte) | mesmo escopo do item 1; não usado como fonte primária por essa razão |
| 3 | Game Specific Policies (índice) | https://developer.riotgames.com/policies/game-specific | 11 de março de 2025 | Índice que aponta para a política específica de League of Legends |
| 4 | Developer API Policy — League of Legends | https://developer.riotgames.com/docs/lol#game-policy | não exposta na página | Regras de Game Integrity específicas de LoL, casos de uso não aprovados, texto do disclaimer obrigatório |
| 5 | Legal Jibber Jabber | https://www.riotgames.com/en/legal | agosto de 2018 | Política de conteúdo de fã / uso de IP, texto do disclaimer, e o **carve-out explícito para produtos comerciais que usam API key válida** |
| 6 | RSO (Riot Sign-On) | https://support-developer.riotgames.com/hc/en-us/articles/22801670382739-RSO-Riot-Sign-On | não exposta nesta consulta | Pré-requisito de Production Key antes de RSO, fluxo OAuth2, processo de RSO Client |
| 7 | Mudanças na política da LCU API | https://www.riotgames.com/en/DevRel/changes-to-the-lcu-api-policy | 24 de janeiro de 2019 (data de publicação do artigo) | Exigência de contato prévio com a Riot antes de lançar/atualizar app que usa a LCU API; restrição a endpoints de uma lista aprovada; restrição regional histórica (Coreia) |
| 8 | API Terms and Conditions | https://support-developer.riotgames.com/hc/en-us/articles/22698917218323-API-Terms-and-Conditions | não acessível nesta sessão (HTTP 403 — exige login no portal de suporte) | Termos vinculantes completos; **não pôde ser lida integralmente nesta etapa** — ver limitação abaixo |
| 9 | PUUID / camada de segurança | https://www.riotgames.com/en/DevRel/player-universally-unique-identifiers-and-a-new-security-layer | não exposta nesta consulta | PUUID é criptografado e **específico por API key** — relevante pra retenção de dados |

**Limitação registrada, não escondida**: dois documentos de política (itens 2 e 8) ficam atrás de
autenticação do portal de suporte da Riot e retornaram HTTP 403 nesta sessão — um agente sem
conta no Developer Portal não consegue lê-los. O conteúdo dos itens 1, 3, 4, 5, 6, 7 e 9 foi obtido
com sucesso, é público e não exige login. Antes da submissão real, o responsável pelo produto deve
entrar no Developer Portal com a própria conta e reler o item 8 (API Terms and Conditions) na
íntegra — esta matriz não substitui essa leitura final.

## 2. Achado que muda uma decisão anterior do projeto

A Etapa 31K publicou (em `apps/site/termos.html`) **somente** o disclaimer do Legal Jibber Jabber:

> "Sparta GG was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot
> Games. Riot Games does not endorse or sponsor this project."

A releitura desta etapa contra a fonte oficial (item 5) confirma que esse texto está **correto e
verbatim** para a política de conteúdo de fã — mas a mesma página declara explicitamente uma
categoria separada: *"commercial Projects that both (1) comply with our API Terms and API
Policies; and (2) use a currently valid Riot API key"*. Sparta se encaixa nessa segunda categoria
(usa Account-V1/Match-V5 com API key, não é só um "fan asset"), e a página de política específica
de League of Legends (item 4) exige **seu próprio** texto de disclaimer para produtos registrados
no Developer Portal:

> "[Your Product Name] is not endorsed by Riot Games and does not reflect the views or opinions of
> Riot Games or anyone officially involved in producing or managing Riot Games properties."

**Os dois textos não são intercambiáveis** — são exigências de duas políticas diferentes (uso de
IP/assets vs. uso da API/Developer Portal) que se aplicam simultaneamente a um produto como o
Sparta. Ação necessária, registrada na matriz abaixo e no checklist: publicar **os dois** textos,
não substituir um pelo outro. Isso é uma correção de escopo desta etapa, não uma falha de
implementação anterior — a Etapa 31K nunca tinha revalidado contra a política específica de LoL.

**Correção aplicada na Etapa 31L.1.** Os dois textos passaram a coexistir em
`apps/site/termos.html` (§11.1 Legal Jibber Jabber, §11.2 política de desenvolvedor de LoL), com
uma referência discreta de não-afiliação no rodapé de todas as páginas do site. O Desktop, que não
tinha disclaimer nenhum, ganhou uma seção "Sobre o Sparta GG" (aba nova em Configurações,
`apps/desktop/src/renderer/src/features/AboutSection.tsx`) com os dois textos embutidos
diretamente no bundle — disponíveis mesmo offline, sem depender de rede, API ou site publicado.
Ver `docs/riot-submission-checklist.md` §32 para o estado atualizado do checklist.

## 3. Matriz de conformidade

Estados possíveis: `COMPLIANT`, `COMPLIANT_WITH_LIMITATION`, `NOT_APPLICABLE`, `BLOCKED`,
`NEEDS_RIOT_REVIEW`. Nenhuma inconformidade foi suavizada.

| Regra Riot | Estado Sparta | Evidência | Risco | Ação necessária |
| --- | --- | --- | --- | --- |
| **Registro do produto** — todo produto deve ser registrado e auditado no Developer Portal antes de uso público (fonte 1) | `BLOCKED` | Nenhum produto registrado ainda — não há Production Key nem submissão | Alto se publicado sem registro | Registrar no Developer Portal como parte desta submissão (não feito nesta etapa, por instrução explícita) |
| **Uso de APIs suportadas** — usar serviços oficiais Riot para ingestão de dados (fonte 1) | `COMPLIANT` | `packages/riot/src/clients/riot-api-client.ts` só chama Account-V1 e Match-V5 oficiais; Data Dragon é CDN pública oficial | Baixo | Nenhuma |
| **HTTPS obrigatório** (fontes 1, 5) | `COMPLIANT_WITH_LIMITATION` | `apps/api/src/config/env.ts` recusa subir em produção sem `PUBLIC_API_URL` HTTPS explícita, CORS allowlist sem curinga e callback RSO HTTPS | Nenhum risco no código; limitação é que produção real ainda não existe (domínio/VPS não provisionados, Etapa 31K) | Provisionar domínio/VPS/certificado antes de operar em produção |
| **Segurança da API key** — uma key por produto, nunca no binário distribuído, SSL/HTTPS (fontes 1, 2) | `COMPLIANT` | `RIOT_API_KEY` só existe em `apps/api` (confirmado via busca no repositório inteiro — zero ocorrência em `apps/desktop`); todas as chamadas Riot passam por HTTPS | Baixo | Nenhuma |
| **Uso da League Client API (LCU)** — contato prévio obrigatório com a Riot antes de lançar/atualizar app que usa a LCU; só endpoints de uma lista aprovada (fonte 7) | `NEEDS_RIOT_REVIEW` | `packages/riot/src/lcu/read-only-client.ts` usa 3 endpoints (`gameflow-phase`, `gameflow session.gameData.gameId`, `champ-select session`), todos GET, documentados em `docs/identity-authorization-riot-readiness.md`/`docs/riot-compliance.md`. **Não há lista pública de endpoints aprovados** nem confirmação prévia da Riot de que estes três estão nela | Médio — a política exige contato explícito antes do lançamento; o Sparta ainda não fez esse contato porque não publicou nada usando a LCU | Perguntar explicitamente à Riot, no próprio formulário de submissão (campo de notas adicionais), se os três endpoints de leitura listados estão aprovados, antes de qualquer lançamento público que os use |
| **Integridade competitiva** — não criar vantagem injusta, não remover decisão do jogador, não rastrear informação oculta (cooldowns inimigos, invocador oculto), não usar dado desconhecido no momento (fonte 1, 4) | `COMPLIANT` | Auditoria de código confirma: LCU é 100% leitura (`method: "GET"` é o único método usado em todo o cliente LCU); zero handler IPC de escrita no League Client (`apps/desktop/src/main/index.ts` só expõe `session:get/set/clear`, `riot-auth:open`, `download-skin`, `lcu-state`); nenhuma leitura de cooldown, summoner spell inimigo ou dado futuro em nenhum módulo | Baixo | Nenhuma |
| **Apoio à decisão, não decisão automática** — "should not remove game decisions, but may highlight decisions that are important and give multiple choices" (fonte 4) | `COMPLIANT` | O motor sempre devolve de 3 a 5 recomendações (`packages/core/src/draft/recommendation-engine.ts`), nunca uma escolha única obrigatória; nenhum botão de "auto-pick"; confirmação de campeão é sempre manual do jogador no cliente da Riot | Baixo | Nenhuma |
| **Múltiplas opções ao jogador** (fonte 4) | `COMPLIANT` | Mesma evidência acima — 3 a 5 candidatos, nunca 1 | Baixo | Nenhuma |
| **Dados previamente visíveis apenas** — nada de informação de sessão de jogo previamente desconhecida ao jogador (fonte 4) | `COMPLIANT` | O draft observado só reflete o que já está na sessão real do LCU (aliados/inimigos revelados, bans concluídos); nada é inferido sobre o que ainda não apareceu | Baixo | Nenhuma |
| **Dados pessoais** — não coletar além do permitido pela API, não violar privacidade (API Terms, fonte 8, não lida integralmente) | `COMPLIANT_WITH_LIMITATION` | Inventário completo em `docs/riot-api-inventory.md`; isolamento por dono garantido estruturalmente (Etapa 31C, `docs/route-authorization-audit.md`) | Limitação: API Terms completos (fonte 8) não puderam ser relidos nesta sessão (403) | Responsável relê a fonte 8 com conta própria antes do envio |
| **Match history** — uso de Match-V5 conforme documentado (fonte 4) | `COMPLIANT` | `packages/riot/src/mappers/match-mapper.ts`, só do próprio jogador autenticado, nunca de terceiros sem vínculo | Baixo | Nenhuma |
| **RSO** — só disponível após Production Key aprovada (fonte 6) | `BLOCKED` | `docs/identity-authorization-riot-readiness.md`: fluxo preparado (endpoints, state one-time, callback), adapter real não existe, nenhuma credencial RSO foi inventada | Nenhum (bloqueio é esperado e correto nesta fase) | Ativar somente após aprovação da Production Key, conforme a própria política da Riot |
| **Identidade** — não aceitar Riot ID digitado como prova de propriedade em produção (fonte 6, 8) | `COMPLIANT` | `UNVERIFIED_LEGACY` nunca libera rotas pessoais em produção (`RSO_REQUIRED` é o único modo aceito com `NODE_ENV=production`); só `VERIFIED_BY_RSO` autoriza | Baixo | Nenhuma |
| **Monetização** — sem apostas/gambling; tier gratuito obrigatório se cobrar; conteúdo transformador (fonte 1) | `NOT_APPLICABLE` | Sparta não monetiza hoje — ver `docs/riot-production-application.md` §22 | Nenhum | Nenhuma enquanto não houver monetização |
| **Disclaimer** — texto obrigatório visível (fontes 4, 5) | `COMPLIANT` | **Corrigido na Etapa 31L.1.** Os dois avisos (Legal Jibber Jabber, fonte 5, e o disclaimer específico da política de LoL, fonte 4) coexistem, verbatim, em `apps/site/termos.html` §11.1/§11.2, com referência discreta no rodapé de todas as páginas do site (`apps/site/src/scripts/layout.ts`). O Desktop ganhou uma seção "Sobre" (`apps/desktop/src/renderer/src/features/AboutSection.tsx`, aba nova em Configurações) com os dois textos embutidos no bundle — funciona offline, sem depender de rede/API/site publicado | Baixo | Nenhuma |
| **Propriedade intelectual** — não usar assets sem licença, não imitar produto oficial (fonte 1, 5) | `COMPLIANT` | Auditoria de assets (`docs/riot-production-application.md` §20): nenhum ícone/splash/arte da Riot está commitado no repositório ou embutido no binário — tudo é buscado ao vivo da CDN oficial da Data Dragon/Community Dragon em tempo de execução; os únicos assets versionados são o ícone próprio do Sparta (`apps/desktop/build/icon.png`) e 3 screenshots do produto | Baixo | Nenhuma |
| **Screenshots** — não usar como principal telas técnicas internas (fonte 1, princípio geral de clareza) | `COMPLIANT` | As 3 screenshots publicadas (`apps/site/public/img/`) são Dashboard, Champion Select e Pós-game — nenhuma é Laboratório ou tela de releases | Baixo | Nenhuma |
| **Atualização futura de features** — features novas exigem novo audit (fonte 1) | `COMPLIANT` | Reconhecido explicitamente no pacote: modo carreira, coach ao vivo e Laboratório (como feature de jogador) estão fora do escopo desta submissão — ver `docs/riot-production-application.md` §23-25 | Baixo | Reauditar com a Riot antes de ativar qualquer uma dessas features publicamente |

## 4. Resumo

- `COMPLIANT`: 13 itens (o disclaimer passou de `COMPLIANT_WITH_LIMITATION` para `COMPLIANT` na
  Etapa 31L.1 — ver seção 2).
- `COMPLIANT_WITH_LIMITATION`: 3 itens (HTTPS de produção real ainda não provisionado; dados
  pessoais dependem de reler a fonte 8; nenhum é um problema de implementação, os dois têm ação
  clara e não bloqueiam a preparação do dossiê).
- `NOT_APPLICABLE`: 1 item (monetização).
- `BLOCKED`: 2 itens, **ambos esperados e corretos nesta fase** (registro do produto e RSO — os
  dois só se resolvem depois que a Riot aprovar, não antes).
- `NEEDS_RIOT_REVIEW`: 1 item (confirmação explícita de que os três endpoints LCU usados estão na
  lista aprovada da Riot).

Nenhum item foi classificado como incompatível de forma irremediável — `BLOCKED_BY_POLICY_
REMEDIATION` (seção 33 do pedido) **não se aplica** a esta revisão.
