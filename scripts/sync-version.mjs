#!/usr/bin/env node
/**
 * Fonte de verdade única da versão do Sparta (Etapa 29).
 *
 * A versão oficial vive em **um** lugar: o campo `version` do `package.json` da
 * raiz. Todo o resto é derivado dele por este script:
 *
 *   - `package.json` de cada workspace;
 *   - `pyproject.toml` do analyzer;
 *   - a versão anunciada pelo OpenAPI da API;
 *   - a versão exposta pelo bridge do preload ao renderer.
 *
 * Os dois últimos eram literais soltos no código. Enquanto fossem editados à
 * mão, "a versão do app" podia divergir de "a versão que o app diz ter" sem
 * nada acusar — e é exatamente esse valor que aparece num relatório de bug.
 *
 * O modo `--check` não escreve nada e sai com código 1 em qualquer divergência.
 * É o que impede o conserto de um lugar só.
 *
 * Uso:
 *   node scripts/sync-version.mjs            # propaga a versão da raiz
 *   node scripts/sync-version.mjs --check    # só verifica
 *   node scripts/sync-version.mjs 0.9.0      # define a versão e propaga
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ = join(ROOT, "package.json");

const args = process.argv.slice(2);
const CHECAR = args.includes("--check");
const versaoNova = args.find((a) => /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(a));

const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

/** Pacotes do workspace cuja versão acompanha a do produto. */
const PACOTES = [
  "package.json",
  "apps/api/package.json",
  "apps/desktop/package.json",
  "packages/core/package.json",
  "packages/riot/package.json"
];

/**
 * Literais em código-fonte. Cada um tem uma âncora que fixa o contexto: sem
 * ela, um `version: "x"` qualquer no arquivo seria reescrito por acidente.
 */
const LITERAIS = [
  {
    arquivo: "apps/api/src/app.ts",
    descricao: "versão anunciada pelo OpenAPI",
    padrao: /(title: "Sparta API",\s*\n\s*version: ")([^"]+)(")/
  },
  {
    arquivo: "apps/desktop/src/preload/index.ts",
    descricao: "versão exposta pelo bridge ao renderer",
    padrao: /(contextBridge\.exposeInMainWorld\("sparta", \{\s*\n\s*version: ")([^"]+)(")/
  },
  {
    arquivo: "services/analyzer/pyproject.toml",
    descricao: "versão do analyzer",
    padrao: /(\nversion = ")([^"]+)(")/
  }
];

function lerVersaoRaiz() {
  return JSON.parse(readFileSync(RAIZ, "utf-8")).version;
}

if (versaoNova && !CHECAR) {
  const j = JSON.parse(readFileSync(RAIZ, "utf-8"));
  j.version = versaoNova;
  writeFileSync(RAIZ, `${JSON.stringify(j, null, 2)}\n`, "utf-8");
}

const VERSAO = lerVersaoRaiz();

if (!SEMVER.test(VERSAO)) {
  console.error(`Versão inválida em package.json: "${VERSAO}"`);
  process.exit(1);
}

const divergencias = [];
const escritos = [];

for (const rel of PACOTES) {
  const caminho = join(ROOT, rel);
  const texto = readFileSync(caminho, "utf-8");
  const j = JSON.parse(texto);
  if (j.version === VERSAO) continue;
  if (CHECAR) {
    divergencias.push(`${rel}: "${j.version}" (esperado "${VERSAO}")`);
    continue;
  }
  j.version = VERSAO;
  writeFileSync(caminho, `${JSON.stringify(j, null, 2)}\n`, "utf-8");
  escritos.push(rel);
}

for (const { arquivo, descricao, padrao } of LITERAIS) {
  const caminho = join(ROOT, arquivo);
  const texto = readFileSync(caminho, "utf-8");
  const achado = texto.match(padrao);
  if (!achado) {
    // Âncora que deixou de casar é erro, não silêncio: significa que o código
    // mudou de forma e o literal saiu do alcance do sincronizador.
    divergencias.push(`${arquivo}: âncora não encontrada (${descricao})`);
    continue;
  }
  if (achado[2] === VERSAO) continue;
  if (CHECAR) {
    divergencias.push(`${arquivo}: "${achado[2]}" (esperado "${VERSAO}") — ${descricao}`);
    continue;
  }
  writeFileSync(caminho, texto.replace(padrao, `$1${VERSAO}$3`), "utf-8");
  escritos.push(arquivo);
}

if (CHECAR) {
  if (divergencias.length > 0) {
    console.error(`Versão fora de sincronia (fonte de verdade: package.json = ${VERSAO}):`);
    for (const d of divergencias) console.error(`  - ${d}`);
    console.error("\nRode: node scripts/sync-version.mjs");
    process.exit(1);
  }
  console.log(`Versão ${VERSAO} consistente em ${PACOTES.length + LITERAIS.length} lugares.`);
} else {
  if (divergencias.length > 0) {
    console.error("Não foi possível sincronizar:");
    for (const d of divergencias) console.error(`  - ${d}`);
    process.exit(1);
  }
  console.log(`Versão ${VERSAO} propagada.`);
  if (escritos.length === 0) {
    console.log("  (nada a alterar — já estava consistente)");
  } else {
    for (const e of escritos) console.log(`  atualizado ${relative(ROOT, join(ROOT, e))}`);
  }
}
