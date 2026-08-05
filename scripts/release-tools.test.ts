import { createPackage } from "@electron/asar";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  caminhosSujosNaoGerados,
  descobrirArtefatosDoCandidato,
  validarMetadadosInstalador
} from "./lib/release-artifacts.mjs";
import {
  achadosDeConteudo,
  inspecionarAppAsar,
  motivoDeCaminhoProibido
} from "./lib/release-package.mjs";

const temporarios: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporarios.splice(0).map((caminho) => rm(caminho, { recursive: true, force: true }))
  );
});

describe("inspeção do app.asar", () => {
  it.each([
    ["node_modules/@sparta/riot/src/a.ts", "fonte TypeScript"],
    ["node_modules/@sparta/riot/dist/a.js.map", "source map"],
    ["node_modules/@sparta/riot/__fixtures__/match.json", "fixture/mock/snapshot"],
    ["src/example.spec.js", "arquivo de teste"],
    [".env.production", "arquivo de ambiente"],
    ["vitest.config.js", "configuração de teste"]
  ])("rejeita %s", (caminho, motivo) => {
    expect(motivoDeCaminhoProibido(caminho)).toBe(motivo);
  });

  it("detecta segredos e payload Riot sintético no conteúdo", () => {
    expect(achadosDeConteudo("RGAPI-abcdefghijklmnopqrstuvwxyz1234 puuid-player-1")).toEqual([
      "token Riot",
      "payload sintético Riot"
    ]);
  });

  it("inspeciona o arquivo asar real, não apenas padrões declarativos", async () => {
    const raiz = await mkdtemp(join(tmpdir(), "sparta-asar-test-"));
    temporarios.push(raiz);
    const conteudo = join(raiz, "conteudo");
    await mkdir(join(conteudo, "node_modules", "@sparta", "riot", "__fixtures__"), {
      recursive: true
    });
    await writeFile(join(conteudo, "index.js"), "export const ok = true;", "utf-8");
    await writeFile(
      join(conteudo, "node_modules", "@sparta", "riot", "__fixtures__", "match.json"),
      '{"puuid":"puuid-player-1"}',
      "utf-8"
    );
    const pacote = join(raiz, "app.asar");
    await createPackage(conteudo, pacote);

    const resultado = inspecionarAppAsar(pacote);
    expect(resultado.achados).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ caminho: expect.stringContaining("__fixtures__/match.json") })
      ])
    );
  });
});

describe("descoberta estrita de artefatos", () => {
  const metadadosValidos = {
    FileVersion: "0.9.0",
    ProductVersion: "0.9.0",
    ProductName: "Sparta",
    CompanyName: "J-Pantaroto"
  };

  it("aceita somente o par exato da versão e valida metadados internos", async () => {
    const raiz = await mkdtemp(join(tmpdir(), "sparta-artifacts-test-"));
    temporarios.push(raiz);
    await writeFile(join(raiz, "Sparta-Setup-0.9.0-x64.exe"), "exe");
    await writeFile(join(raiz, "Sparta-Setup-0.9.0-x64.exe.blockmap"), "blockmap");

    const resultado = descobrirArtefatosDoCandidato(raiz, "0.9.0", {
      lerMetadados: () => metadadosValidos
    });
    expect(resultado.nomes).toEqual([
      "Sparta-Setup-0.9.0-x64.exe",
      "Sparta-Setup-0.9.0-x64.exe.blockmap"
    ]);
  });

  it("rejeita artefato antigo mesmo quando o atual também existe", async () => {
    const raiz = await mkdtemp(join(tmpdir(), "sparta-artifacts-test-"));
    temporarios.push(raiz);
    await writeFile(join(raiz, "Sparta-Setup-0.9.0-x64.exe"), "exe");
    await writeFile(join(raiz, "Sparta-Setup-0.9.0-x64.exe.blockmap"), "blockmap");
    await writeFile(join(raiz, "Sparta-Setup-0.1.0-x64.exe"), "old");

    expect(() =>
      descobrirArtefatosDoCandidato(raiz, "0.9.0", { lerMetadados: () => metadadosValidos })
    ).toThrow(/outra versão ou ambíguos/);
  });

  it("rejeita metadados internos divergentes", () => {
    expect(() =>
      validarMetadadosInstalador({ ...metadadosValidos, ProductVersion: "0.1.0" }, "0.9.0")
    ).toThrow(/ProductVersion=0\.1\.0/);
  });

  it("distingue saídas geradas de alterações de fonte", () => {
    const status = [
      " M artifacts/releases/0.9.0/checksums.txt",
      " M docs/release-candidate.md",
      " M packages/riot/package.json"
    ].join("\n");
    expect(caminhosSujosNaoGerados(status, "0.9.0")).toEqual(["packages/riot/package.json"]);
  });
});
