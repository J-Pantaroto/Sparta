# Sparta 0.9.0 — notas da versão

Primeira versão empacotada do Sparta. Aplicativo de desktop para Windows que
analisa o seu histórico de League of Legends e ajuda a decidir no champion
select.

Detalhe técnico de cada etapa de desenvolvimento fica em `.ai/CHANGELOG.md`;
aqui está o que muda para quem usa.

## Por que 0.9.0 e não 1.0.0

O produto está completo para o que se propõe **localmente**: perfil, champion
select, pré-game, pós-game, histórico e replay auditável funcionam com dados
reais. O que falta para um 1.0 não é polimento, é uma dimensão inteira: os dados
globais (matchup, meta, builds e runas da comunidade) dependem de uma Riot
Production Key que o projeto ainda não tem, e o instalador ainda não é assinado.

Marcar isso como 1.0.0 daria a entender que o escopo está fechado. Não está.

## O que o Sparta faz

**Perfil a partir das suas partidas.** Desempenho por campeão e por posição
calculado das partidas reais sincronizadas da Riot. Nenhum campeão de exemplo,
nenhum número de preenchimento.

**Recomendação no champion select.** Até cinco campeões do seu pool, com score,
oito métricas, motivos a favor e alertas contra. A posição é detectada
automaticamente pelo cliente do League; sem o League aberto, há modo manual.

**Análise de composição.** O draft dos dois times é lido do cliente. O Sparta
avalia dezenove dimensões estratégicas — engajamento, proteção, linha de frente,
controle, alcance, escala — usando as capacidades reais das habilidades dos
campeões, e mostra o que a composição tem, o que falta e o que responde às
ameaças do inimigo.

**Patch intelligence.** As notas oficiais do patch, importadas da própria Riot,
para os campeões envolvidos no draft. Mudança oficial é apresentada como
oficial; a leitura de impacto é apresentada como derivada, e onde não há sinal
seguro fica indisponível.

**Pós-game e evolução.** Comparação entre o esperado e o que aconteceu na
partida, com a prioridade de melhoria destacada, e acompanhamento de se os
pontos fracos estão melhorando ao longo do tempo.

**Replay auditável.** Cada recomendação é gravada junto dos dados exatos que a
produziram, e pode ser reexecutada depois para confirmar que o resultado é o
mesmo. Serve para uma coisa direta: garantir que o histórico não é reescrito.

**Laboratório do motor.** Área avançada para montar uma configuração candidata,
testá-la contra o seu histórico e, se ela se provar, promovê-la a release ativa —
com validação, ativação atômica e reversão.

**Tema por campeão e skin.** Escolha qualquer campeão e qualquer skin; o
aplicativo adota a arte e extrai a cor de destaque dela. A skin pode ser baixada
para funcionar sem internet.

## De onde vêm os dados

Só de duas origens, sempre declaradas na tela:

- **Riot Games** — suas partidas (Match-V5), o catálogo de campeões e itens
  (Data Dragon), as notas oficiais de patch e o cliente local do League, lido
  somente para leitura;
- **cálculo do próprio Sparta** sobre esses dados.

Não há dado de terceiros, não há scraping e não há estimativa apresentada como
medição. Quando falta dado para uma métrica, a tela diz "indisponível" e o
motivo, em vez de mostrar um valor neutro.

## O que esta versão não tem

- **Matchup global, força no meta, builds e runas globais.** Não existem. Isso
  exige Riot Production Key e um pipeline de agregação aprovado.
- **Qualquer recurso durante a partida.** Sem overlay, alerta, rastreio de
  cooldown ou automação de pick, ban e runa — por decisão de produto e por
  conformidade com as regras da Riot.
- **Atualização automática.** Atualizar é baixar e executar o instalador novo.
- **Servidor incluído.** O aplicativo conversa com uma API que roda à parte.

## Requisitos

- Windows 10 ou 11, 64 bits;
- League of Legends instalado, para a detecção automática do champion select;
- uma instância da API Sparta acessível;
- conta Sparta com Riot ID vinculado.

## Instalação

Execute `Sparta-Setup-0.9.0-x64.exe`. Instalação por usuário, sem exigir
administrador.

**O Windows vai exibir "O Windows protegeu o computador".** O instalador não é
assinado digitalmente — não existe certificado de assinatura de código no
projeto, e nada no empacotamento finge que existe. Use "Mais informações" →
"Executar assim mesmo". Se quiser conferir o arquivo antes, o SHA-256 é
publicado junto da versão.

## Limitações conhecidas

| Limitação | Situação |
| --- | --- |
| Instalador não assinado (aviso do SmartScreen) | Risco aceito; exige certificado OV/EV |
| Sem matchup, meta, builds e runas globais | Aguardando Riot Production Key |
| Detecção dentro de um champion select real nunca observada ponta a ponta | Funciona por construção e por teste; falta a validação com o League aberto |
| Sem atualização automática | Planejado |
| API operada à parte | Por desenho nesta versão |
| Chave de desenvolvimento da Riot expira em 24 h | Some com a Production Key |
| Instalador não reproduzível byte a byte | O conteúdo instalado é; a compressão do NSIS não |

Detalhe e classificação de cada uma em `release/known-limitations.json`.

## Guia completo

`docs/user-guide.md`.
