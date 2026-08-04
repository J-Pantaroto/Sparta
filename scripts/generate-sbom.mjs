#!/usr/bin/env node
/**
 * SBOM do candidato, em arquivo de máquina (Etapa 29).
 *
 * Escreve `artifacts/releases/<version>/sbom-api.json` e `sbom-desktop.json`.
 * Só dependências de **produção**: ferramenta de desenvolvimento (eslint,
 * vitest, typescript, electron-builder) não vai para a imagem nem para o
 * instalador, então não pertence ao inventário do que foi distribuído.
 *
 * O formato é próprio e deliberadamente simples — nome, versão, licença,
 * origem. Adotar CycloneDX ou SPDX exigiria uma dependência nova, e a única
 * consumidora hoje é a própria auditoria deste repositório. Trocar depois é
 * mecânico: a informação necessária já está aqui.
 *
 * `--check` não escreve e falha se o resultado diferir do que está em disco.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sbomDe } from "./lib/sbom.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECAR = process.argv.includes("--check");

const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const VERSAO = rootPkg.version;
const DEST = join(ROOT, "artifacts", "releases", VERSAO);

function commit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

const alvos = [
  { arquivo: "sbom-api.json", filtro: "@sparta/api", componente: "Sparta API (imagem de container)" },
  { arquivo: "sbom-desktop.json", filtro: "@sparta/desktop", componente: "Sparta Desktop (instalador Windows)" }
];

const sha = commit();
let falhou = false;

mkdirSync(DEST, { recursive: true });

for (const alvo of alvos) {
  const pacotes = sbomDe(ROOT, rootPkg.packageManager, alvo.filtro);
  if (!pacotes) {
    console.error(`Não foi possível resolver o grafo de ${alvo.filtro}.`);
    process.exit(1);
  }

  const doc = {
    format: "sparta-sbom/1.0.0",
    component: alvo.componente,
    version: VERSAO,
    commit: sha,
    scope: "production",
    packageCount: pacotes.length,
    packages: pacotes.map((p) => ({
      name: p.nome,
      version: p.versao,
      license: p.licenca,
      source: p.workspace ? "workspace" : "npm"
    }))
  };

  const conteudo = `${JSON.stringify(doc, null, 2)}\n`;
  const caminho = join(DEST, alvo.arquivo);

  if (CHECAR) {
    const atual = existsSync(caminho) ? readFileSync(caminho, "utf-8") : "";
    // `commit` muda a cada commit e não é propriedade do grafo — a comparação
    // ignora esse campo para não acusar divergência que não existe.
    const semCommit = (t) => t.replace(/"commit": "[^"]*"/, '"commit": "-"');
    if (semCommit(atual) !== semCommit(conteudo)) {
      console.error(`${alvo.arquivo} está desatualizado.`);
      falhou = true;
    }
    continue;
  }

  writeFileSync(caminho, conteudo, "utf-8");
  console.log(`  ${alvo.arquivo}: ${pacotes.length} pacotes de produção`);
}

if (CHECAR) {
  if (falhou) {
    console.error("\nRode: node scripts/generate-sbom.mjs");
    process.exit(1);
  }
  console.log("SBOM atualizado.");
}
