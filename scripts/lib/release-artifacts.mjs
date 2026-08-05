import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export function lerMetadadosWindows(caminho) {
  const literal = caminho.replaceAll("'", "''");
  const comando = [
    `$v=(Get-Item -LiteralPath '${literal}').VersionInfo`,
    "[PSCustomObject]@{FileVersion=$v.FileVersion;ProductVersion=$v.ProductVersion;ProductName=$v.ProductName;CompanyName=$v.CompanyName} | ConvertTo-Json -Compress"
  ].join("; ");
  const saida = execFileSync("powershell.exe", ["-NoProfile", "-Command", comando], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(saida);
}

export function validarMetadadosInstalador(metadados, versao) {
  const erros = [];
  if (metadados.FileVersion !== versao)
    erros.push(`FileVersion=${metadados.FileVersion ?? "ausente"}`);
  if (metadados.ProductVersion !== versao)
    erros.push(`ProductVersion=${metadados.ProductVersion ?? "ausente"}`);
  if (metadados.ProductName !== "Sparta")
    erros.push(`ProductName=${metadados.ProductName ?? "ausente"}`);
  if (metadados.CompanyName !== "J-Pantaroto")
    erros.push(`CompanyName=${metadados.CompanyName ?? "ausente"}`);
  if (erros.length > 0)
    throw new Error(`metadados internos incompatíveis com ${versao}: ${erros.join(", ")}`);
}

export function descobrirArtefatosDoCandidato(diretorio, versao, opcoes = {}) {
  if (!existsSync(diretorio)) throw new Error(`diretório de artefatos ausente: ${diretorio}`);
  const arquivos = readdirSync(diretorio).filter((nome) =>
    statSync(join(diretorio, nome)).isFile()
  );
  const binariosSparta = arquivos.filter((nome) =>
    /^Sparta-Setup-.*\.(?:exe|blockmap|msi|zip)$/i.test(nome)
  );
  const exeEsperado = `Sparta-Setup-${versao}-x64.exe`;
  const blockmapEsperado = `${exeEsperado}.blockmap`;
  const inesperados = binariosSparta.filter(
    (nome) => nome !== exeEsperado && nome !== blockmapEsperado
  );

  if (inesperados.length > 0) {
    throw new Error(`artefatos de outra versão ou ambíguos: ${inesperados.sort().join(", ")}`);
  }
  if (!arquivos.includes(exeEsperado)) throw new Error(`instalador ausente: ${exeEsperado}`);
  if (!arquivos.includes(blockmapEsperado))
    throw new Error(`blockmap ausente: ${blockmapEsperado}`);
  if (binariosSparta.filter((nome) => nome.endsWith(".exe")).length !== 1) {
    throw new Error("mais de um instalador candidato encontrado");
  }

  const instalador = join(diretorio, exeEsperado);
  const leitor = opcoes.lerMetadados ?? lerMetadadosWindows;
  const metadados = leitor(instalador);
  validarMetadadosInstalador(metadados, versao);

  return {
    instalador,
    blockmap: join(diretorio, blockmapEsperado),
    nomes: [exeEsperado, blockmapEsperado],
    metadados
  };
}

export function caminhoGitDeStatus(linha) {
  // `run()` normaliza a saída com `.trim()`, removendo o primeiro espaço do
  // primeiro registro porcelain (`" M arquivo"` vira `"M arquivo"`). Aceitar
  // os dois formatos evita cortar a primeira letra do caminho gerado.
  const inicio = linha[2] === " " ? 3 : linha[1] === " " ? 2 : 0;
  const bruto = linha.slice(inicio).trim();
  return (bruto.includes(" -> ") ? bruto.split(" -> ").at(-1) : bruto).replaceAll("\\", "/");
}

export function caminhoGeradoPermitido(caminho, versao) {
  const normalizado = caminho.replaceAll("\\", "/");
  return (
    normalizado.startsWith(`artifacts/releases/${versao}/`) ||
    normalizado === "docs/release-candidate.md" ||
    normalizado === ".ai/specs/release-candidate.md"
  );
}

export function caminhosSujosNaoGerados(statusPorcelain, versao) {
  return statusPorcelain
    .split(/\r?\n/)
    .filter(Boolean)
    .map(caminhoGitDeStatus)
    .filter((caminho) => !caminhoGeradoPermitido(caminho, versao));
}

export function nomeDoArquivo(caminho) {
  return basename(caminho);
}
