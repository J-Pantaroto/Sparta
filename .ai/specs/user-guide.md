# Sparta — guia do usuário

Etapa 31D: primeiro acesso obrigatório em Conta → Email → Riot → Pronto, sem convidado ou skip.
Sessão expirada volta ao login antes de conteúdo pessoal. O menu oferece Conta, Configurações e
Sair. Fonte: `docs/account-access-onboarding.md`.

Versão 0.9.0.

## O que é o Sparta

Um aplicativo de desktop que analisa **o seu** histórico de League of Legends e
ajuda a decidir no champion select, antes e depois da partida.

O que ele faz, concretamente:

- monta um perfil por campeão e por posição a partir das suas partidas reais;
- no champion select, sugere até cinco campeões do **seu** pool, com o motivo de
  cada um e o que pesa contra;
- lê a composição dos dois times e diz o que ela tem e o que falta;
- mostra o que mudou no patch atual para os campeões envolvidos, com o texto
  oficial da Riot;
- depois da partida, compara o que era esperado com o que aconteceu;
- guarda cada análise de forma que ela possa ser reproduzida exatamente depois.

## O que ele não faz

Nada durante a partida. Sem overlay, sem alerta em jogo, sem rastreio de
cooldown, sem automação de pick, ban ou runa. O Sparta é pré-partida e
pós-partida, por decisão de produto e por conformidade com as regras da Riot.

E não tem dados globais: **matchup global, força no meta, builds e runas
"da comunidade" não existem no Sparta**. Não estão escondidos nem incompletos —
não existem. Esses números exigiriam uma Riot Production Key e um pipeline de
agregação aprovado, que o projeto ainda não tem. Onde outros aplicativos mostram
um número global, o Sparta mostra "indisponível" com o motivo, em vez de estimar.

Tudo que ele mostra sobre você vem das **suas** partidas.

## Requisitos

| Item              | Requisito                                                       |
| ----------------- | --------------------------------------------------------------- |
| Sistema           | Windows 10 ou 11, 64 bits                                       |
| Espaço            | ~400 MB para o aplicativo                                       |
| League of Legends | Instalado, para a detecção automática do champion select        |
| Servidor Sparta   | Uma instância da API acessível (padrão `http://localhost:3333`) |
| Conta             | Uma conta Sparta e um Riot ID vinculado                         |

O League não precisa estar aberto para consultar perfil, histórico ou análises
já gravadas. Ele é necessário para o Sparta detectar sozinho que você entrou no
champion select e ler o draft.

**A API não vem no instalador.** O aplicativo conversa com um servidor Sparta
por HTTP. Sem esse servidor no ar, a tela de login não consegue autenticar. Quem
opera o servidor deve seguir `docs/runbook-publication.md`.

## Instalação

1. Execute `Sparta-Setup-0.9.0-x64.exe`.
2. **O Windows vai exibir um aviso azul: "O Windows protegeu o computador".**
   Isso é esperado. O instalador não é assinado digitalmente — não existe
   certificado de assinatura de código neste projeto. Clique em **Mais
   informações** e depois em **Executar assim mesmo**.
3. Escolha a pasta ou aceite a sugerida. A instalação é **por usuário**: não
   pede administrador e não afeta outras contas do computador.
4. Ao final, há atalho na área de trabalho e no menu Iniciar.

Se preferir conferir o arquivo antes de executar, compare o SHA-256 dele com o
publicado junto da versão:

```powershell
Get-FileHash .\Sparta-Setup-0.9.0-x64.exe -Algorithm SHA256
```

## Primeiro acesso

1. Abra o Sparta. Ele começa na tela de login.
2. Crie a conta com e-mail e senha, ou entre com uma já existente.
3. Vincule seu Riot ID no formato `Nome#TAG` (por exemplo, `Zekerus#117`).
4. O Sparta busca suas partidas recentes. A primeira sincronização demora mais;
   as seguintes trazem só o que é novo.

Em **Configurações → Análise** você escolhe quantas das suas últimas partidas
entram nas análises (20, 50, 100, ou um valor até 200). O valor passa a valer a
partir da próxima sincronização.

## Conexão com o cliente do League

Com o League aberto, o Sparta lê o cliente **somente para leitura**: fase do
jogo, sua posição atribuída, ordem de pick e os campeões já escolhidos e banidos.
Ele nunca escreve nada no cliente — não seleciona, não bane, não trava e não
troca campeão nem runa.

Quando você entra no champion select, o Sparta muda sozinho para essa tela. Se o
League não estiver aberto, dá para usar o modo manual: escolher a posição e
marcar os campeões inimigos à mão.

Se a detecção não acontecer:

- confirme que o League está aberto e você está de fato no champion select;
- em partidas sem posição atribuída (blind pick, ARAM), o cliente não informa a
  posição — o Sparta pede que você escolha, em vez de chutar;
- o modo manual sempre funciona como alternativa.

## Champion Select

A tela tem três partes:

- **barra superior**: sua posição, ordem de pick e as cinco vagas do time
  inimigo, com as ainda não reveladas marcadas como vazias;
- **coluna da esquerda**: até cinco recomendações, a primeira destacada;
- **painel da direita**: o detalhe da recomendação selecionada.

Cada recomendação traz um score de 0 a 100, oito métricas, os motivos a favor e
os alertas contra. Onde falta dado, aparece "indisponível" com o motivo — a
barra some em vez de exibir um valor neutro que pareceria medição.

A **cobertura** ao lado do score diz quanto do modelo tinha dado para trabalhar.
Cobertura 0,5 significa que metade dos sinais não estava disponível para aquele
campeão; o score continua honesto, mas apoiado em menos evidência.

Se a lista vier vazia, o motivo aparece na tela. O mais comum é ainda não haver
partidas suficientes naquela posição — o Sparta exige um mínimo antes de
ranquear, e mostra quais campeões estão perto do corte e quantas partidas faltam.

Ao confirmar um campeão, aparece uma sugestão de build baseada no seu campeão e
nos inimigos já revelados. Isso fica só no Sparta: nada é aplicado no cliente do
League.

## Pré-game

Depois de confirmar o campeão, o pré-game descreve a composição dos dois times:
o que o seu time tem, o que falta, quais ameaças o inimigo apresenta e o que
responde a elas. Cada afirmação é proporcional ao que se sabe — com o draft pela
metade, o texto diz que está pela metade.

## Histórico e pós-game

- **Pós-game** compara o esperado com o que aconteceu na partida, aponta a
  prioridade de melhoria e mostra cada métrica contra a referência da posição.
- **Evolução** acompanha se os pontos fracos apontados estão melhorando ou
  piorando ao longo das partidas. Enquanto não houver dois blocos de partidas
  para comparar, ele diz isso — não inventa uma tendência.
- **Histórico de drafts** guarda cada sessão de champion select e a análise
  vigente no momento do lock-in.
- **Histórico do motor** relaciona as recomendações com o resultado observado das
  partidas, sem transformar vitória em "acerto".

## Replay

Toda recomendação é gravada junto dos dados exatos que a produziram. Em
**Histórico de drafts**, o botão **Verificar replay** reexecuta o cálculo a
partir desses dados e compara com o que foi mostrado na época.

Se der `EXACT_REPLAY` com zero divergências, a análise que você viu é
reproduzível: ninguém a alterou depois, e ela não depende de dados que mudaram.
É a garantia de que o histórico não é reescrito por trás.

Análises geradas por versões antigas do Sparta podem aparecer como "os inputs de
derivação não eram preservados nesta versão". Isso é honesto: aquelas análises
continuam válidas, só não podem ser reproduzidas integralmente.

## Laboratório do motor e release ativa

Área avançada, para quem quer entender ou ajustar como as recomendações são
calculadas.

- **Configuração operacional atual** mostra, em leitura, qual configuração está
  no ar: a release ativa com seus pesos reais, ou a baseline embutida.
- **Laboratório** permite montar uma configuração candidata, rodar um
  experimento contra o seu histórico e comparar os rankings lado a lado. O
  experimento não altera nada do que está no ar.
- **Releases** permite preparar, validar, ativar e reverter uma configuração,
  com confirmação em dois passos.

Duas coisas que valem saber: o laboratório nunca mostra o resultado da partida
ao avaliar uma recomendação, e nenhuma tela de release aceita digitar peso — os
números vêm sempre de uma candidata já aprovada no laboratório.

## Atualização

Não há atualização automática. Para atualizar, baixe o instalador da versão nova
e execute: ele instala por cima, preservando seus dados locais (tema escolhido,
sessão) e substituindo os arquivos do aplicativo. Não é preciso desinstalar
antes.

Seu histórico e suas análises não ficam no computador — estão no servidor
Sparta, e não são afetados por reinstalar o aplicativo.

## Desinstalação

Por **Configurações do Windows → Aplicativos → Sparta → Desinstalar**, ou pelo
`Uninstall Sparta.exe` na pasta de instalação.

A desinstalação remove o aplicativo e os atalhos. Ela **não** toca em nada do
League of Legends, e **não** apaga os dados da sua conta Sparta no servidor. As
preferências locais (tema, skin baixada) ficam em `%APPDATA%\Sparta`, preservadas
de propósito para o caso de reinstalação — apague essa pasta à mão se quiser
remover tudo.

## Problemas comuns

**"O Windows protegeu o computador" ao instalar.**
Esperado: o instalador não é assinado. "Mais informações" → "Executar assim
mesmo". Confira o SHA-256 antes, se quiser.

**Não consigo entrar; erro de conexão na tela de login.**
O servidor Sparta não está acessível. Confirme que a API está no ar e que o
endereço configurado está correto (padrão `http://localhost:3333`).

**Vinculei a conta e não aparece nenhuma partida.**
A sincronização pode estar sem chave válida da Riot no servidor. Enquanto o
projeto usa chave de desenvolvimento, ela expira a cada 24 horas e precisa ser
regerada por quem opera a API. Nada disso fica no seu computador.

**O Champion Select não abre sozinho.**
O League precisa estar aberto e você precisa estar no champion select. Filas sem
posição atribuída não informam a posição. O modo manual funciona sempre.

**Uma métrica aparece como "indisponível".**
É a resposta correta quando não há dado para calculá-la. O Sparta não preenche
com 0 nem com 50 — um valor inventado é pior que uma ausência declarada.

**A lista de recomendações está vazia.**
Você ainda não tem partidas suficientes naquela posição. A própria tela mostra
quais campeões estão perto do corte e quantas partidas faltam.

**Onde estão matchup global, meta e builds da comunidade?**
Não existem nesta versão. Ver "O que ele não faz", acima.

## Limitações desta versão

Registradas em detalhe em `release/known-limitations.json`. Em resumo:

- instalador não assinado;
- sem dados globais (matchup, meta, builds, runas) até haver Riot Production Key;
- sem atualização automática;
- a API é operada à parte, não vem no instalador;
- a detecção dentro de um champion select real nunca foi validada ponta a ponta
  em ambiente de desenvolvimento — funciona por construção e por teste, mas não
  foi observada numa partida de verdade.
