# Checklist bloqueante, revisão contraditória e revisão técnica final (Etapa 31L)

Companheiros deste documento: `docs/riot-policy-compliance-matrix.md`,
`docs/riot-production-application.md`, `docs/riot-api-inventory.md`.

## 32. Checklist antes de Submit

Enquanto qualquer item obrigatório abaixo estiver ausente: **`DO_NOT_SUBMIT`**.

- [ ] domínio controlado (`spartagg.com.br` registrado — Etapa 31K, `BLOCKED_BY_OWNER_
      INFRASTRUCTURE_PROVISIONING`)
- [ ] site HTTPS público (conteúdo pronto em `apps/site/`, infraestrutura pronta em `infra/`,
      nada publicado ainda)
- [ ] Privacy pública (conteúdo pronto em `apps/site/privacidade.html`, não publicado)
- [ ] Terms públicos (conteúdo pronto em `apps/site/termos.html`, não publicado)
- [ ] disclaimer Riot visível — **parcialmente pendente**: falta o segundo texto (política
      específica de LoL) no site e falta qualquer disclaimer no Desktop (ver §19 do dossiê e
      matriz de conformidade §2)
- [ ] suporte funcional (`suporte@spartagg.com.br` precisa existir e receber e-mail de verdade
      antes de ser publicado — Etapa 31K)
- [ ] fluxo de exclusão público (conteúdo pronto em `apps/site/excluir-conta.html`, endpoint
      público real ainda não existe — depende da API pública, hoje desativada)
- [x] screenshots sanitizados (3 imagens confirmadas nesta etapa, sem PII/token/hash visível —
      ver §15 do dossiê)
- [ ] `riot.txt` suportado (arquitetura pronta — Caddy serve estático da raiz —, mas o arquivo só
      pode existir depois que a Riot fornecer o valor exato, e o site só existe depois de
      publicado)
- [x] site corresponde ao produto submetido (conferido nesta etapa: as 8 funcionalidades reais
      listadas em `apps/site/funcionalidades.html` batem com o que está descrito no dossiê; modo
      carreira/coach/Laboratório continuam fora de ambos)
- [x] descrição final revisada (`docs/riot-production-application.md` §4/§5, escrita e revisada
      nesta etapa)
- [x] API inventory revisado (`docs/riot-api-inventory.md`, escrito nesta etapa a partir de
      auditoria direta do código, não de memória do projeto)
- [x] nenhum secret no Desktop (confirmado nesta etapa: `RIOT_API_KEY` só existe em `apps/api`,
      busca em todo o repositório)
- [x] nenhuma feature proibida anunciada (modo carreira, coach ao vivo e Laboratório-como-feature
      confirmados ausentes do site e do dossiê — ver §23-25 do dossiê)
- [ ] owner fez revisão final (pendente — este documento é a entrega para essa revisão)

**Itens obrigatórios ainda ausentes**: domínio, site publicado, Privacy/Terms publicados,
disclaimer completo, suporte funcional, fluxo de exclusão público, `riot.txt`, revisão final do
responsável. **Estado: `DO_NOT_SUBMIT`.**

## 33. Revisão contraditória (perspectiva de um auditor Riot)

Releitura de toda a linguagem do produto e do site procurando especificamente os termos de risco
listados no pedido desta etapa.

| Termo de risco | Encontrado? | Onde | Contexto |
| --- | --- | --- | --- |
| "recommendation" parecendo prescrição | Não | — | Toda ocorrência de "recomendação" no produto vem sempre acompanhada de razões/alertas e nunca aparece como imperativo ("escolha X"); auditado via grep, sem ocorrência de linguagem imperativa |
| "best champion" / "melhor campeão" | Não | — | Grep específico sem ocorrência em `apps/desktop/src/renderer` nem em `apps/site` |
| "counter" | Não | — | Grep de `\bcounter\b` sem nenhuma ocorrência em todo o renderer do Desktop |
| "win probability" / "chance de vitória" | Sim, mas só em **negação explícita** | `PostGameScreen.tsx`, `PreGameScreen.tsx` e seus testes | Toda ocorrência é do tipo "não é... chance de vitória" — o produto nega ativamente essa interpretação, não a afirma |
| "real-time coaching" / coach ao vivo | Não | — | Não existe no código nem na comunicação pública; fora de escopo por decisão (§24) |
| "hidden information" / informação oculta | Não | — | Nenhum dado de cooldown, spell inimigo não revelado ou informação futura é lido em nenhum módulo (confirmado por auditoria do cliente LCU e do motor) |
| "automatic" / automático | Sim, mas só descrevendo **detecção**, nunca **ação** | Ex.: "ordem de pick automática via LCU", "detecção automática de posição" | Em todos os casos, "automático" descreve o Sparta *lendo* um estado que já existe no cliente — nunca uma ação que o Sparta *executa* no cliente. Recomendado, mesmo assim, revisar essa palavra caso a caso antes da tradução final para o Developer Portal, para eliminar qualquer ambiguidade na leitura rápida de um avaliador |
| "global meta" / meta global | Sim, mas só em **negação explícita** | `docs/adr/0002-global-meta-source.md`, dossiê §9 | Sempre no sentido de "isso não existe/não está disponível", nunca alegado como recurso |
| "MMR" / "ELO" | Não como calculadora alternativa | — | O produto exibe "Elo indisponível" (ausência honesta), nunca calcula ou estima um valor substituto |
| "AI decides" / "IA que decide por você" | Sim, mas só em **negação explícita** | `apps/site/index.html`: "não uma inteligência que decide por você" | Negação ativa, consistente com a política |

**Correção de linguagem necessária antes do envio**: nenhuma. Toda ocorrência de termo sensível
encontrada no produto e no site já está em posição de **negação explícita** do comportamento
proibido, não de afirmação dele. A única recomendação é de cuidado editorial (não funcional): ao
traduzir a descrição final para o campo do Developer Portal, evitar a palavra "automatic" sem
qualificador próximo ("read-only", "detection", "no action taken"), para que um avaliador lendo
rapidamente não precise inferir o contexto — isso já foi aplicado nas descrições em inglês do
dossiê (§4/§5), que sempre qualificam "automation" como ausente.

**Nenhum comportamento incompatível foi encontrado no código.** `BLOCKED_BY_POLICY_REMEDIATION`
**não se aplica**.

## 34. Revisão técnica final

Auditorias executadas nesta etapa, com evidência direta no código (não memória de etapas
anteriores):

- **audit secrets**: busca por `RIOT_API_KEY` em todo o repositório → só em `apps/api/src/config/
  env.ts`, `apps/api/src/config/env.test.ts`, `apps/api/src/modules/players/routes.ts`,
  `apps/api/src/modules/riot-integration/client-factory.ts`, `apps/api/src/modules/auth/
  email-provider.test.ts` (nenhum em `apps/desktop`).
- **audit Riot API usage**: `packages/riot/src/clients/riot-api-client.ts` só implementa
  Account-V1 e Match-V5, conforme `docs/riot-api-inventory.md` §29 — nenhum endpoint fora do
  inventário.
- **audit LCU writes**: único método HTTP usado em `packages/riot/src/lcu/read-only-client.ts` é
  `"GET"` — confirmado por busca textual no arquivo inteiro, um único resultado.
- **audit public claims**: revisão contraditória completa em §33 — nenhuma alegação incompatível.
- **audit assets**: `docs/riot-production-application.md` §20 — nenhum asset da Riot commitado ou
  embutido no binário.
- **audit authentication**: `scrypt` + HMAC-SHA256, resumo em `docs/riot-production-application.md`
  §26.
- **audit authorization**: matriz completa já existente em `docs/route-authorization-audit.md`
  (Etapa 31C), toda rota com classe explícita, boot falha sem política.
- **audit RSO gating**: `RSO_REQUIRED` é o único modo aceito em produção; `UNVERIFIED_LEGACY`
  nunca libera rota pessoal em produção — confirmado em `apps/api/src/config/env.ts` e
  `docs/identity-authorization-riot-readiness.md`.

**Zeros confirmados, somente porque verificados no código nesta sessão — não por presunção:**

| Item | Valor confirmado | Como foi confirmado |
| --- | --- | --- |
| LCU write operations | **0** | Busca textual em `packages/riot/src/lcu/read-only-client.ts`: único método HTTP usado é `GET` |
| Automatic champion selection | **0** | Busca por chamadas a `/lol-champ-select/v1/session/actions` (endpoint de escrita do LCU) em todo o repositório: zero ocorrência |
| Automatic lock-in | **0** | Mesma busca acima; nenhum handler IPC do Electron (`apps/desktop/src/main/index.ts`) envia comando ao League Client — os únicos handlers relacionados são leitura (`sparta:lcu-state`) ou fluxo interno do Sparta |
| Hidden enemy information | **0** | Nenhum módulo lê cooldown de habilidade, summoner spell inimigo não revelado ou qualquer campo do LCU/Match-V5 que representasse informação futura ou oculta ao jogador no momento |
| Win-probability claims | **0** | Toda ocorrência de "chance de vitória"/"win probability" no código é uma negação explícita (`PostGameScreen.tsx`, `PreGameScreen.tsx`) |
| MMR/ELO alternative | **0** | Produto exibe "Elo indisponível"; nenhuma fórmula de cálculo de MMR/ELO existe em `packages/core` |

## 35. Não regressão

Confirmado antes de fechar esta etapa: **nenhum arquivo de motor, ranking, scores, pesos,
snapshots, replay, releases, perfil, Champion Select ou pós-game foi alterado** — esta etapa é
inteiramente documental (`git status` mostra somente 4 arquivos novos em `docs/`, nenhuma
modificação em `packages/` ou `apps/`).

Verificado diretamente no Postgres real desta sessão (mesmo container já em execução):

- `release-etapa27c-v1` continua `ACTIVE`;
- `artifactHash` = `8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90` (idêntico ao
  documentado desde a Etapa 27c);
- `configHash` = `fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38` (idêntico);
- ponteiro ativo confere (`currently_active: true`);
- zero divergências — não foi necessário gerar recomendação nova nem rodar `verify-replay`, já
  que uma etapa que não toca nenhum arquivo de código não tem como ter afetado o motor; a
  confirmação do ponteiro/hashes no banco é suficiente e mais direta que reexecutar todo o
  pipeline de validação.

Como nenhum código foi tocado, `pnpm typecheck`/`lint`/`test`/`build` não precisam ser reexecutados
para provar ausência de regressão — a prova é a ausência de diff em qualquer arquivo fora de
`docs/`. A última execução completa (Etapa 31K.1) já confirmou 1215 testes verdes nos 5 pacotes.

## 36. Entregáveis desta etapa

- `docs/riot-production-application.md` — descrição canônica, fluxo, Champion Select sob Game
  Integrity, natureza das recomendações, dados globais, pós-game, RSO, inventário de dados,
  arquitetura, API key, screenshots/legendas, URLs planejadas do site, verificação de domínio,
  disclaimer, propriedade intelectual, marca, monetização, exclusões de escopo (carreira/coach/
  Laboratório), segurança/privacidade (resumo), formulário pré-preenchido.
- `docs/riot-policy-compliance-matrix.md` — fontes oficiais revalidadas (com URL/data), matriz de
  conformidade completa, achado sobre os dois disclaimers.
- `docs/riot-api-inventory.md` — inventário exato de APIs por endpoint/propósito/momento/
  server-ou-client-side/obrigatoriedade, estimativa de tráfego modelada, tratamento real de rate
  limit.
- `docs/riot-submission-checklist.md` — este documento.

Nenhum secret foi incluído em nenhum dos quatro documentos (confirmado por revisão de cada um
antes da entrega). Material sanitizado de screenshots já existia da Etapa 31K
(`apps/site/public/img/`), revalidado nesta etapa sem necessidade de nova sanitização.

## 37. Estado final

```text
RIOT_APPLICATION_PACKAGE_READY
BLOCKED_BY_PUBLIC_SITE
BLOCKED_BY_SUPPORT_EMAIL
BLOCKED_BY_OWNER_INFRASTRUCTURE_PROVISIONING
```

O **conteúdo** do pacote de submissão está pronto para revisão final do responsável — descrição,
fluxo, matriz de conformidade, inventário de API e checklist estão completos e auditados contra o
código real e contra as políticas oficiais atuais da Riot. O que falta para poder efetivamente
submeter não é mais trabalho de preparação do dossiê, é a **publicação real** do site
institucional, que por sua vez depende do mesmo bloqueio já registrado na Etapa 31K: domínio, VPS
e e-mail de suporte ainda não foram provisionados pelo responsável.

**Não usados** (ainda não se aplicam): `SUBMITTED_TO_RIOT`, `RIOT_APPROVED`,
`PRODUCTION_KEY_GRANTED`, `RSO_READY`.

**Próximos passos, na ordem correta** (já resumidos ao usuário ao final da Etapa 31K, reafirmados
aqui): o responsável registra `spartagg.com.br`, contrata VPS e e-mail → uma etapa futura retoma
a 31K só para publicação real → validação externa completa do site publicado → adicionar o
disclaimer da política específica de LoL (site) e um disclaimer no Desktop, pendências identificadas
nesta etapa → revisão final do dossiê pelo responsável → só então submissão à Riot.

**Esta etapa não submeteu nada à Riot.**
