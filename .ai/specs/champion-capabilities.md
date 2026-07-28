# Capacidades rastreáveis dos campeões

A Etapa 14 cria um catálogo técnico separado de `ChampionTag`. Ele registra
somente capacidades sustentadas por texto ou metadado explícito do recurso
oficial completo de cada campeão na Data Dragon.

O perfil ainda não participa de ranking, score, pesos, recomendações,
pré-game ou análise 5×5.

## Fonte e versões

- fonte: Data Dragon oficial;
- recurso: `champion/{championKey}.json`;
- catálogo atual: `16.14.1`;
- locale textual: `pt_BR`;
- algoritmo: `champion-capability-extraction/1.0.0`;
- manifesto: `data/seeds/champion-capabilities.json`.

Cada perfil preserva campeão, versão, locale, algoritmo, referências reais de
passiva/habilidades, disponibilidade e cobertura. Cada evidência preserva:

- tipo da fonte (`PASSIVE`, `SPELL` ou `CHAMPION_METADATA`);
- ID real da habilidade e nome oficial; a passiva usa o identificador estável
  `passive` porque a Data Dragon não publica ID para ela, e o metadado usa
  `stats.attackrange`;
- trecho oficial que disparou a regra;
- identificador versionado da regra de extração.

A capacidade possui proveniência `CALCULATED`: o texto de entrada é oficial,
mas reconhecer uma expressão é um cálculo reprocessável do Sparta.

Community Dragon, conhecimento interno do modelo, tabelas externas e
curadoria campeão por campeão não participam do processo.

## Contrato

`ChampionCapabilityProfile` contém as 23 capacidades previstas:

- controle: `HARD_CC`, `SOFT_CC`, `DISPLACEMENT`, `TARGETED_CC`, `AREA_CC`,
  `CC_RELIABILITY`;
- mobilidade: `MOBILITY`, `DASH`, `BLINK`, `MOVEMENT_SPEED`,
  `ANTI_MOBILITY`;
- combate: `ENGAGE`, `DISENGAGE`, `PEEL`, `FRONTLINE`, `PICKOFF`,
  `PROTECTION`;
- pressão: `WAVECLEAR`, `POKE`, `BURST`, `SUSTAINED_DAMAGE`, `SCALING`,
  `RANGE_PROFILE`.

Cada dimensão possui `status`, `value`, `evidence`, `provenance` e motivo de
indisponibilidade. Uma presença textual explícita usa `value: true`. O único
valor numérico da versão atual é `RANGE_PROFILE`, que preserva
`stats.attackrange` em unidades do jogo. Ele representa apenas alcance de
ataque base, não alcance efetivo das habilidades.

Ausência de termo nunca produz `false`, zero ou nível médio. A dimensão fica
`UNAVAILABLE`.

## Extração determinística

As regras textuais removem apenas marcação HTML para comparação, normalizam
acentos e caixa e preservam como evidência a frase oficial original. A versão
atual reconhece expressões explícitas de:

- stun, root, knockup, knockback, suppression, charm, fear, taunt e silence;
- slow e redução explícita de velocidade de movimento;
- dash, teleport/blink e ganho explícito de velocidade de movimento;
- criação/recebimento explícito de escudo;
- cura ou restauração explícita de vida.

Filtros conservadores rejeitam referências a imunidade, resistência, controle
sofrido pelo próprio campeão, negações e simples menções a escudo/cura.
Esses filtros reduzem falsos positivos; eles não autorizam concluir que uma
capacidade ausente no perfil não existe no jogo.

Agregações permitidas são restritas:

- evidência explícita de stun/root/etc. pode produzir `HARD_CC`;
- knockup/knockback explícito também pode produzir `DISPLACEMENT`;
- dash/blink/ganho de velocidade explícito pode produzir `MOBILITY`;
- escudo ou cura explícita pode produzir `PROTECTION`.

Não existem as seguintes promoções:

- hard CC → confiabilidade, alvo ou área;
- dash/blink → engage;
- escudo/cura → peel;
- classe Tank → frontline;
- capacidade → posição;
- texto de dano → burst, poke, waveclear ou scaling.

## Cobertura real

Cobertura é:

```txt
capacidades AVAILABLE ou PARTIAL ÷ 23 capacidades previstas
```

Ela não é confiança, precisão, força, completude do kit nem penalização. No
catálogo 16.14.1:

| Capacidade | Campeões com informação utilizável |
|---|---:|
| `RANGE_PROFILE` | 173 |
| `SOFT_CC` | 131 |
| `MOBILITY` | 106 |
| `HARD_CC` | 94 |
| `PROTECTION` | 84 |
| `MOVEMENT_SPEED` | 77 |
| `DISPLACEMENT` | 50 |
| `DASH` | 28 |
| `BLINK` | 19 |

As outras 14 dimensões permanecem indisponíveis em todos os perfis. A
cobertura média é 19,15%, com mínimo de 4,35% e máximo de 30,43%. Essa
incompletude é intencional e visível.

## Manifesto e verificação

O gerador busca a versão atual, lê `champion.json` para enumerar os campeões e
baixa o recurso completo oficial de cada um. A geração falha se algum detalhe
ou referência estrutural for inválido.

```bash
pnpm --filter @sparta/api champion-capabilities:generate
pnpm --filter @sparta/api champion-capabilities:check
```

O modo `--check` não escreve. O manifesto é ordenado por ID e conserva
`generatedAt` quando catálogo, algoritmo e resultado funcional permanecem
iguais. Validação garante:

- exatamente uma entrada para cada capacidade prevista;
- indisponibilidade sem valor ou evidência;
- capacidade utilizável com valor e evidência;
- evidência apontando para passiva, habilidade ou metadado realmente
  registrado no perfil;
- contagem e cobertura consistentes.

## Consulta técnica

```http
GET /catalog/champions/:championId/capabilities
```

A resposta expõe o perfil completo, incluindo dimensões indisponíveis,
evidências, versões e cobertura. Campeão sem perfil responde `404` com status
`UNAVAILABLE`. Nenhum card de recomendação recebe esses detalhes.

## Separação de conceitos e compatibilidade

`ChampionTag` continua sendo o perfil genérico derivado de classes e
atributos, com suas nove dimensões inalteradas. O novo perfil não copia,
sobrescreve nem resolve conflitos com tags.

O manifesto é a persistência revisável e reprocessável desta etapa; não foi
criado agregado no banco. A imagem da API já inclui `data/`, portanto a
consulta funciona no ambiente empacotado. Instalações antigas sem o arquivo
continuam executando as rotas existentes e recebem indisponibilidade apenas
na nova consulta técnica.

Análise 5×5, counters, meta, matchup, posição, risco contra composição e
qualquer alteração de ranking permanecem fora desta etapa.
