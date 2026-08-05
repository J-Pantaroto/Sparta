# Etapa 31A — retirada controlada do Sparta Desktop 0.9.0

## Snapshot anterior à retirada

Registrado em **2026-08-05 18:37:35 -03:00**, antes de qualquer mutação na GitHub Release.

- tag: `v0.9.0`;
- objeto da tag anotada: `ea2378b0e8156d93fa62cd1d7530207f206f7fce`;
- commit imutável da tag: `aa2366b3e5bb4b3e5227dcdec43eaf8c6977ba77`;
- ID da release: `365792897`;
- URL: <https://github.com/J-Pantaroto/Sparta/releases/tag/v0.9.0>;
- título anterior: `Sparta Desktop 0.9.0`;
- estado anterior: `draft=false`, `prerelease=true`, não latest;
- criada em: `2026-08-05T20:13:28Z`;
- publicada em: `2026-08-05T20:14:40Z`;
- atualizada em: `2026-08-05T20:19:12Z`;
- anexos enviados: 6.

### Inventário anterior

|          ID | Anexo                          |      Bytes | SHA-256 informado pelo GitHub                                      | Downloads informados pelo GitHub |
| ----------: | ------------------------------ | ---------: | ------------------------------------------------------------------ | -------------------------------: |
| `503041455` | `Sparta-Setup-0.9.0-x64.exe`   | 95.694.968 | `24105e665e4cb94e41638ff7f85aed479b0a87c9442443a5d965baa6a2b228f9` |                                2 |
| `503041456` | `checksums.txt`                |        359 | `f385666bc25f13d590f65ed68984f0bbf2252ea4c2153ed9a0233c888a8f8abb` |                                1 |
| `503041468` | `release-notes.md`             |      5.272 | `490984ecfee3fad7a93dfa620a5fdb866f2254ca6878f308e6be63a3a67eec11` |                                1 |
| `503041459` | `sbom-api.json`                |     16.654 | `f8cf1af575d854b73aa0431dcbef0b293768afcd06b17f68ade59035a8bfa744` |                                1 |
| `503041457` | `sbom-desktop.json`            |      3.559 | `40eacd9f64cb3ddc2fc3768015e258bef149ee50560abc507b9af8bfb18d2c14` |                                1 |
| `503041458` | `sparta-release-manifest.json` |      3.625 | `cd121d14b23c2479051cd72538e4a57cdab80f229fa07d3a9bceada0b87ef336` |                                1 |

Os valores acima são os contadores brutos apresentados pela API do GitHub no instante do
snapshot. Eles **não** representam usuários ativos, instalações únicas ou sucesso da release.

## Procedimento autorizado

Executado em **2026-08-05 18:38 -03:00**.

1. O título passou a `WITHDRAWN — Sparta Desktop 0.9.0`.
2. As notas passaram a começar com um cabeçalho de retirada e o aviso exigido:

   > Esta versão foi retirada porque ainda não existe uma API pública disponível. O instalador
   > dependia de serviços acessíveis somente no ambiente de desenvolvimento e, por isso, não
   > oferece as funcionalidades principais para usuários externos.

3. Somente o asset ID `503041455`, `Sparta-Setup-0.9.0-x64.exe`, foi removido.

Nenhum arquivo substituto foi enviado e o corpo histórico das notas permaneceu depois do novo
aviso.

## Verificação posterior

- release ID `365792897` ainda existe na mesma URL;
- tag local e remota preservada; o objeto anotado continua
  `ea2378b0e8156d93fa62cd1d7530207f206f7fce` e o peeled commit continua
  `aa2366b3e5bb4b3e5227dcdec43eaf8c6977ba77`;
- `draft=false`, `prerelease=true`; o endpoint `latest` continua respondendo 404;
- o título indica retirada e o aviso obrigatório é o primeiro conteúdo das notas;
- o instalador não aparece entre os anexos e sua URL direta responde 404;
- cinco documentos permaneceram com os mesmos nomes, tamanhos e SHA-256 do snapshot anterior:
  `checksums.txt`, `release-notes.md`, `sbom-api.json`, `sbom-desktop.json` e
  `sparta-release-manifest.json`;
- não houve upload novo nem nome fora da allowlist; nenhum arquivo privado foi publicado;
- a API pública continua `BLOCKED_BY_MISSING_INFRASTRUCTURE`;
- `release-etapa27c-v1` continua `ACTIVE`, com `artifactHash`
  `8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90` e `configHash`
  `fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38`;
- o bundle `replay-input-bundle/2.0.0` continua `FULL_DERIVATION_REPLAY_AVAILABLE`, com
  `verificationStatus=EXACT_REPLAY` e zero dependência ausente.

## Condição para nova publicação

O instalador de `v0.9.0` não deve ser recolocado. Uma publicação futura exige, no mínimo:

1. API pública real implantada, acessível e monitorável fora do ambiente de desenvolvimento;
2. autenticação e fluxo principal desktop ↔ API exercitados por um usuário externo;
3. novo número de versão, novo candidato congelado, novos hashes e nova tag imutável;
4. ciclo completo de segurança, instalação, replay, publicação e rollback aprovado.

## Estado final

```text
WITHDRAWN_PENDING_PUBLIC_API
```

Nenhuma tag foi excluída ou movida, nenhum binário foi alterado, nenhuma versão 0.9.1 foi criada
e nenhuma API, infraestrutura, dado global, peso ou release operacional foi modificado.
