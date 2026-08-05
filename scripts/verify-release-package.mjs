#!/usr/bin/env node

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspecionarAppAsar } from "./lib/release-package.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argumento = process.argv.find((arg) => arg.startsWith("--asar="));
const caminhoAsar = argumento
  ? resolve(ROOT, argumento.slice("--asar=".length))
  : join(ROOT, "dist-installer", "win-unpacked", "resources", "app.asar");

const resultado = inspecionarAppAsar(caminhoAsar);

if (resultado.achados.length > 0) {
  console.error(
    `app.asar reprovado: ${resultado.achados.length} achado(s) em ${resultado.totalEntradas} entradas.`
  );
  for (const achado of resultado.achados) console.error(`  - ${achado.caminho}: ${achado.motivo}`);
  process.exit(1);
}

console.log(
  `app.asar aprovado: ${resultado.totalEntradas} entradas, nenhum arquivo ou conteúdo proibido.`
);
