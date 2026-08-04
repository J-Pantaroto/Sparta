#!/usr/bin/env node
/**
 * Manifesto do release candidate (Etapa 29).
 *
 * Congela, num único arquivo, as referências técnicas que identificam **este**
 * candidato: versão, commit, Electron, instalador e seu SHA-256, imagem da API
 * e digests, migrations exigidas, release operacional do motor com seus hashes,
 * versão do schema de replay e o resultado da verificação.
 *
 * Regra central: **nada é presumido**. Cada campo vem de uma fonte real —
 * `git`, `docker inspect`, o arquivo em disco, o Postgres. Quando uma fonte não
 * está disponível, o gerador **falha** em vez de preencher com um valor
 * plausível; um manifesto com valor inventado é pior que um manifesto ausente,
 * porque parece verificado.
 *
 * As limitações conhecidas vêm de `release/known-limitations.json`, que é
 * versionado e revisável num diff — não de uma lista escrita aqui.
 *
 * Não publica nada, não envia imagem, não cria release.
 *
 * Uso:
 *   node scripts/release-manifest.mjs
 *   node scripts/release-manifest.mjs --allow-dirty   # só para inspeção local
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PERMITE_SUJO = process.argv.includes("--allow-dirty");

const problemas = [];

function run(cmd, args, opcoes = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
      ...opcoes
    }).trim();
  } catch {
    return null;
  }
}

function lerJson(caminho) {
  return JSON.parse(readFileSync(caminho, "utf-8"));
}

/** Consulta o Postgres do compose. Devolve `null` se o banco não responder. */
function psql(sql) {
  return run("docker", ["compose", "exec", "-T", "postgres", "psql", "-U", "sparta", "-d", "sparta", "-tAc", sql]);
}

function exigir(valor, campo) {
  if (valor === null || valor === undefined || valor === "") {
    problemas.push(`${campo}: fonte real indisponível`);
    return null;
  }
  return valor;
}

// ---------------------------------------------------------------- identidade

const rootPkg = lerJson(join(ROOT, "package.json"));
const VERSAO = rootPkg.version;
const commit = exigir(run("git", ["rev-parse", "HEAD"]), "commit");
const sujo = (run("git", ["status", "--porcelain"]) ?? "").length > 0;

if (sujo && !PERMITE_SUJO) {
  problemas.push(
    "árvore de trabalho suja: o manifesto identifica um commit, e gerá-lo com alteração pendente " +
      "produziria um registro que não corresponde a nada reconstruível. Commite antes, ou use --allow-dirty para inspeção."
  );
}

// ------------------------------------------------------------------- desktop

const DEST = join(ROOT, "artifacts", "releases", VERSAO);

const electronVersion = exigir(
  run("node", ["-p", "require('electron/package.json').version"], { cwd: join(ROOT, "apps", "desktop") }),
  "desktop.electronVersion"
);

/**
 * O instalador do candidato e o que carrega **esta** versao no nome. Aceitar
 * qualquer `Sparta-Setup-*.exe` faria o manifesto apontar para um artefato de
 * outra versao que tivesse sobrevivido no diretorio — aconteceu de verdade na
 * primeira execucao do pipeline, com o manifesto do 0.9.0 registrando o
 * instalador do 0.1.0 e o SHA-256 dele.
 */
function acharInstalador() {
  const doCandidato = new RegExp(`^Sparta-Setup-${VERSAO.replace(/\./g, "\\.")}-.*\\.exe$`, "i");
  for (const dir of [DEST, join(ROOT, "dist-installer")]) {
    if (!existsSync(dir)) continue;
    const arquivos = readdirSync(dir).filter((n) => /^Sparta-Setup-.*\.exe$/i.test(n));
    const outrasVersoes = arquivos.filter((n) => !doCandidato.test(n));
    if (outrasVersoes.length > 0) {
      problemas.push(
        `desktop.installerFile: ${dir.slice(ROOT.length + 1)} contem instalador de outra versao ` +
          `(${outrasVersoes.join(", ")}). Limpe o diretorio antes de congelar o candidato.`
      );
    }
    const achado = arquivos.find((n) => doCandidato.test(n));
    if (achado) return join(dir, achado);
  }
  return null;
}

const instalador = acharInstalador();
if (!instalador) problemas.push("desktop.installerFile: nenhum instalador encontrado");

const installerSha256 = instalador
  ? createHash("sha256").update(readFileSync(instalador)).digest("hex")
  : null;

/**
 * Assinatura consultada no **binário**, não no log do empacotador: o
 * electron-builder imprime "signing with signtool.exe" mesmo sem certificado.
 */
function estaAssinado(caminho) {
  if (!caminho) return null;
  const status = run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `(Get-AuthenticodeSignature '${caminho.replace(/'/g, "''")}').Status`
  ]);
  if (status === null) {
    problemas.push("desktop.signed: não foi possível consultar a assinatura do binário");
    return null;
  }
  return status.trim() === "Valid";
}

const signed = estaAssinado(instalador);

// ----------------------------------------------------------------------- api

const imageTag = "sparta-api:latest";
const imageDigest = exigir(
  run("docker", ["image", "inspect", imageTag, "--format", "{{.Id}}"]),
  "api.imageDigest"
);
const baseImageDigest = (() => {
  const texto = readFileSync(join(ROOT, "Dockerfile.api"), "utf-8");
  const m = texto.match(/^ARG NODE_IMAGE=(\S+)/m);
  return exigir(m ? m[1] : null, "api.baseImageDigest");
})();
const healthcheck = (() => {
  const bruto = run("docker", ["image", "inspect", imageTag, "--format", "{{json .Config.Healthcheck.Test}}"]);
  if (!bruto) {
    problemas.push("api.healthcheck: imagem sem HEALTHCHECK declarado");
    return null;
  }
  try {
    const partes = JSON.parse(bruto);
    return Array.isArray(partes) ? partes.filter((p) => p !== "CMD-SHELL" && p !== "CMD").join(" ") : String(bruto);
  } catch {
    return String(bruto);
  }
})();

// ------------------------------------------------------------------- database

const dirMigrations = join(ROOT, "apps", "api", "prisma", "migrations");
const requiredMigrations = readdirSync(dirMigrations)
  .filter((n) => statSync(join(dirMigrations, n)).isDirectory())
  .sort();

/**
 * O Prisma não versiona schema. A identidade do schema aqui é a **última
 * migration**, que é o que de fato define a forma da base, acompanhada do
 * hash do `schema.prisma` — assim uma alteração de schema sem migration
 * correspondente aparece como divergência em vez de passar batida.
 */
const schemaHash = createHash("sha256")
  .update(readFileSync(join(ROOT, "apps", "api", "prisma", "schema.prisma")))
  .digest("hex");
const schemaVersion = `${requiredMigrations[requiredMigrations.length - 1]}+sha256:${schemaHash.slice(0, 12)}`;

// Migrations aplicadas na base real: o manifesto declara o que é exigido, mas
// vale conferir se a base de referência está de fato nesse ponto.
const aplicadas = psql(
  "select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null;"
);
if (aplicadas !== null && Number(aplicadas) !== requiredMigrations.length) {
  problemas.push(
    `database: a base de referência tem ${aplicadas} migrations concluídas, o repositório exige ${requiredMigrations.length}`
  );
}

// -------------------------------------------------------- motor de recomendação

const linhaRelease = psql(
  `select r.id||'|'||r."releaseVersion"||'|'||r."artifactHash"||'|'||r."configHash"
   from "RecommendationEngineActivePointer" p
   join "RecommendationEngineRelease" r on r.id = p."releaseId";`
);
if (linhaRelease === null) problemas.push("recommendationEngine: Postgres de referência indisponível");
if (linhaRelease === "") problemas.push("recommendationEngine: nenhuma release apontada como ativa");

const [activeReleaseId, releaseVersion, artifactHash, configHash] = (linhaRelease ?? "|||").split("|");

// ---------------------------------------------------------------------- replay

const bundleSchemaVersion = psql(
  `select "schemaVersion" from "ReplayInputBundleRecord" order by "createdAt" desc limit 1;`
);
const verificationStatus = psql(
  `select "lastVerification"->>'status' from "ReplayInputBundleRecord"
   where "lastVerification" is not null order by "createdAt" desc limit 1;`
);
exigir(bundleSchemaVersion, "replay.bundleSchemaVersion");
exigir(verificationStatus, "replay.verificationStatus");
if (verificationStatus !== null && verificationStatus !== "EXACT_REPLAY") {
  problemas.push(`replay.verificationStatus = ${verificationStatus} (esperado EXACT_REPLAY)`);
}

// ------------------------------------------------------------------------ sbom

const sbomFiles = existsSync(DEST)
  ? readdirSync(DEST)
      .filter((n) => /^sbom-.*\.json$/.test(n))
      .sort()
  : [];
if (sbomFiles.length === 0) problemas.push("sbomFiles: nenhum SBOM encontrado no diretório do candidato");

// ----------------------------------------------------------------- limitações

const limitacoes = lerJson(join(ROOT, "release", "known-limitations.json")).limitations;
const bloqueadores = limitacoes.filter((l) => l.classification === "PUBLICATION_BLOCKER");

// ----------------------------------------------------------------- montagem

const manifesto = {
  version: VERSAO,
  commit,
  createdAt: new Date().toISOString(),

  desktop: {
    electronVersion,
    installerFile: instalador ? instalador.slice(ROOT.length + 1).replace(/\\/g, "/") : null,
    installerSha256,
    signed
  },

  api: {
    imageTag,
    imageDigest,
    baseImageDigest,
    healthcheck
  },

  database: {
    requiredMigrations,
    schemaVersion
  },

  recommendationEngine: {
    activeReleaseId: activeReleaseId || null,
    releaseVersion: releaseVersion || null,
    artifactHash: artifactHash || null,
    configHash: configHash || null
  },

  replay: {
    bundleSchemaVersion,
    verificationStatus
  },

  sbomFiles: sbomFiles.map((n) => `artifacts/releases/${VERSAO}/${n}`),
  knownLimitations: limitacoes.map((l) => `${l.classification}: ${l.title}`)
};

mkdirSync(DEST, { recursive: true });
const caminho = join(DEST, "sparta-release-manifest.json");
writeFileSync(caminho, `${JSON.stringify(manifesto, null, 2)}\n`, "utf-8");

console.log(`Manifesto escrito em ${caminho.slice(ROOT.length + 1)}`);
console.log(`  versão=${VERSAO} commit=${(commit ?? "?").slice(0, 7)} electron=${electronVersion}`);
console.log(`  instalador=${manifesto.desktop.installerFile ?? "ausente"} assinado=${signed}`);
console.log(`  imagem=${imageDigest ? imageDigest.slice(0, 19) + "…" : "ausente"}`);
console.log(`  release do motor=${releaseVersion || "ausente"} replay=${verificationStatus || "ausente"}`);
console.log(`  migrations=${requiredMigrations.length} sbom=${sbomFiles.length} limitações=${limitacoes.length}`);

if (bloqueadores.length > 0) {
  console.log("");
  console.log(`BLOQUEADORES declarados em release/known-limitations.json: ${bloqueadores.length}`);
  for (const b of bloqueadores) console.log(`  - ${b.title}`);
}

if (problemas.length > 0) {
  console.error("");
  console.error("O manifesto NÃO está completo:");
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}
