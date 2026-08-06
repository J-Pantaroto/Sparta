# Pacote preliminar para solicitação de produto à Riot

Status: **não enviado**. Este documento não representa aprovação, Production Key ou habilitação
de RSO. Campos que exigem decisão do titular permanecem explícitos.

## Produto

- Nome: Sparta Desktop.
- Plataforma atual: Windows desktop; API pública ainda inexistente.
- Objetivo: ferramenta educacional para o próprio jogador revisar histórico, organizar pool de
  campeões e receber cinco opções explicadas durante o Champion Select, sem executar ações no
  League Client.
- Público-alvo: `[DECISÃO DO TITULAR — faixa etária, países e idiomas]`.
- Responsável legal: `[DECISÃO DO TITULAR — pessoa ou entidade; não inventado]`.
- Site/domínio/URL do protótipo: `[DECISÃO DO TITULAR]`.
- Contato público e de privacidade: `[DECISÃO DO TITULAR]`.

## Experiência e telas relevantes

1. cadastro/login Sparta;
2. vínculo verificável da própria conta Riot via RSO;
3. início e callback de autorização, com estados pendente/verificado/revogado;
4. Champion Select read-only com cinco recomendações e justificativas;
5. perfil/pool pessoal;
6. histórico de drafts e partidas;
7. comparação pós-game sem causalidade/contrafactual;
8. replay auditável;
9. configurações, privacidade e solicitação de exclusão.

Capturas finais: `[PENDENTE — produzir após domínio/callback e UX RSO aprovados]`.

## Fluxo de dados

- O usuário autentica no Sparta e inicia RSO no backend.
- Riot autentica o jogador e retorna authorization code ao callback HTTPS.
- Backend troca o code usando o método oficial fornecido no onboarding e consulta Account-V1
  `/riot/account/v1/accounts/me` para identificar somente o jogador autenticado.
- PUUID fica no backend como chave técnica; o desktop recebe apenas o necessário para a própria
  experiência.
- Match-V5 sincroniza histórico/timeline do próprio vínculo verificado.
- LCU é read-only no processo principal local para fase, sessão de Champion Select e `gameId`.
- O backend persiste perfil, partidas, observações, drafts, snapshots, relatórios e auditoria.
- Não há coleta global, venda/compartilhamento, publicidade comportamental ou assistência
  durante partida implementada.

Diagrama textual:

```text
Jogador -> Sparta Desktop -> Sparta API -> Riot RSO
                              |             |
                              |             +-> Account-V1 /accounts/me
                              +-> Match-V5 (somente conta verificada)
Sparta Desktop -> LCU local read-only
Sparta API -> PostgreSQL próprio
```

## APIs e justificativa

- RSO: comprovar que o usuário controla a conta vinculada.
- Account-V1 `/accounts/me`: obter a identidade do próprio login, sem aceitar PUUID informado.
- Match-V5 IDs/match/timeline: histórico, métricas observadas, loadout e pós-game do próprio
  usuário.
- Data Dragon: nomes/ativos estáticos de campeões, itens, runas e feitiços.
- LCU read-only: refletir Champion Select; nunca pick/ban/lock-in/runa/escrita.

## Retenção e exclusão

Estado atual: não existe expiração automática nem endpoint público de exclusão. Antes de
submeter/publicar, o titular deve definir prazos por categoria, canal verificável, SLA, backup e
propagação de pedidos/deletion identifiers da Riot. O rascunho está em
`docs/account-deletion-draft.md`. Este ponto é bloqueador, não promessa fictícia.

## Segurança

- TLS/HTTPS obrigatório em produção e CORS por allowlist;
- chaves/tokens somente no backend, nunca no binário distribuído;
- estado RSO com hash, TTL e consumo único;
- uma conta Riot por usuário e proibição de reassociação cruzada;
- autorização fail-closed por rota e ownership derivado do token;
- headers/cookies/Authorization redigidos de logs;
- laboratório e administração invisíveis na API pública;
- incidentes/rotação/runbooks já documentados, execução pública ainda bloqueada.

## Declarações honestas

O Sparta não é endossado pela Riot Games e não deve usar marcas como se fosse produto oficial.
Vitória/derrota não valida recomendação; recomendações são opções educativas, não previsão nem
decisão automática. Meta, matchup, builds ou runas globais não estão disponíveis.

## Checklist antes do envio

- [ ] decisões do titular preenchidas;
- [ ] políticas públicas revisadas juridicamente e hospedadas;
- [ ] domínio/callback HTTPS estáveis;
- [ ] protótipo demonstrável e screenshots finais;
- [ ] provider RSO implementado somente com instruções/credenciais oficiais;
- [ ] retenção/exclusão operacionais e testadas;
- [ ] escopos/APIs conferidos no Developer Portal;
- [ ] revisão final contra políticas/termos vigentes;
- [ ] autorização explícita do titular para enviar.

Referências oficiais consultadas em 2026-08-05:

- https://developer.riotgames.com/docs/portal
- https://developer.riotgames.com/docs/lol
- https://developer.riotgames.com/policies/general
- https://developer.riotgames.com/terms
- https://developer.riotgames.com/docs/faqs
