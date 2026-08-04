# Reprodutibilidade dos artefatos (Etapa 29)

O que acontece quando o mesmo commit é construído duas vezes. Medido, não
estimado: duas gerações completas de `scripts/build-release.mjs` a partir do
commit `96a2a01`, com comparação byte a byte de cada artefato e do conteúdo
extraído do instalador.

A distinção que interessa é entre **determinístico** (mesmos bytes) e
**funcionalmente equivalente** (bytes diferentes, conteúdo idêntico). Declarar o
segundo como se fosse o primeiro seria falso, e é exatamente onde a maioria das
alegações de "build reproduzível" quebra.

## Resumo

| Artefato | Resultado | Evidência |
| --- | --- | --- |
| `sbom-api.json`, `sbom-desktop.json` | **Determinístico** | Idênticos byte a byte |
| Árvore do `app.asar` | **Determinístico** | 2604 entradas, listagem idêntica |
| `app.asar` | **Determinístico** | `96e41f20047eff5099c321e87516353a611ff8c1eb0024f53678f729103b9eaa` nas duas gerações |
| `Sparta.exe` (binário do app) | **Determinístico** | `d435c4a8169418c720bd602415a4df5f1ea64d070071118d7b59cbb25f38febc` nas duas |
| Conteúdo extraído do instalador | **Determinístico** | 75 arquivos, 359 914 032 bytes, **nenhuma** diferença de conteúdo |
| `Sparta-Setup-0.9.0-x64.exe` | **Funcionalmente equivalente** | SHA-256 diferente; ver abaixo |
| `Sparta-Setup-0.9.0-x64.exe.blockmap` | **Funcionalmente equivalente** | Deriva do `.exe`, então acompanha |
| Imagem `sparta-api` | **Funcionalmente equivalente** | Image ID diferente; 6 de 21 camadas idênticas |

## O instalador

Os dois `.exe` diferem em 99,54 % dos bytes e em 5 bytes de tamanho total
(95 702 596 vs 95 702 601).

Isso **não** é um timestamp isolado. Foi verificado:

- o `TimeDateStamp` do cabeçalho PE é **idêntico** nos dois (`1544912774`,
  2018-12-15) — é o stub pré-compilado do NSIS, que não é recompilado a cada
  build;
- o primeiro campo divergente, em `0xDA18`, logo depois da assinatura do
  cabeçalho NSIS, muda de `0x05B37444` para `0x05B37449` — diferença de
  exatamente 5, que é a diferença de tamanho. É o campo de **tamanho do fluxo
  comprimido**, não uma data;
- extraindo os dois instaladores, o conteúdo é **byte a byte idêntico**: mesmos
  75 arquivos, mesmo tamanho total, nenhuma diferença de conteúdo.

Ou seja: a entrada da compressão é idêntica e a saída não. A variação está no
**compressor**, não no payload. A explicação usual para isso é compressão
LZMA com múltiplas threads, em que a divisão em blocos depende do escalonamento
e não do conteúdo — plausível e consistente com o observado, mas registrada aqui
como explicação provável, não como medição: não foi isolada trocando o modo de
compressão.

**Consequência prática**: o SHA-256 publicado de um instalador identifica
*aquele arquivo*, não *aquele commit*. Quem quiser verificar que um instalador
corresponde ao código precisa comparar o conteúdo extraído — que é
determinístico — e não o hash do `.exe`.

## A imagem da API

Reconstruída com `--no-cache` a partir do mesmo commit: o Image ID muda
(`sha256:2a772436…` → `sha256:b8b11c87…`) e só **6 das 21 camadas** de
filesystem coincidem — exatamente as que vêm da imagem-base fixada por digest.
As 15 camadas produzidas pelo build divergem.

A causa é estrutural, não um defeito do Dockerfile: cada `COPY`/`RUN` grava
mtime dos arquivos na camada, e o `dist/` recém-compilado tem mtime novo. O
Image ID ainda carrega data de criação e histórico.

**Consequência prática**: a imagem precisa ser **publicada por digest** e
referenciada por digest no manifesto e no runbook. Reconstruir "a mesma imagem"
depois não produz o mesmo digest, então o digest é a única identidade estável —
e é por isso que ele entra no manifesto, gerado a partir de `docker image
inspect` e não escrito à mão.

Fixar a imagem-base por digest resolve um problema diferente e complementar: a
**entrada** do build fica reproduzível, mesmo que a saída não seja.

## O que tornaria o instalador determinístico

Nenhuma das opções está no escopo desta etapa; ficam registradas para quem
retomar:

1. compressão single-thread no NSIS, ao custo de tempo de build;
2. `SOURCE_DATE_EPOCH` e normalização de mtime em toda a árvore antes de
   empacotar — resolve o lado do Docker, não o do NSIS;
3. verificação por conteúdo extraído em vez de por hash do container, que é o
   que este documento recomenda e é a única alternativa que não depende de mudar
   ferramenta de terceiro.

## Como repetir esta medição

```bash
node scripts/build-release.mjs
node scripts/build-release.mjs --suffix=repro --skip-verify
```

A segunda geração escreve em `artifacts/releases/<version>-repro/` e **não**
gera manifesto: um manifesto identifica o candidato, e uma geração de comparação
não é um candidato novo — é uma segunda amostra do mesmo.
