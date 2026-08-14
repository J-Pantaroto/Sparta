/**
 * Regressão do patch local de `extract-zip@2.0.1` (Dependabot #44,
 * GHSA-jmr9-qjv8-65gv / CVE-2026-56876).
 *
 * `extract-zip` valida onde a ENTRADA de uma sessão de zip vai parar
 * (`destDir` fica dentro do diretório de extração), mas nunca validava pra
 * onde o ALVO de uma entrada symlink apontava — um zip malicioso podia
 * despachar um symlink cujo conteúdo é um caminho absoluto ou relativo tipo
 * "../../../../etc/passwd", escapando do diretório de extração. Não existe
 * versão corrigida publicada (último release em 2020), então a correção foi
 * aplicada localmente via `pnpm patch` (`patches/extract-zip@2.0.1.patch`),
 * espelhando a mesma checagem de contenção que o pacote já usa pra
 * `destDir`, agora aplicada ao alvo resolvido do symlink.
 *
 * Este teste monta um `.zip` mínimo (formato ZIP cru, sem lib de escrita —
 * nenhuma estava presente no projeto e não vale a pena adicionar uma só
 * pra isto) com uma entrada symlink cujo alvo tenta escapar do diretório de
 * extração, e confirma que `extract-zip` agora recusa. Também confirma que
 * um symlink legítimo (alvo dentro do diretório) continua funcionando —
 * senão o patch teria corrigido a vulnerabilidade quebrando o uso normal.
 *
 * `extract-zip` não é declarado como dependência em lugar nenhum do
 * monorepo (uma tentativa anterior de declará-lo direto na raiz só pra este
 * teste importar criou um SEGUNDO alerta Dependabot duplicado, com
 * `manifest_path` apontando pro `package.json` em vez do lockfile — revertido).
 * Em vez disso, o teste resolve o pacote exatamente pelo mesmo caminho que
 * o `electron` (devDependency real de `apps/desktop`) usa em produção: sobe
 * até o `package.json` do `electron` e cria um `require` ancorado ali, que
 * enxerga o `node_modules` próprio do `electron` — onde `extract-zip`
 * patchado de fato mora.
 */
import { mkdtemp, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const desktopPackageJson = join(dirname(fileURLToPath(import.meta.url)), "../apps/desktop/package.json");
const desktopRequire = createRequire(desktopPackageJson);
const electronRequire = createRequire(desktopRequire.resolve("electron/package.json"));
const extractZip = electronRequire("extract-zip") as (
  zipPath: string,
  opts: { dir: string }
) => Promise<void>;

const temporarios: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporarios.splice(0).map((caminho) => rm(caminho, { recursive: true, force: true }))
  );
});

async function pastaTemporaria(prefixo: string): Promise<string> {
  const caminho = await mkdtemp(join(tmpdir(), prefixo));
  temporarios.push(caminho);
  return caminho;
}

/** CRC-32 sem tabela, sem dependência — payloads de teste são minúsculos. */
function crc32(dados: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of dados) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const MODO_SYMLINK_UNIX = 0o120777; // S_IFLNK | 0777

/**
 * Monta um `.zip` válido com uma única entrada symlink (formato STORED, sem
 * compressão). `conteudo` é o alvo do symlink (o texto que `fs.symlink`
 * recebe), não um arquivo de verdade.
 */
function construirZipComSymlink(nomeEntrada: string, alvoSymlink: string): Buffer {
  const nomeBuf = Buffer.from(nomeEntrada, "utf8");
  const dadosBuf = Buffer.from(alvoSymlink, "utf8");
  const crc = crc32(dadosBuf);
  const dataHoraDosMs = 0x21; // qualquer data/hora MS-DOS válida - conteúdo não é checado

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4); // versão necessária
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(0, 8); // método: stored
  localHeader.writeUInt16LE(dataHoraDosMs, 10); // hora MS-DOS
  localHeader.writeUInt16LE(dataHoraDosMs, 12); // data MS-DOS
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(dadosBuf.length, 18); // tamanho comprimido
  localHeader.writeUInt32LE(dadosBuf.length, 22); // tamanho original
  localHeader.writeUInt16LE(nomeBuf.length, 26);
  localHeader.writeUInt16LE(0, 28); // extra field

  const localEntry = Buffer.concat([localHeader, nomeBuf, dadosBuf]);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE((3 << 8) | 20, 4); // version made by: Unix (3), spec 2.0
  centralHeader.writeUInt16LE(20, 6); // versão necessária
  centralHeader.writeUInt16LE(0, 8); // flags
  centralHeader.writeUInt16LE(0, 10); // método: stored
  centralHeader.writeUInt16LE(dataHoraDosMs, 12);
  centralHeader.writeUInt16LE(dataHoraDosMs, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(dadosBuf.length, 20);
  centralHeader.writeUInt32LE(dadosBuf.length, 24);
  centralHeader.writeUInt16LE(nomeBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30); // extra field
  centralHeader.writeUInt16LE(0, 32); // comentário
  centralHeader.writeUInt16LE(0, 34); // disco inicial
  centralHeader.writeUInt16LE(0, 36); // atributos internos
  centralHeader.writeUInt32LE((MODO_SYMLINK_UNIX << 16) >>> 0, 38); // atributos externos (modo Unix)
  centralHeader.writeUInt32LE(0, 42); // offset do header local

  const centralEntry = Buffer.concat([centralHeader, nomeBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8); // registros neste disco
  eocd.writeUInt16LE(1, 10); // registros totais
  eocd.writeUInt32LE(centralEntry.length, 12); // tamanho do diretório central
  eocd.writeUInt32LE(localEntry.length, 16); // offset do diretório central
  eocd.writeUInt16LE(0, 20); // comentário

  return Buffer.concat([localEntry, centralEntry, eocd]);
}

describe("patch local de extract-zip (Dependabot #44 / GHSA-jmr9-qjv8-65gv)", () => {
  it("recusa symlink cujo alvo escapa do diretório de extração (relativo)", async () => {
    const zipDir = await pastaTemporaria("extract-zip-zip-");
    const destDir = await pastaTemporaria("extract-zip-dest-");
    const zipPath = join(zipDir, "malicioso.zip");
    await writeFile(zipPath, construirZipComSymlink("link-malicioso", "../../../../etc/passwd"));

    await expect(extractZip(zipPath, { dir: destDir })).rejects.toThrow(/Out of bound symlink/);

    // nada deve ter sido criado - a falha acontece antes do fs.symlink
    expect(await readdir(destDir)).toEqual([]);
  });

  it("recusa symlink cujo alvo é um caminho absoluto", async () => {
    const zipDir = await pastaTemporaria("extract-zip-zip-");
    const destDir = await pastaTemporaria("extract-zip-dest-");
    const zipPath = join(zipDir, "malicioso-absoluto.zip");
    const alvoAbsoluto = process.platform === "win32" ? "C:\\Windows\\System32\\evil" : "/etc/passwd";
    await writeFile(zipPath, construirZipComSymlink("link-absoluto", alvoAbsoluto));

    await expect(extractZip(zipPath, { dir: destDir })).rejects.toThrow(/Out of bound symlink/);
  });

  it("continua permitindo symlink cujo alvo fica dentro do diretório de extração", async () => {
    const zipDir = await pastaTemporaria("extract-zip-zip-");
    const destDir = await pastaTemporaria("extract-zip-dest-");
    const zipPath = join(zipDir, "legitimo.zip");
    // alvo relativo que aponta pra outro arquivo dentro do proprio destDir -
    // nao precisa existir de fato pra fs.symlink criar o link.
    await writeFile(zipPath, construirZipComSymlink("link-legitimo", "arquivo-irmao.txt"));

    await extractZip(zipPath, { dir: destDir });

    expect(await readdir(destDir)).toEqual(["link-legitimo"]);
    expect(await readlink(join(destDir, "link-legitimo"))).toBe("arquivo-irmao.txt");
  });
});
