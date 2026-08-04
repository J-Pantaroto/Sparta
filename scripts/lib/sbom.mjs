/**
 * SBOM de produção por workspace, derivado do grafo **resolvido** pelo pnpm.
 *
 * A diferença entre "o que está declarado no package.json" e "o que o pnpm
 * resolveu" é justamente o que importa num inventário: é o grafo resolvido que
 * vai para a imagem e para o asar, e é ele que um alerta de vulnerabilidade
 * endereça.
 *
 * Módulo compartilhado entre `release-inventory.mjs` (documento legível) e
 * `generate-sbom.mjs` (arquivo de máquina), para os dois não divergirem.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * O pnpm não está no PATH deste ambiente e o repositório não o instala como
 * dependência — o padrão do projeto é `npx pnpm@<versão fixada>`. Invocar o
 * `npx-cli.js` que acompanha o Node evita depender de shell e de extensão
 * `.cmd` no Windows.
 */
export function pnpm(root, packageManager, args) {
  const npx = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  if (!existsSync(npx)) return null;
  try {
    return execFileSync(process.execPath, [npx, "--yes", packageManager, ...args], {
      cwd: root,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CI: "true" }
    }).trim();
  } catch {
    return null;
  }
}

function lerJson(caminho) {
  return JSON.parse(readFileSync(caminho, "utf-8"));
}

function versaoLocal(caminho) {
  try {
    return lerJson(join(caminho, "package.json")).version ?? "?";
  } catch {
    return "?";
  }
}

function licencaDe(caminho) {
  if (!caminho) return "não declarada";
  const pkg = join(caminho, "package.json");
  if (!existsSync(pkg)) return "não declarada";
  try {
    const j = lerJson(pkg);
    if (typeof j.license === "string") return j.license;
    if (j.license && typeof j.license.type === "string") return j.license.type;
    if (Array.isArray(j.licenses)) return j.licenses.map((l) => l.type ?? l).join(" OR ");
  } catch {
    /* pacote sem package.json legível fica como não declarada */
  }
  return "não declarada";
}

/**
 * Achata o grafo do `pnpm list --json`. Um mesmo pacote pode aparecer em várias
 * versões; cada par nome@versão é uma entrada distinta.
 *
 * Pacote do próprio monorepo vem como `link:<caminho>`. Listar esse caminho
 * como se fosse versão publicada seria enganoso — sai marcado como workspace,
 * com a versão real declarada no package.json do pacote.
 */
function achatar(dependencias, destino) {
  for (const [nome, dado] of Object.entries(dependencias ?? {})) {
    if (!dado || typeof dado.version !== "string") continue;
    const ehWorkspace = dado.version.startsWith("link:");
    const versao = ehWorkspace ? versaoLocal(dado.path) : dado.version;
    destino.set(`${nome}@${versao}${ehWorkspace ? " (workspace)" : ""}`, {
      nome,
      versao,
      workspace: ehWorkspace,
      caminho: dado.path ?? null
    });
    if (dado.dependencies) achatar(dado.dependencies, destino);
  }
  return destino;
}

/** Devolve a lista ordenada de pacotes de produção do filtro, ou `null`. */
export function sbomDe(root, packageManager, filtro) {
  const bruto = pnpm(root, packageManager, ["--filter", filtro, "list", "--prod", "--depth", "Infinity", "--json"]);
  if (!bruto) return null;
  const pacotes = new Map();
  for (const projeto of JSON.parse(bruto)) achatar(projeto.dependencies, pacotes);
  return [...pacotes.entries()]
    .map(([id, dado]) => ({
      id,
      nome: dado.nome,
      versao: dado.versao,
      workspace: dado.workspace,
      licenca: licencaDe(dado.caminho)
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
