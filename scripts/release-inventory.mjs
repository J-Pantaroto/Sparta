#!/usr/bin/env node
/**
 * Inventário do candidato de release (Etapa 28b).
 *
 * Gera, a partir do repositório e dos artefatos já construídos:
 *
 *   - SBOM de **produção** por aplicação (nome@versão + licença declarada),
 *     derivado do que o pnpm resolve com `--prod`, não do que está declarado
 *     no `package.json`. A diferença importa: é o grafo resolvido que vai
 *     para a imagem e para o asar.
 *   - SHA-256 dos artefatos presentes em `dist-installer/`.
 *   - Versões que identificam o candidato: commit, versão do app, Electron,
 *     Node do runtime da API, digest da imagem-base e da imagem construída.
 *   - Resumo das migrations aplicadas.
 *
 * **Não coleta segredo algum**: não lê `.env`, não lê variável de ambiente do
 * projeto e não consulta o banco. Tudo o que sai daqui é público por natureza
 * (versões, hashes de arquivo, nomes de pacote).
 *
 * Uso:
 *   node scripts/release-inventory.mjs            # escreve docs/release-candidate.md
 *   node scripts/release-inventory.mjs --check    # não escreve; falha se desatualizado
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = join(ROOT, "docs", "release-candidate.md");
const CHECAR = process.argv.includes("--check");

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

/**
 * Achata o grafo que o `pnpm list --json` devolve. Um mesmo pacote pode
 * aparecer em várias versões; cada par nome@versão é uma entrada distinta,
 * porque é isso que um alerta de vulnerabilidade endereça.
 */
function achatar(dependencias, destino) {
  for (const [nome, dado] of Object.entries(dependencias ?? {})) {
    if (!dado || typeof dado.version !== "string") continue;
    // Pacote do próprio monorepo entra como `link:<caminho relativo>`. Listar
    // esse caminho como se fosse versão publicada seria enganoso: não há
    // artefato de terceiro por trás dele. Sai identificado como workspace,
    // com a versão real declarada no package.json do pacote.
    const versao = dado.version.startsWith("link:")
      ? `${lerVersaoLocal(dado.path)} (workspace)`
      : dado.version;
    destino.set(`${nome}@${versao}`, dado.path ?? null);
    if (dado.dependencies) achatar(dado.dependencies, destino);
  }
  return destino;
}

function lerVersaoLocal(caminho) {
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
 * O pnpm não está no PATH deste ambiente e o repositório não o instala como
 * dependência — o padrão do projeto é `npx pnpm@<versão fixada>`. Invocar o
 * `npx-cli.js` que acompanha o Node evita depender de shell e de extensão
 * `.cmd` no Windows. A versão vem de `packageManager`, então o inventário é
 * gerado exatamente pelo resolvedor que instalou a árvore.
 */
function pnpm(args) {
  const npx = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  if (!existsSync(npx)) return null;
  return run(process.execPath, [npx, "--yes", rootPkg.packageManager, ...args], {
    env: { ...process.env, CI: "true" }
  });
}

function sbomDe(filtro) {
  const bruto = pnpm(["--filter", filtro, "list", "--prod", "--depth", "Infinity", "--json"]);
  if (!bruto) return null;
  const pacotes = new Map();
  for (const projeto of JSON.parse(bruto)) {
    achatar(projeto.dependencies, pacotes);
  }
  return [...pacotes.entries()]
    .map(([id, caminho]) => ({ id, licenca: licencaDe(caminho) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function sha256(caminho) {
  return createHash("sha256").update(readFileSync(caminho)).digest("hex");
}

function artefatos() {
  const dir = join(ROOT, "dist-installer");
  if (!existsSync(dir)) return [];
  // `builder-debug.yml` fica de fora: é dump interno do electron-builder, com
  // caminhos absolutos da máquina de build, e não é artefato distribuível.
  return readdirSync(dir)
    .filter((nome) => /\.(exe|blockmap|zip|msi)$/i.test(nome))
    .sort()
    .map((nome) => {
      const caminho = join(dir, nome);
      return { nome, bytes: statSync(caminho).size, sha256: sha256(caminho) };
    });
}

function imagemBaseDoDockerfile() {
  const texto = readFileSync(join(ROOT, "Dockerfile.api"), "utf-8");
  const m = texto.match(/^ARG NODE_IMAGE=(\S+)/m);
  return m ? m[1] : "não encontrada";
}

function migrations() {
  const dir = join(ROOT, "apps", "api", "prisma", "migrations");
  return readdirSync(dir)
    .filter((nome) => statSync(join(dir, nome)).isDirectory())
    .sort();
}

function tabela(linhas) {
  return linhas.map((l) => `| ${l.join(" | ")} |`).join("\n");
}

const desktopPkg = lerJson(join(ROOT, "apps", "desktop", "package.json"));
const rootPkg = lerJson(join(ROOT, "package.json"));
const commit = run("git", ["rev-parse", "HEAD"]) ?? "desconhecido";
const commitCurto = commit.slice(0, 7);
const sujo = (run("git", ["status", "--porcelain"]) ?? "").length > 0;
const electron = (desktopPkg.devDependencies?.electron ?? "").replace(/^[\^~]/, "");
const electronResolvido =
  run("node", ["-p", "require('electron/package.json').version"], {
    cwd: join(ROOT, "apps", "desktop")
  }) ?? electron;
const imagemDigest =
  run("docker", ["image", "inspect", "sparta-api", "--format", "{{index .Id}}"]) ?? "imagem não construída";
const imagemTamanho = run("docker", ["image", "inspect", "sparta-api", "--format", "{{.Size}}"]);

const sbomApi = sbomDe("@sparta/api");
const sbomDesktop = sbomDe("@sparta/desktop");
const listaArtefatos = artefatos();
const listaMigrations = migrations();

const conteudo = `# Candidato de release — inventário

<!-- GERADO por scripts/release-inventory.mjs. Não editar à mão: rode
     \`node scripts/release-inventory.mjs\` para atualizar. -->

Este arquivo descreve **um candidato local**. Nada aqui foi publicado: não há
GitHub Release, não há distribuição externa e o empacotamento roda sempre com
\`--publish never\`.

## Identificação

${tabela([
  ["Campo", "Valor"],
  ["---", "---"],
  ["Commit", `\`${commit}\`${sujo ? " (árvore com alterações não commitadas no momento da geração)" : ""}`],
  ["Versão do app", desktopPkg.version],
  ["Versão do monorepo", rootPkg.version],
  ["Electron", electronResolvido],
  ["Gerenciador de pacotes", rootPkg.packageManager],
  ["Imagem-base da API", `\`${imagemBaseDoDockerfile()}\``],
  ["Imagem da API construída", `\`${imagemDigest}\``],
  ["Tamanho da imagem", imagemTamanho ? `${(Number(imagemTamanho) / 1e6).toFixed(0)} MB` : "não medido"]
])}

## Assinatura de código

O instalador Windows sai **não assinado**. Não existe certificado de assinatura
de código neste projeto, e nada no empacotamento simula assinatura — verificável
com \`Get-AuthenticodeSignature\`, que devolve \`NotSigned\`.

Consequência prática, sem eufemismo: ao executar o instalador, o Windows
SmartScreen exibe "O Windows protegeu o computador" e exige que o usuário abra
"Mais informações" → "Executar assim mesmo". O aviso é legítimo — o sistema não
tem como atribuir o binário a um publicador verificado. Um instalador não
assinado também não acumula reputação no SmartScreen, então o aviso não
desaparece com o tempo por si só.

Distribuir para terceiros sem assinatura não é recomendado. Resolver isso exige
um certificado de assinatura de código (OV ou EV) emitido por uma autoridade
reconhecida — decisão de negócio, fora do escopo técnico desta etapa.

## Artefatos e checksums

${
  listaArtefatos.length === 0
    ? "Nenhum artefato em `dist-installer/`. Rode `pnpm --filter @sparta/desktop package:win` para gerar."
    : tabela([
        ["Arquivo", "Bytes", "SHA-256"],
        ["---", "---", "---"],
        ...listaArtefatos.map((a) => [a.nome, String(a.bytes), `\`${a.sha256}\``])
      ])
}

Os artefatos não são versionados (\`dist-installer/\` está no \`.gitignore\`).
Os checksums acima identificam a build gerada a partir do commit registrado
acima; reconstruir a partir de outro commit produz outros valores.

## Migrations

${listaMigrations.length} migrations no repositório, aplicadas em ordem lexicográfica:

${listaMigrations.map((m) => `- \`${m}\``).join("\n")}

A aplicação em um ambiente novo é feita pelo processo documentado em
\`docs/database-migrations.md\`, nunca por \`migrate dev\` nem por reescrita de
migration já aplicada.

## SBOM — dependências de produção

Somente o grafo **resolvido** com \`--prod\`. Ferramenta de desenvolvimento
(eslint, vitest, typescript, electron-builder) não aparece aqui porque não vai
para a imagem nem para o instalador.

### API — ${sbomApi ? sbomApi.length : 0} pacotes

${
  sbomApi
    ? tabela([
        ["Pacote", "Licença"],
        ["---", "---"],
        ...sbomApi.map((p) => [`\`${p.id}\``, p.licenca])
      ])
    : "não foi possível resolver o grafo."
}

### Desktop — ${sbomDesktop ? sbomDesktop.length : 0} pacotes

${
  sbomDesktop
    ? tabela([
        ["Pacote", "Licença"],
        ["---", "---"],
        ...sbomDesktop.map((p) => [`\`${p.id}\``, p.licenca])
      ])
    : "não foi possível resolver o grafo."
}

O runtime do Electron (Chromium + Node embutidos) não é um pacote npm e não
aparece na tabela acima; a versão está na seção de identificação.

## O que este inventário não contém

Nenhum segredo. O gerador não lê \`.env\`, não lê variável de ambiente do
projeto e não consulta o banco — só o repositório, o grafo do pnpm e os
artefatos em disco.
`;

if (CHECAR) {
  const atual = existsSync(SAIDA) ? readFileSync(SAIDA, "utf-8") : "";
  if (atual !== conteudo) {
    console.error("docs/release-candidate.md está desatualizado. Rode: node scripts/release-inventory.mjs");
    process.exit(1);
  }
  console.log("docs/release-candidate.md está atualizado.");
} else {
  writeFileSync(SAIDA, conteudo, "utf-8");
  console.log(`Escrito ${SAIDA}`);
  console.log(`  commit=${commitCurto} app=${desktopPkg.version} electron=${electronResolvido}`);
  console.log(`  artefatos=${listaArtefatos.length} migrations=${listaMigrations.length}`);
  console.log(`  sbom api=${sbomApi?.length ?? 0} desktop=${sbomDesktop?.length ?? 0}`);
}
