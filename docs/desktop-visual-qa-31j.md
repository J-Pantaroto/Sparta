# Etapa 31J — QA visual integrado e acabamento final do Desktop

QA visual de acabamento sobre o app inteiro, com validação real no Electron via Chrome DevTools
Protocol (CDP) — não em aba de navegador comum. Nenhuma funcionalidade nova; nenhuma lógica de
domínio ou motor foi alterada. As três correções aplicadas são bugs de apresentação reais, achados
durante a própria validação, cada uma com teste automatizado.

## Metodologia de validação

Diferente de etapas anteriores (Etapa 31I registrou explicitamente que não conseguiu validar
visualmente no Electron real, por causa do bootstrap de sessão da Etapa 31D exigir o bridge de
preload), esta sessão conectou de fato ao processo Electron real:

1. `app.commandLine.appendSwitch("remote-debugging-port", "9222")` adicionado **temporariamente**
   em `main/index.ts`, revertido antes do commit (diff líquido zero, confirmado via `git diff`).
2. `electron-vite dev` iniciado em background; conexão via WebSocket (pacote `ws`, já presente no
   store do pnpm por dependência transitiva) ao target `page` exposto em
   `http://localhost:9222/json/list`.
3. Sessão real autenticada: um token HMAC assinado com o mesmo `AUTH_TOKEN_SECRET` do container
   Docker foi injetado via `window.sparta.session.set(token)` (a mesma API IPC que a tela de login
   usa), seguido de reload — sem senha real, mas também sem bypass: é o mesmo mecanismo de sessão
   protegida por `safeStorage` que o app usa de verdade, só preenchido programaticamente em vez de
   por formulário.
4. Navegação, clique, teclado e redimensionamento de viewport via `Runtime.evaluate`,
   `Input.dispatchKeyEvent` e `Emulation.setDeviceMetricsOverride`; console/exceções/rede
   capturados ao vivo via `Runtime.consoleAPICalled`/`Runtime.exceptionThrown`/
   `Network.responseReceived`.
5. Conta real Zekerus#117, mesmo Postgres/API usados pela Etapa 31I (containers nunca reiniciados
   entre as duas sessões — a release ativa e os hashes são os mesmos por construção, não por
   verificação isolada).

## Telas validadas (matriz representativa)

Por instrução explícita da etapa, a matriz não precisa ser cartesiana completa — larguras/temas/
densidades foram cruzados o suficiente para provar consistência sem repetir combinações
redundantes.

| Tela | 1280px | 1000px | 1600px | Tema/densidade | Estado aberto |
| --- | --- | --- | --- | --- | --- |
| Dashboard | ✅ | ✅ | ✅ | Espartano/Obsidiana/Adaptativo, compacta, reduzida | — |
| Perfil | ✅ | ✅ | ✅ | — | — |
| Champion Select | ✅ | — | — | — | "Simular manualmente", posição Jungle |
| Histórico de drafts | ✅ | ✅ | ✅ | — | Detalhe completo de uma sessão real |
| Pré-game | ✅ | — | — | — | Estado vazio ("nenhum campeão confirmado") |
| Partidas e pós-game | ✅ | ✅ | ✅ | — | Detalhe completo de uma partida real |
| Evolução pessoal | ✅ | — | — | — | — |
| Histórico do motor (agregado) | ✅ | — | — | — | Estado vazio honesto (0 drafts ligados a Match-V5) |
| Laboratório | ✅ | ✅ | ✅ | — | Candidatas, experimento, releases |
| Configurações | ✅ | — | — | Usada para aplicar os 3 eixos de tema | — |
| Conta e segurança | ✅ | — | — | — | — |

Larguras testadas: **1000px, 1280px, 1600px** — zero overflow estrutural
(`document.documentElement.scrollWidth > clientWidth`) em qualquer combinação testada.

Temas: **Espartano, Obsidiana, Adaptativo** — todos aplicados via a tela real de Configurações
(clique real, não injeção), confirmados pelo `data-sparta-theme` do `<html>`. Densidade
(confortável/compacta) e intensidade visual (exibir/reduzir arte) testadas em conjunto
(Obsidiana + compacta + reduzida simultâneas) sobre o Dashboard — zero overflow, hero sem imagem
de fundo no modo reduzido (conteúdo permanece íntegro, como documentado), contraste mantido.

Escalas do Windows (100/125/150%) **não foram emuladas via SO real** — aproximadas pela redução
proporcional da viewport (mesma técnica que testar 1000px já cobre o efeito prático de uma escala
maior: menos espaço disponível). Não há acesso a alterar a escala de exibição do Windows dentro
deste ambiente de validação.

## Bugs reais encontrados e corrigidos

Todos encontrados pela própria validação (não hipotéticos), cada um com teste automatizado novo.

### 1. `<button>` aninhado em `CalibrationLabScreen.tsx` (lista de candidatas)

**Sintoma real**: dois erros de console (`In HTML, %s cannot be a descendant of <%s>` /
`<%s> cannot contain a nested %s`) ao abrir "Laboratório" — React alertando hydration mismatch.
**Causa**: a Etapa 31I colocou `<HashChip>` (que renderiza os próprios `<button>` de
expandir/copiar) dentro do `<button>` de seleção de cada candidata salva — HTML não permite
`<button>` dentro de `<button>`.
**Correção**: o `<li>` virou o contêiner flex; o botão de seleção cobre só nome+status, e o
`HashChip` é irmão dele, fora do botão. CSS `.sp-calib-list button` (que sem querer também
estilizava os botões de ação da lista de releases, mais abaixo na mesma tela) foi trocado por
`.sp-calib-list > li > button`, escopo correto.
**Teste**: já coberto pelos testes existentes de `CalibrationLabScreen.test.tsx`, que passaram a
exercitar o novo markup.

### 2. Badge "ATIVA" contradizendo o rótulo de status ao lado, na lista de releases

**Sintoma real**: a release efetivamente ativa (`currentlyActive: true`) mostrava o badge verde
"ATIVA" **e**, ao lado, o texto "Ativa (não é a atual)" — o próprio rótulo dizia o oposto do
badge.
**Causa**: `RELEASE_STATUS_LABELS.ACTIVE` foi escrito pensando só no caso de uma release
_superada_ (status ainda `ACTIVE` no banco, mas o ponteiro já aponta para outra — comportamento
documentado desde a Etapa 27b), sem considerar que a mesma string era usada também quando a
release **é** a atual.
**Correção**: nova função `releaseStatusLabel(release)` decide o texto olhando
`currentlyActive` — mostra "Ativa" quando é a atual, "Ativa (não é a atual)" só quando não é.
**Teste**: `CalibrationLabScreen.test.tsx` ganhou uma asserção no teste existente (garante que a
frase contraditória nunca aparece na release ativa) e um teste novo dedicado ao caso da release
superada (garante que o texto correto aparece **sem** o badge ATIVA).

### 3. Campo "Novo email" pré-preenchido com o e-mail atual, sem máscara

**Sintoma real**: em "Conta e segurança", o campo para digitar o **novo** e-mail já vinha
preenchido com o e-mail **atual** completo e sem máscara — visualmente parecia um valor já
digitado, ao lado do campo "Email" (acima) que mostra o mesmo e-mail corretamente mascarado.
**Causa**: `AccountScreen.tsx` inicializava `useState(user.email ?? "")`.
**Correção**: estado inicial vazio (`useState("")`) mais um `placeholder` explicativo
("novo-email@exemplo.com"), usando o suporte a `placeholder` que `TextField` já tinha.
**Teste**: `AccountScreen.test.tsx` (novo arquivo) confirma que o campo começa vazio e nunca
contém o e-mail atual do usuário.

## Problemas observados e conscientemente mantidos (não são bugs críticos)

- **Quebra de linha em 1000px** na lista de "Histórico de drafts": a linha
  "Jungle · 07/08/2026, 03:11:14" quebra em até três linhas na largura mais estreita suportada.
  Não há overflow nem corte de conteúdo — só densidade maior. Não corrigido: seria redesign de
  layout (mudar o grid de colunas) para um ganho cosmético, fora do "acabamento" desta etapa.
- **Objetivo bruto "HORDE" na timeline do pós-game**: o rótulo vem direto do tipo de evento do
  Match-V5 sem tradução adicional (ao lado de "DRAGON"/"RIFTHERALD"/"TOWER_BUILDING", também
  crus). Consistente com o princípio de "só fatos preservados pela partida, sem interpretação" já
  documentado para esta seção — não alterado, para não reescrever terminologia que pertence à
  fonte de dado, e por já estar fora do escopo desta etapa tocar nomenclatura de eventos.

## Estados globais

Loading/skeleton, vazio e erro foram observados organicamente durante a navegação real (não havia
como forçar "offline"/"API indisponível" sem desligar o container, o que destruiria a sessão de
validação em andamento):

- **Vazio honesto**: Pré-game sem campeão confirmado, Histórico do motor (agregado) sem nenhum
  draft ligado a uma partida Match-V5 real — os dois com texto explicando o motivo, não um
  espaço em branco.
- **Dados desatualizados**: banner amarelo no Dashboard/Perfil, com ação de sincronizar — mesmo
  padrão nos dois lugares.
- **Estados League fechado / sem sessão real**: Champion Select mostra "League não detectado" com
  o botão "Simular manualmente", preservando o fluxo de teste sem cliente aberto.

## Acessibilidade

Navegação real por teclado (`Input.dispatchKeyEvent` com `Tab`, não `element.focus()` via JS, que
não dispara `:focus-visible` no Chromium): 14 tabs seguidos a partir do body percorreram, em
ordem lógica, o botão de recolher sidebar → os 11 itens de navegação → o skip-link
"Ir para o conteúdo" (`href="#sp-main-content"`, oculto até receber foco, desliza para dentro da
viewport) → o botão de atualizar dados da topbar. Foco nunca desapareceu, nunca ficou preso, e
tinha indicador visível em todo elemento (anel de 2px na cor do tema, exceto o skip-link, que usa
o próprio surgimento/background sólido como indicador — padrão comum para esse tipo de elemento).

## Console e rede

Ao longo de toda a navegação (11 telas, 3 temas, 2 densidades, 2 intensidades, 3 larguras, o fluxo
manual do Champion Select, abertura de detalhe em Histórico de drafts e em Pós-game, teclado): 0
erros de console além dos 2 que motivaram a correção #1 (já eliminados e reconfirmados em 0), 0
exceções não tratadas, 0 imagem quebrada observada, 0 `NaN`/`Infinity`/`undefined` renderizado nas
telas inspecionadas. Nenhum 401 silencioso encontrado (todas as chamadas autenticadas usaram o
token corretamente) — o padrão de bug da Etapa 31H (rotas endurecidas para `OWN_RESOURCE` sem o
cliente mandar `Authorization`) não reapareceu.

## Performance perceptiva

Nenhum flicker, layout shift ou re-render perceptível identificado durante navegação normal entre
telas, troca de tema/densidade/intensidade ou abertura/fechamento de detalhes em lista. Não foi
necessário introduzir memoização, virtualização ou qualquer otimização — nada mediu problema real.

## Não regressão

Confirmado contra o mesmo Postgres/API real da Etapa 31I (containers não reiniciados entre as duas
sessões):

- `release-etapa27c-v1` `ACTIVE`, `artifactHash` (`8878a657…`) e `configHash` (`fa9dbde1…`)
  **idênticos** aos registrados antes desta etapa.
- Recomendação controlada de sempre (JUNGLE, pick 3, Ahri aliada, Lee Sin inimigo, bans 55/91) →
  **5 candidatos idênticos**: Viego 58.7/0.9, Udyr 58.5/0.5, Vi 55.3/0.5, Nocturne 53.3/0.5,
  Graves 50.1/0.5.
- Snapshot novo persistido e verificado: `POST /recommendation-snapshots/:id/verify-replay` →
  **`EXACT_REPLAY`, 0 divergências**.
- `prisma migrate deploy` → **zero migrations pendentes** (etapa não tocou schema nenhum;
  `apps/api` não teve nenhum arquivo alterado nesta sessão).

## Testes e verificação completa

- `pnpm version:check` → versão consistente em 8 lugares.
- `pnpm typecheck` / `pnpm lint` / `pnpm build` → limpos nos quatro pacotes TypeScript.
- **1230 testes** no monorepo (core 635, riot 97, api 353, desktop 129, raiz 15, analyzer 1) — 4
  novos desta etapa (1 em `AccountScreen.test.tsx`, mais 1 asserção e 1 teste novo em
  `CalibrationLabScreen.test.tsx`, já cobrindo a correção #1 pela reexecução dos testes
  existentes sem alteração de asserção).
- `apps/api` isolado: **1 flakiness reproduzida** (`/docs existe em desenvolvimento`, timeout) na
  primeira execução, **353/353 na reexecução imediata**, sem nenhuma alteração de código —
  mesmo padrão de contenção de recursos já documentado desde a Etapa 26b. Não mascarado: registrado
  aqui como aconteceu.
- `pnpm --filter @sparta/desktop package:dir` (electron-builder, sem publicar) → empacotado com
  sucesso em `dist-installer/win-unpacked/Sparta.exe`, confirmando que o pipeline de build
  produz um app funcional com o `main/index.ts` já revertido (diff líquido zero no arquivo).

## Fora desta etapa

Nenhuma métrica, ranking, recomendação, integração Riot nova. Nenhum modo carreira, coach, dado
global, infraestrutura, serviço de e-mail ou site. Nenhuma tela foi redesenhada por completo —
só acabamento (CSS, estrutura HTML inválida, um rótulo contraditório, um campo mal inicializado).
