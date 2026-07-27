---
status: IMPLEMENTADA
solicitado_em: 2026-07-26 16:05
implementado_em: 2026-07-26 17:30
---

# Posição desconhecida não pode virar MID

## Pedido original

> # ETAPA 6 — Posição desconhecida não pode virar MID
>
> ## Contexto
>
> A auditoria identificou fallbacks que transformam posição ausente ou desconhecida em `MID`,
> especialmente no fluxo do desktop e do Champion Select. Isso pode fazer o Sparta consultar
> estatísticas da posição errada, montar o pool de candidatos errado, aplicar pesos de scoring
> incorretos, interpretar o matchup errado, recomendar campeões de MID sem a posição ter sido
> identificada, e gerar futuramente um pré-game baseado em premissa falsa. Ausência de posição
> não é evidência de que o jogador está no MID.
>
> ## Objetivo
>
> Representar posição desconhecida explicitamente em todo o fluxo (LCU, estado do draft,
> desktop, requisição da API, motor de recomendação, interface). Sem posição: não usar `MID`
> como fallback; não gerar recomendações com pool ou pesos de MID; não inventar matchup de lane;
> não preencher métricas dependentes de posição; informar ao usuário; permitir seleção manual só
> no fluxo manual/simulação.
>
> ## Auditoria obrigatória
>
> Localizar todos os pontos onde `MID` é usado como padrão, posição ausente recebe fallback,
> strings do LCU viram roles, `DraftState.playerRole` é criado/atualizado, a API valida a
> posição, estatísticas são filtradas por posição, o pool é montado, pesos por role são
> selecionados, o Champion Select decide buscar recomendações, e a interface exibe a posição.
> Registrar pontos encontrados, fallback aplicado, comportamento novo e consumidores adaptados.
>
> ## Contrato de posição
>
> Escolher uma representação central e única para ausência (`playerRole?: Role`,
> `Role | null` ou `Role | "UNKNOWN"`), coerente com o domínio atual, sem várias representações
> concorrentes. A ausência precisa ser distinguível de MID real detectado pelo LCU, MID
> selecionado manualmente e MID observado em partida histórica.
>
> ## Proveniência da posição
>
> Distinguir, quando aplicável: detectada pelo LCU, selecionada manualmente, observada no
> histórico Match-V5, indisponível. Se o contrato atual não tiver origem adequada para entrada
> manual, fazer a menor extensão coerente (ex.: `USER_PROVIDED`) e documentar. Não classificar
> escolha manual como dado oficial ou observado; não transformar posição inferida em detectada.
>
> ## Mapeamento do LCU
>
> Validar TOP, JUNGLE, MIDDLE→MID, BOTTOM→ADC, UTILITY→SUPPORT, UNSELECTED, UNKNOWN, string
> vazia e campo ausente. Valores ausentes, não reconhecidos, `UNSELECTED` ou `UNKNOWN` produzem
> posição indisponível. Não mapear desconhecido para MID; não interpretar ordem de pick ou
> campeão selecionado como posição.
>
> ## Fluxo automático pelo LCU
>
> Com posição: atualizar o draft, buscar recomendações, identificar origem como LCU observado,
> reagir a troca real. Sem posição: não buscar recomendações dependentes de posição; não
> preservar silenciosamente posição antiga de outra sessão; mostrar estado de espera; informar
> "Aguardando o League Client identificar sua posição". Se a posição sumir na mesma sessão: não
> assumir que continua igual; avaliar o estado real; evitar piscar por ticks transitórios apenas
> com evidência de payload temporariamente incompleto; qualquer retenção precisa de prazo curto,
> regra explícita e teste; não criar fallback permanente. Não implementar heurística complexa
> sem necessidade.
>
> ## Fluxo manual e simulação
>
> O usuário pode selecionar a posição explicitamente; nenhuma vem pré-selecionada como MID sem
> ação; a seleção é marcada como fornecida pelo usuário; recomendações só depois de posição
> válida. Ao sair do modo manual ou iniciar nova sessão, não carregar seleção manual antiga como
> se fosse detectada pelo LCU.
>
> ## Estado do draft
>
> `DraftState` deve suportar posição ausente honestamente. Sem posição: não chamar scoring
> dependente de role, não montar pool, não selecionar pesos, não calcular matchup por posição,
> não classificar como MID, não inserir role falsa em requests/snapshots/logs. Não substituir a
> ausência por role "neutra".
>
> ## API
>
> Proteger a rota de recomendações contra chamadas sem posição válida, com status adequado
> (`422`), código estável (`PLAYER_ROLE_UNAVAILABLE`), mensagem clara em português, sem stack
> trace. O desktop normalmente impede antes, mas a API não pode aceitar ausência e usar MID
> internamente. Não alterar contratos de autenticação nem outras rotas.
>
> ## Pool de candidatos e scoring
>
> Sem posição: não retornar candidatos de todas as posições, não usar histórico de MID, não
> selecionar pesos de MID, não gerar score parcial aparentemente válido, não retornar
> recomendações vazias sem explicar. Com posição válida: fluxo retomado automaticamente, apenas
> a posição correta, troca invalida resultados antigos, recomendações da posição anterior não
> permanecem visíveis. Não alterar quantidade de recomendações, fórmulas, pesos, thresholds,
> ordenação, matchup pessoal, meta indisponível nem participação em objetivos.
>
> ## Interface
>
> Sem posição na Champion Select: estado vazio/espera claro, sem cards de MID, sem métricas
> antigas como atuais, sem erro técnico, sem loading infinito, seleção manual só no fluxo
> apropriado. Textos sugeridos: "Posição ainda não identificada" / "Aguardando o League Client
> informar sua função. No modo manual, selecione uma posição para receber recomendações." Ao
> detectar: atualizar indicador, carregar recomendações, remover espera. Ao mudar: só as
> recalculadas. Manter o design system, não redesenhar a tela.
>
> ## Compatibilidade entre versões
>
> API antiga: o desktop atual não deve enviar requisição sem posição; centralizar a proteção
> antes da chamada. Desktop antigo enviando MID artificial: a API não tem como distinguir;
> não criar heurística frágil, documentar a limitação e garantir que a versão atual não produza
> mais o problema. Não espalhar verificação de versão pelos componentes.
>
> ## Sessões e estado obsoleto
>
> Nova sessão começa sem posição herdada; encerrar limpa a posição observada; reentrar consulta
> o estado atual do LCU; trocar entre real e manual não mistura proveniências; resultados
> assíncronos da posição anterior não sobrescrevem a nova; resposta atrasada não restaura
> recomendações obsoletas. Usar cancelamento, identificador de requisição ou validação de
> contexto conforme o padrão existente.
>
> ## Fora do escopo
>
> Pré-game real; matchup global; Meta Intelligence; Patch Intelligence; API nova; builds ou
> runas; elegibilidade global de posição por campeão; derivar role de classes do Data Dragon;
> usar as poucas partidas do usuário como definição global de role; `ChampionTag`; recalibrar
> scoring; alterar o pool além de impedir execução sem role; cinco recomendações; composição ou
> sinergia; persistir drafts; alterar participação em objetivos; criar posição fictícia para
> testes operacionais.
>
> ## Testes mínimos
>
> 30 casos: mapeamento LCU (MIDDLE/BOTTOM/UTILITY/TOP/JUNGLE corretos; UNSELECTED, UNKNOWN,
> string vazia, campo ausente e valor não reconhecido produzem ausência, nunca MID); draft
> aceita posição ausente; sem posição o motor não roda, o pool não vira MID e a API devolve erro
> estruturado; desktop não chama a API sem posição; interface mostra espera e não mostra
> recomendações antigas; seleção manual válida libera a busca, não é marcada como LCU e não
> começa em MID; posição detectada libera; troca invalida resultados anteriores; resposta
> atrasada da posição anterior é ignorada; encerramento limpa; reentrada consulta o estado atual;
> API antiga não recebe request sem posição; MID real continua funcionando; matchup pessoal,
> meta global e participação em objetivos permanecem inalterados; nenhum consumidor quebra.
>
> ## Validação real
>
> No Electron real, sem League Client ou fora do Champion Select: nenhuma recomendação de MID por
> padrão, estado de indisponibilidade exibido, modo manual permite selecionar, nada
> pré-marcado. Modo manual: selecionar cada posição busca o pool correto, trocar remove
> resultados anteriores, nenhum resultado atrasado sobrescreve. LCU real, se disponível:
> detecção inicial, troca de posição, limpeza ao terminar. Caso o League Client não esteja
> disponível, registrar a limitação; não injetar sessão operacional sintética.

## Notas de implementação

### Auditoria: pontos encontrados

| Local | Fallback aplicado | Comportamento novo |
|---|---|---|
| `App.tsx:45` | `playerRole: "MID"` no estado inicial do draft | `undefined` - o app abre sem posição |
| `App.tsx:189` | `role: member.position ?? "MID"` em aliado/inimigo do LCU | `member.position` (campo agora opcional) |
| `ChampionSelectScreen.tsx:117` | `role: "MID"` no inimigo escolhido à mão | campo omitido |
| `match-mapper.ts:104` | `TEAM_POSITION_TO_ROLE[...] ?? "MID"` no histórico Match-V5 | posição ausente; a persistência descarta a linha |
| `player-role.ts` | `Record<string, Role>` fazia o TS crer que sempre havia retorno | `Partial<Record<...>>` + `toRole` rejeitando `unselected`/`unknown`/vazio |
| `schemas.ts` | `playerRole: roleSchema` obrigatório - o cliente **tinha** que mandar algo | opcional no schema, barrado na rota com 422 |
| `recommendation-engine.ts` | rodava com qualquer role recebida | guarda no topo: sem posição devolve `[]` |
| `ChampionSelectScreen` (seletor) | `<Select>` sem valor vazio ⇒ o navegador pré-seleciona a 1ª opção | opção `"Selecione..."` explícita, valor inicial `""` |
| `PreGameScreen` | `roleLabels[draft.playerRole]` indexava direto | texto sem posição quando ausente |

**Não alterados** (usos legítimos): `roleSchema` como enum das 5 posições, `ROLES` em
`labels.ts`, `POSITION_TO_ROLE.middle → MID`, `TEAM_POSITION_TO_ROLE.MIDDLE → MID` e os
cenários de teste explicitamente configurados como MID.

### Consumidores adaptados

`persistMatchParticipants` passou a descartar participante sem posição (mesma regra já usada
pra campeão fora do catálogo - a linha existiria sem conseguir dizer a que posição pertence, e
`MatchParticipant.role` alimenta as estatísticas por posição). `riot-sync-service` só empurra
`touchedPairs` quando há posição. `labels.ts` ganhou o rótulo de `USER_PROVIDED`.

### Representação escolhida

`playerRole?: Role` (opcional), não `null` nem `"UNKNOWN"`: o domínio já usa ausência opcional
pro que não se aplica desde a Etapa 4, e um literal `"UNKNOWN"` poderia vazar pra dentro de um
`Record<Role, ...>` e ser indexado como se fosse posição. `playerRoleSource?: "LCU" | "USER"`
distingue detecção de escolha manual; `ProvenanceSourceType` ganhou `USER_PROVIDED`.

### Proteções contra estado obsoleto

- Sair do champion select limpa a posição de origem `LCU`; escolha `USER` não é apagada por um
  tick sem posição do cliente.
- Troca de posição **descarta os cards anteriores antes** de exibir os novos: o `useAsyncData`
  preserva o último `data` durante o loading (pra evitar flicker), o que aqui significaria
  mostrar as recomendações do papel antigo como se fossem atuais.
- Resposta atrasada da posição anterior é ignorada pelo `cancelled` do hook.

### Testes

29 automatizados novos (326 no total): mapeamento do LCU (5 valores válidos, variações de
caixa, e `unselected`/`unknown`/vazio/só-espaços/valor novo/campo ausente todos produzindo
ausência); motor sem posição não monta pool nem devolve candidatos de MID; MID real e outras
posições continuam funcionando; API 422 estruturado sem consultar estatísticas; aliado sem
posição aceito; cliente barra antes de enviar; interface mostra espera, não pré-seleciona nada,
não exibe recomendações antigas, marca a escolha como `USER` e limpa origem ao voltar pra vazio.

### Validação real

API real: `POST /drafts/recommendations` sem posição devolveu
`{"code":"PLAYER_ROLE_UNAVAILABLE"}` com **HTTP 422**; com `JUNGLE` devolveu Viego normalmente.

Electron real (CDP, Zekerus#117), modo manual: seletor abrindo **vazio** (`value: ""`, opções
`["", TOP, JUNGLE, MID, ADC, SUPPORT]`), estado "Posição ainda não identificada" visível, **0
cards**. Selecionar JUNGLE → espera some, 1 card (Viego). Trocar pra MID → **0 cards, Viego
some** (nenhum resultado da posição anterior permanece). Voltar pra vazio → estado de espera de
novo. Nenhum `NaN`/`Infinity`/`undefined`.

### Limitações

- **LCU real não validado**: a detecção de `assignedPosition` numa sessão de champion select de
  verdade exige o cliente do League aberto, indisponível neste ambiente. Coberto por teste com
  fixture. Mesmo limite das Fases 6c, 11 e 16.
- **Desktop anterior a esta etapa**: continua enviando `playerRole: "MID"` mesmo sem posição, e
  a API não tem como distinguir isso de uma escolha real. Nenhuma heurística foi criada;
  a limitação está documentada e a versão atual não produz mais o problema.
- **Nenhuma partida real com `teamPosition` vazio**: as 22 do banco têm posição nos 220
  participantes, então o descarte no mapper não foi observado em dado real.
