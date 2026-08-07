---
status: IMPLEMENTADA
solicitado_em: 2026-08-07 08:15
implementado_em: 2026-08-07 12:10
---

# Etapa 31J — QA visual integrado e acabamento final do Desktop

## Pedido original

> Revisão visual integrada do aplicativo Desktop inteiro, corrigindo exclusivamente problemas de
> consistência, responsividade, hierarquia, espaçamento, tipografia, overflow, estados,
> acessibilidade, acabamento visual e performance perceptiva - sem implementar funcionalidades
> novas nem alterar domínio/motor/contratos sem necessidade estritamente ligada a um bug de
> apresentação. Auditoria inicial (árvore limpa, documentação 31E-31I, mapa de rotas/telas,
> componentes compartilhados, checklist de QA por tela) antes de qualquer refatoração ampla. A
> validação principal deve acontecer no Electron real ou empacotado, nunca numa aba de navegador
> comum - exercitar o fluxo completo (login → onboarding → shell → dashboard → perfil → Champion
> Select → pré-game → partidas → pós-game → Histórico do Motor → Laboratório → conta/
> configurações), com atenção especial ao Histórico do Motor e Laboratório (a Etapa 31I não
> conseguiu validação visual Electron real). Matriz representativa (não cartesiana completa) de
> 1000/1280/1600px, escalas 100/125/150%, temas Espartano/Obsidian/Adaptativo, densidades
> confortável/compacta, intensidade normal/reduzida. Auditoria de shell, dashboard, perfil,
> Champion Select, pré-game, histórico de partidas, pós-game, Histórico do Motor, Laboratório,
> estados globais transversais, sistema visual/tokens, temas, arte de campeão, gráficos,
> responsividade estrutural, conteúdo textual, acessibilidade por teclado, performance
> perceptiva, console/rede (zero erros/exceções/requests duplicadas sem necessidade/401
> silencioso/imagem quebrada/NaN/Infinity/undefined - atenção especial à autenticação de
> requests, já que a Etapa 31H achou quatro chamadas antigas sem Authorization), dados reais e
> autorização (LCU somente leitura, nenhuma ação real no League). Screenshots de QA nas telas
> principais em três resoluções. Correções permitidas: CSS, layout, componentes visuais, labels,
> responsividade, atributos de acessibilidade, auth ausente se achado bug semelhante ao da 31H,
> tratamento de erro, estados visuais, assets quebrados - qualquer correção funcional descoberta
> deve ser mínima, ter teste, e ser documentada como bug, sem alterar lógica do motor. Proibido:
> nova métrica/recomendação/ranking/integração Riot/modo carreira/coach/dados globais/
> infraestrutura/serviço de e-mail/site; não redesenhar telas inteiras por preferência estética -
> etapa de acabamento. Após as correções: testes direcionados, suíte completa, analyzer,
> typecheck, lint, build, package do Electron, fluxo oficial de CI, documentar flakiness
> conhecida de apps/api se reaparecer sem mascarar. Não regressão completa (mesmos candidatos/
> scores/ranking/métricas/linkage/snapshots/experimentos/release; release-etapa27c-v1 ativa,
> artifactHash/configHash inalterados, EXACT_REPLAY, zero divergências). Entregável: relatório de
> QA com telas validadas, resoluções, escalas, temas, problemas encontrados/corrigidos/mantidos
> conscientemente, bugs funcionais descobertos, screenshots, resultado de acessibilidade e
> console/rede, performance perceptiva, testes. Documentação, changelog, feature status, commit,
> push main, CI verde, árvore limpa, HEAD==origin/main. Parar após o acabamento do desktop.

## Notas de implementação

Relatório completo em `docs/desktop-visual-qa-31j.md`. Resumo:

**Metodologia**: primeira etapa deste projeto com validação Electron real via CDP dentro da
própria sessão de implementação (não relatada como limitação). `remote-debugging-port=9222`
adicionado temporariamente em `main/index.ts` (revertido, diff líquido zero), conectado via
WebSocket (pacote `ws` já presente no store do pnpm), login real via
`window.sparta.session.set(token)` com token HMAC assinado pelo mesmo `AUTH_TOKEN_SECRET` do
container Docker, navegação/clique/teclado/viewport via CDP (`Runtime.evaluate`,
`Input.dispatchKeyEvent`, `Emulation.setDeviceMetricsOverride`), console/rede capturados ao vivo.

**11 telas validadas** em matriz representativa (1000/1280/1600px, os 3 temas, densidade e
intensidade combinadas, teclado real, estados vazios/desatualizados/League-fechado observados
organicamente) - zero overflow estrutural, zero erro de console residual, zero exceção, zero
401 silencioso, foco de teclado nunca perdido/preso em 14 tabs consecutivos.

**3 bugs reais encontrados e corrigidos, cada um com teste**:
1. `<button>` aninhado em `CalibrationLabScreen.tsx` (HashChip dentro do botão de seleção de
   candidata) - causava 2 erros de console de hydration mismatch. `<li>` virou o contêiner flex;
   CSS `.sp-calib-list button` (que também vazava para os botões de ação da lista de releases)
   trocado por `.sp-calib-list > li > button`.
2. Badge "ATIVA" contradizendo o rótulo de status ao lado ("Ativa (não é a atual)") na própria
   release atualmente ativa - `releaseStatusLabel()` novo resolve o texto olhando
   `currentlyActive`, não só o status cru.
3. Campo "Novo email" em Conta e segurança pré-preenchido com o e-mail atual sem máscara -
   `useState("")` + placeholder explicativo.

**Não regressão**: mesma recomendação controlada → 5 candidatos idênticos; `release-etapa27c-v1`
`ACTIVE` com hashes iguais; `EXACT_REPLAY`, 0 divergências; zero migrations pendentes (nenhum
arquivo de `apps/api` tocado nesta etapa).

**1230 testes** no monorepo (core 635, riot 97, api 353, desktop 129, raiz 15, analyzer 1) - 1
arquivo novo (`AccountScreen.test.tsx`) + 1 teste novo em `CalibrationLabScreen.test.tsx`.
`typecheck`/`lint`/`build` completos; `apps/api` isolado reproduziu 1 flakiness já documentada
(timeout em teste de `/docs`) na primeira execução, 353/353 na reexecução imediata, sem alteração
de código - registrado, não mascarado. `pnpm --filter @sparta/desktop package:dir` empacotou com
sucesso.
