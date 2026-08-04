#!/usr/bin/env node
/**
 * Geração dos artefatos do release candidate (Etapa 29).
 *
 * Roda a sequência inteira a partir da árvore atual e deposita o resultado em
 * `artifacts/releases/<version>/`:
 *
 *   1. verificação da árvore e da consistência de versão;
 *   2. instalação com lockfile congelado;
 *   3. Prisma Client;
 *   4. typecheck, lint, testes e builds;
 *   5. imagem da API;
 *   6. instalador Windows;
 *   7. SBOM;
 *   8. checksums;
 *   9. manifesto.
 *
 * **Não publica nada.** Não envia imagem para registry, não cria release, não
 * configura publicação. O empacotamento passa `--publish never`.
 *
 * Flags:
 *   --allow-dirty    permite árvore com alteração pendente (só inspeção local)
 *   --skip-verify    pula typecheck/lint/test (usado na segunda geração da
 *                    análise de reprodutibilidade, onde o que se compara é o
 *                    artefato e a verificação já rodou na primeira)
 *   --suffix=<nome>  grava em `artifacts/releases/<version>-<nome>/`, para
 *                    comparar duas gerações sem uma sobrescrever a outra
 */

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const PERMITE_SUJO = args.includes("--allow-dirty");
const PULA_VERIFICACAO = args.includes("--skip-verify");
const SUFIXO = (args.find((a) => a.startsWith("--suffix=")) ?? "").split("=")[1] ?? "";

const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const VERSAO = rootPkg.version;
const PM = rootPkg.packageManager;
const DEST = join(ROOT, "artifacts", "releases", SUFIXO ? `${VERSAO}-${SUFIXO}` : VERSAO);

const NPX = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");

function passo(titulo, fn) {
  const inicio = Date.now();
  process.stdout.write(`\n== ${titulo}\n`);
  fn();
  process.stdout.write(`   (${((Date.now() - inicio) / 1000).toFixed(1)}s)\n`);
}

function exec(cmd, argv, opcoes = {}) {
  const r = spawnSync(cmd, argv, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    env: { ...process.env, CI: "true" },
    maxBuffer: 128 * 1024 * 1024,
    ...opcoes
  });
  if (r.status !== 0) {
    process.stderr.write(`\nFALHOU: ${cmd} ${argv.join(" ")}\n`);
    process.stderr.write((r.stdout ?? "").slice(-4000));
    process.stderr.write((r.stderr ?? "").slice(-4000));
    process.exit(1);
  }
  return (r.stdout ?? "").trim();
}

const pnpm = (argv) => exec(process.execPath, [NPX, "--yes", PM, ...argv]);
const capturar = (cmd, argv) => {
  try {
    return execFileSync(cmd, argv, { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

console.log(`Sparta ${VERSAO} — geração de artefatos do candidato`);
console.log(`destino: ${DEST.slice(ROOT.length + 1)}`);

// ---------------------------------------------------------------- 1. árvore

passo("1/9 árvore e versão", () => {
  const sujo = (capturar("git", ["status", "--porcelain"]) ?? "").length > 0;
  if (sujo && !PERMITE_SUJO) {
    console.error("\nÁrvore de trabalho suja. Os artefatos precisam corresponder a um commit.");
    console.error("Commite antes, ou use --allow-dirty para inspeção local.");
    process.exit(1);
  }
  if (sujo) console.log("   AVISO: árvore suja (--allow-dirty)");
  exec(process.execPath, [join(ROOT, "scripts", "sync-version.mjs"), "--check"]);
  console.log(`   commit ${(capturar("git", ["rev-parse", "HEAD"]) ?? "?").slice(0, 7)}, versão ${VERSAO} consistente`);
});

// ------------------------------------------------------- 2-3. deps e Prisma

passo("2/9 dependências (lockfile congelado)", () => {
  pnpm(["install", "--frozen-lockfile"]);
  console.log("   instalado sem alterar o lockfile");
});

passo("3/9 Prisma Client", () => {
  pnpm(["--filter", "@sparta/api", "prisma:generate"]);
  console.log("   gerado");
});

// -------------------------------------------------------------- 4. verificação

passo("4/9 typecheck, lint, testes e build", () => {
  if (PULA_VERIFICACAO) {
    console.log("   pulado (--skip-verify); build ainda roda, é insumo do empacotamento");
    pnpm(["build"]);
    return;
  }
  pnpm(["typecheck"]);
  console.log("   typecheck ok");
  pnpm(["lint"]);
  console.log("   lint ok");
  const saida = pnpm(["test"]);
  const total = [...saida.matchAll(/Tests\s+?\[?[\d;]*m?\s*(\d+) passed/g)].reduce(
    (a, m) => a + Number(m[1]),
    0
  );
  console.log(`   testes ok${total ? ` (${total} aprovados)` : ""}`);
  pnpm(["build"]);
  console.log("   build ok");
});

// ------------------------------------------------------------- 5. imagem API

passo("5/9 imagem da API", () => {
  exec("docker", ["compose", "build", "api"]);
  const digest = capturar("docker", ["image", "inspect", "sparta-api", "--format", "{{.Id}}"]);
  const tamanho = capturar("docker", ["image", "inspect", "sparta-api", "--format", "{{.Size}}"]);
  console.log(`   ${digest?.slice(0, 26)}…  ${tamanho ? (Number(tamanho) / 1e6).toFixed(0) + " MB" : "?"}`);
});

// ------------------------------------------------------------ 6. instalador

passo("6/9 instalador Windows (sem publicação)", () => {
  // `dist-installer/` e o destino são limpos antes: o electron-builder não
  // remove artefato de versão anterior, e um `.exe` de outra versão sobrevivendo
  // ali vira ambiguidade sobre qual arquivo é o candidato — foi exatamente o que
  // aconteceu na primeira execução deste script, com o manifesto apontando para
  // o instalador antigo.
  rmSync(join(ROOT, "dist-installer"), { recursive: true, force: true });
  rmSync(DEST, { recursive: true, force: true });

  pnpm(["--filter", "@sparta/desktop", "package:win"]);
  mkdirSync(DEST, { recursive: true });
  const origem = join(ROOT, "dist-installer");
  const copiados = readdirSync(origem)
    .filter((n) => new RegExp(`^Sparta-Setup-${VERSAO.replace(/\./g, "\\.")}-.*\\.(exe|blockmap)$`, "i").test(n))
    .sort();
  if (copiados.length === 0) {
    console.error("   nenhum instalador produzido");
    process.exit(1);
  }
  for (const n of copiados) {
    copyFileSync(join(origem, n), join(DEST, n));
    console.log(`   ${n} (${(statSync(join(DEST, n)).size / 1e6).toFixed(1)} MB)`);
  }
});

// ------------------------------------------------------------------ 7. SBOM

passo("7/9 SBOM", () => {
  const script = join(ROOT, "scripts", "generate-sbom.mjs");
  // O SBOM sempre vai para o diretório canônico da versão; com --suffix a
  // segunda geração copia de lá, já que o grafo de dependências é o mesmo
  // lockfile e reproduzi-lo duas vezes não acrescentaria informação.
  exec(process.execPath, [script]);
  if (SUFIXO) {
    const canonico = join(ROOT, "artifacts", "releases", VERSAO);
    for (const n of readdirSync(canonico).filter((x) => /^sbom-.*\.json$/.test(x))) {
      copyFileSync(join(canonico, n), join(DEST, n));
    }
  }
});

// ------------------------------------------------------------- 8. checksums

passo("8/9 checksums", () => {
  const linhas = readdirSync(DEST)
    .filter((n) => n !== "checksums.txt" && n !== "sparta-release-manifest.json")
    .sort()
    .map((n) => `${createHash("sha256").update(readFileSync(join(DEST, n))).digest("hex")}  ${n}`);
  writeFileSync(join(DEST, "checksums.txt"), `${linhas.join("\n")}\n`, "utf-8");
  for (const l of linhas) console.log(`   ${l}`);
});

// ------------------------------------------------------------- 9. manifesto

passo("9/9 manifesto", () => {
  if (SUFIXO) {
    // O manifesto identifica **o** candidato. Uma geração de comparação não
    // produz um candidato novo — produz uma segunda amostra do mesmo. Escrever
    // um manifesto para ela criaria dois registros concorrentes do que deveria
    // ser um só.
    console.log("   pulado: geração de comparação (--suffix) não congela candidato");
    return;
  }
  const script = join(ROOT, "scripts", "release-manifest.mjs");
  const r = spawnSync(process.execPath, PERMITE_SUJO ? [script, "--allow-dirty"] : [script], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env
  });
  if (r.status !== 0) {
    console.error("\nO manifesto não ficou completo — ver os problemas acima.");
    process.exit(1);
  }
});

console.log(`\nArtefatos em ${DEST.slice(ROOT.length + 1)}`);
console.log("Nada foi publicado: sem registry, sem GitHub Release, sem distribuição externa.");
if (!existsSync(join(DEST, "sparta-release-manifest.json"))) process.exit(1);
