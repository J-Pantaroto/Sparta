# Dificuldade do campeão e risco pessoal de execução

O ranking separa três conceitos:

- `CHAMPION_DIFFICULTY`: dificuldade geral publicada no catálogo;
- `PERSONAL_EXPERIENCE`: quantidade e recência da evidência pessoal na
  posição, sem avaliar resultados;
- `EXECUTION_RISK`: estimativa do risco pessoal de executar o campeão,
  derivada das duas anteriores.

Nenhuma dessas métricas representa matchup específico, força no meta,
conhecimento das habilidades do campeão ou garantia de desempenho.

## Dificuldade oficial

A fonte é `info.difficulty` de `champion.json`, na escala 0-10 da Data
Dragon. O Sparta preserva no catálogo:

- valor original;
- versão e locale da Data Dragon;
- recurso de origem;
- valor normalizado;
- versão do algoritmo de normalização.

`Champion.dataDragonDifficulty` guarda o valor oficial. Ele é
deliberadamente separado de `ChampionTag.difficulty`: esta última é uma
dimensão do perfil estratégico derivado/curável e não pode substituir o
fato do catálogo.

A normalização v1 é linear:

```txt
D = info.difficulty × 10
```

Versão: `champion-difficulty-normalization/1.0.0`.

O `RecommendationMetric` conserva `sourceValue` com o valor bruto e sua
proveniência `OFFICIAL`; o valor 0-100 da métrica possui proveniência
`CALCULATED`. Campo ausente produz `UNAVAILABLE`, nunca dificuldade média.

## Evidência pessoal

`PERSONAL_EXPERIENCE` não é maestria, domínio nem desempenho. Ela usa:

- partidas observadas com o campeão naquela posição;
- a mesma referência de amostra do cálculo de confiança existente;
- data da partida mais recente, quando disponível.

O componente de amostra usa o teto já existente de confiança alta
(`HIGH_CONFIDENCE_GAMES = 20`):

```txt
S = min(100, games ÷ 20 × 100)
```

Quando existe data real nas partidas recentes:

```txt
R = 100 × exp(-dias_desde_a_última_partida ÷ 60)
F = 0,8 × S + 0,2 × R
```

O fator de 60 dias é o decaimento exponencial: nesse intervalo a
contribuição de recência cai para aproximadamente 37%. Sem timestamp, `F =
S` e a métrica fica `PARTIAL`. Sem partidas, a familiaridade fica
`UNAVAILABLE`, com amostra zero; não se cria confiança fictícia.

Versão: `personal-familiarity/1.0.0`.

Win rate, KDA, score de desempenho e forma calculada a partir dos resultados
não participam de `F`. Assim, `PERSONAL_PERFORMANCE` continua medindo
resultado, enquanto familiaridade mede somente evidência.

## Risco pessoal

Com dificuldade disponível, o risco v1 é:

```txt
X = D × (1 - 0,65 × F ÷ 100)
```

Sem partidas, a ausência observada equivale a `F = 0` apenas dentro da
fórmula. A métrica de familiaridade continua indisponível; não aparece como
um zero inventado. Experiência pode reduzir até 65% do risco base, mas não
apaga completamente a dificuldade geral.

Versão: `execution-risk/1.0.0`.

O risco não usa:

- vitórias ou derrotas;
- score de desempenho pessoal;
- matchup global ou pessoal;
- meta;
- composição inimiga;
- nomes ou regras específicas de campeão.

## Integração limitada ao ranking

O score estratégico/pessoal existente é calculado sem recalibração. Depois,
o risco aplica uma penalização limitada:

```txt
se X <= 25: penalização = 0
senão:      penalização = min(8, (X - 25) ÷ 75 × 8)

score final = clamp(score base - penalização, 0, 100)
```

O teto de oito pontos impede o risco de dominar sozinho o ranking. Um
encaixe estratégico muito superior continua relevante; opções equivalentes
podem ser desempilhadas pelo risco de execução. Se dificuldade ou risco
estiver indisponível, a penalização é exatamente zero e o score anterior
permanece invariante.

O risco é calculado por candidato. A ordem de entrada, o risco de outro
campeão e a divisão entre principais/alternativas não alteram o valor
individual.

## Interface e compatibilidade

Principais e alternativas exibem:

- dificuldade geral;
- risco pessoal estimado;
- partidas observadas na posição;
- explicação factual e penalização aplicada.

Risco alto usa semântica visual invertida: número alto é pior. Respostas
antigas sem os novos campos recebem métricas `UNAVAILABLE`; o adapter não
cria dificuldade neutra, risco médio, familiaridade ou confiança.

## Fora de escopo

- dificuldade específica do matchup;
- risco específico contra a composição;
- modelo de habilidades, capacidades ou ameaças;
- elegibilidade global por posição;
- meta ou matchup global;
- mudanças no pool ou na quantidade de recomendações.
