# Etapa 31 — pós-release do Sparta Desktop 0.9.0

- Data da verificação: **2026-08-05**
- Release: [v0.9.0](https://github.com/J-Pantaroto/Sparta/releases/tag/v0.9.0)
- Commit imutável da tag: `aa2366b3e5bb4b3e5227dcdec43eaf8c6977ba77`

## Atualização — retirada controlada em 2026-08-05

A recomendação desta etapa foi executada na Etapa 31A. O estado público atual é:

```text
WITHDRAWN_PENDING_PUBLIC_API
```

O título e o início das notas sinalizam a retirada. Somente
`Sparta-Setup-0.9.0-x64.exe` foi removido; tag, release e os cinco documentos de auditoria foram
preservados. O snapshot anterior e a verificação posterior estão em
`docs/release-withdrawal-0.9.0.md`.

## Parecer

```text
WITHDRAWAL_REQUIRED
MONITORING_LIMITED_BY_MISSING_PUBLIC_API
```

A distribuição do artefato é íntegra e o instalador funciona, mas o produto principal não é
utilizável por um usuário externo: não existe API pública e o desktop congelado aponta por
padrão para `http://localhost:3333`. Autenticação, recomendações, históricos e laboratório
dependem dessa API. Isso satisfaz o critério de retirada da própria Etapa 31: dependência de API
inacessível que torna o fluxo principal indisponível.

Na conclusão original desta etapa, a retirada ainda não havia sido executada. A autorização veio
na Etapa 31A e removeu somente o instalador, preservando a auditoria. Nenhum hotfix, 0.9.1, deploy
de API ou Etapa 32 foi iniciado.

## Integridade remota

- a tag anotada `v0.9.0` continua no commit aprovado;
- a GitHub Release continua pública, `prerelease=true`, `draft=false` e não é `latest`;
- os seis anexos enviados continuam presentes, com nomes, tamanhos e digests aprovados;
- o instalador tem 95.694.968 bytes, SHA-256
  `24105e665e4cb94e41638ff7f85aed479b0a87c9442443a5d965baa6a2b228f9`, versão interna
  `0.9.0` e assinatura `NotSigned`;
- as notas públicas declaram Windows, League instalado, SmartScreen, ausência de dados globais e
  `API_PUBLICATION_STATUS=BLOCKED_BY_MISSING_INFRASTRUCTURE`;
- a interface do GitHub mostra oito itens em "Assets" porque acrescenta os arquivos automáticos
  de source code; somente os seis anexos permitidos foram enviados pelo projeto;
- não apareceu Issue criado depois da publicação e o único workflow posterior estava verde.
  Contadores de download (um por anexo, gerado pela validação) não são usuários ativos nem
  evidência de estabilidade.
- a release não tem Discussion associada, não havia advisory público do repositório e nenhum
  outro canal público de suporte estava configurado. Assim, a busca externa desta etapa se limita
  à release, Issues e superfícies públicas do próprio GitHub; ausência de relato não é ausência
  de defeito.

## Exercício do instalador público

O `.exe` foi baixado da própria release para um diretório temporário e validado antes de executar.

| Verificação                               | Resultado                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Hash, versão e assinatura                 | SHA esperado, `0.9.0`, `NotSigned`                                                                 |
| Instalação em caminho com espaço e acento | Aprovada, sem elevação                                                                             |
| `app.asar` instalado                      | 2.584 entradas, zero arquivo/conteúdo proibido                                                     |
| Inicialização                             | `file:`, preload presente, documento completo, zero exceção                                        |
| Modo local                                | Dashboard, Champion Select, históricos e configurações abrem sem imagem quebrada ou valor inválido |
| Atualização 0.9.0 sobre 0.9.0             | `app.asar` idêntico; um atalho no Desktop e um no menu Iniciar                                     |
| Desinstalação                             | Removeu executáveis e atalhos do teste                                                             |
| Cópia temporária                          | Removida depois da validação                                                                       |

O teste não ignorou o SmartScreen como problema silencioso: `NotSigned` é limitação pública
e permanece documentada. O exercício automatizado silencioso valida o pacote; a apresentação
visual do SmartScreen depende do Windows e não foi usada como substituto da assinatura ausente.

## Comportamento sem API pública

### Primeiro acesso e autenticação

Com a API local intencionalmente indisponível, o botão de login ficou em estado de carregamento
durante o timeout configurado de 10 segundos, depois foi reabilitado e mostrou:

> Não foi possível acessar o serviço pela rede.

Não houve spinner infinito nem crash. Uma resposta de autenticação inválida continua sendo
rejeitada pela API com 401. Respostas HTTP preservam a mensagem sanitizada do servidor; resposta
inválida, indisponibilidade de rede e timeout têm mensagens públicas controladas pelo cliente.

| Condição                  | Comportamento do Desktop 0.9.0                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Primeiro acesso           | Mostra login e a alternativa "Continuar sem conta (modo local)"; não presume que exista sessão ou API pública |
| API não responde          | Encerra a tentativa no limite de 10 segundos, reabilita o botão e mostra indisponibilidade de rede            |
| API lenta                 | Mantém o botão em carregamento até a resposta ou o mesmo limite de 10 segundos; não espera indefinidamente    |
| API responde com erro     | Exibe a mensagem pública sanitizada do corpo; resposta inválida recebe mensagem genérica controlada           |
| Autenticação indisponível | Permanece na tela de login e oferece modo local; não cria sessão falsa                                        |

O caso de rede recusada foi exercitado no binário. Timeout, HTTP com erro e resposta inválida
também foram revalidados pelas 19 provas automatizadas do cliente desktop e da política HTTP; a
bateria completa do repositório permaneceu verde depois de regenerar o cliente Prisma local.

### Modo local e telas principais

"Continuar sem conta (modo local)" abre a casca da aplicação. Entretanto:

- Champion Select pode ser aberto ou simulado, mas sem token não solicita recomendações;
- Histórico de drafts não recebe dados;
- Histórico do motor informa que falta conta Riot;
- "Laboratório do motor" permanece na navegação, mas seu conteúdo fica vazio sem sessão;
- configurações de tema locais continuam acessíveis.

Portanto, o modo local é degradação visual segura, não um produto offline equivalente. O desktop
não fica preso, mas o fluxo que justifica a release — recomendar a partir dos dados reais do
jogador — não existe para o público externo.

## Release operacional e replay

Depois do teste de indisponibilidade, a API local voltou a `healthy`. Uma recomendação controlada
produziu exatamente:

| Ordem | Campeão  | Score | Cobertura |
| ----: | -------- | ----: | --------: |
|     1 | Viego    |  58,7 |       0,9 |
|     2 | Udyr     |  58,5 |       0,5 |
|     3 | Vi       |  55,3 |       0,5 |
|     4 | Nocturne |  53,3 |       0,5 |
|     5 | Graves   |  50,1 |       0,5 |

O snapshot foi `SAVED`; o bundle `replay-input-bundle/2.0.0` ficou
`FULL_DERIVATION_REPLAY_AVAILABLE`; a verificação terminou `EXACT_REPLAY`, com zero divergência
e zero dependência ausente. `release-etapa27c-v1` continua `ACTIVE`, com `artifactHash`
`8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90` e `configHash`
`fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38`.

Nos logs locais auditados houve zero `fallbackUsed=true`, zero evento fatal/erro estruturado e zero
padrão óbvio de `Authorization: Bearer` ou segredo em query string. Isso demonstra a saúde do
ambiente local controlado; não monitora instalações públicas.

## Suporte e diagnóstico

O canal é GitHub Issues e o repositório agora inclui um formulário específico. As instruções de
sanitização e a limitação dos logs estão em `docs/support.md`.

O Desktop 0.9.0 não tem log persistente nem crash reporter. `%APPDATA%\Sparta` contém dados do
Electron e pode conter sessão; não é log e não deve ser anexado. A falta de diagnóstico
persistente limita a investigação de falhas não reproduzíveis e deve ser tratada em um hotfix ou
versão futura, sem adicionar telemetria automática sem nova decisão.

## Incidentes e decisões

| Severidade    | Critério                                                                        | Ação permitida nesta etapa                                      |
| ------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| CRITICAL      | corrupção/perda de dados, segredo publicado, execução insegura, hash divergente | recomendar retirada imediata; preservar evidência               |
| HIGH          | instalação, autenticação, inicialização ou recomendação principal indisponível  | recomendar retirada ou hotfix explicitamente autorizado         |
| MEDIUM        | fluxo secundário quebrado, mensagem inadequada, diagnóstico insuficiente        | manter somente se o principal for utilizável; planejar correção |
| LOW           | problema cosmético ou documental sem perda funcional                            | documentar e corrigir em ciclo normal                           |
| INFORMATIONAL | observação sem impacto demonstrado                                              | registrar sem inferir incidência                                |

Achados desta execução:

1. **HIGH — API pública inexistente:** bloqueia autenticação e fluxo principal; dispara
   `WITHDRAWAL_REQUIRED`.
2. **MEDIUM — diagnóstico local insuficiente:** não existe log persistente para crash/falha não
   reproduzível.
3. **MEDIUM — laboratório vazio no modo local:** navegação visível sem estado explicativo.
4. **INFORMATIONAL — zero relatos públicos observados:** a amostra é nula e não permite concluir
   estabilidade.

Um hotfix só pode ser aberto com autorização específica e novo ciclo de build, congelamento e
publicação; anexos de `v0.9.0` não podem ser substituídos. A retirada posteriormente autorizada
preservou tag, hashes, manifesto, SBOMs, notas e este relatório como evidência histórica.

## Estado final preservado

- tag e prerelease: preservadas; instalador retirado na Etapa 31A; cinco documentos preservados;
- API pública: `BLOCKED_BY_MISSING_INFRASTRUCTURE`;
- release operacional: `release-etapa27c-v1`, `ACTIVE`, inalterada;
- replay: `EXACT_REPLAY`, zero divergência;
- telemetria, recalibração, hotfix e Etapa 32: **não executados**;
- estado público atual: `WITHDRAWN_PENDING_PUBLIC_API`.
