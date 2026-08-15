import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as {
  pnpm?: { patchedDependencies?: Record<string, string> };
};

/**
 * Casa `--frozen-lockfile` como flag ligada (o modo que valida o lockfile e
 * pode precisar aplicar `pnpm.patchedDependencies`), mas não
 * `--frozen-lockfile=false` (Dockerfile.desktop-dev usa isso de propósito -
 * imagem de dev sem lockfile copiado, não é o caso que este teste protege).
 */
const FROZEN_INSTALL = /pnpm install --frozen-lockfile(?!=false)/g;

const dockerfileNames = readdirSync(repositoryRoot).filter((name) => name.startsWith("Dockerfile."));

interface DockerStage {
  name: string;
  body: string;
}

/**
 * Divide um Dockerfile em estágios por `FROM ... AS <nome>`. Um Dockerfile
 * sem estágio nomeado (ex. Dockerfile.desktop-dev, single-stage) vira um
 * único "estágio" cobrindo o arquivo inteiro - a checagem de patches ainda
 * se aplica a ele, só não há stage boundary pra relatar por nome.
 */
function stagesOf(dockerfile: string): DockerStage[] {
  const markers = [...dockerfile.matchAll(/\nFROM\s+\S+\s+AS\s+(\S+)/g)];
  if (markers.length === 0) {
    return [{ name: "(sem estágio nomeado)", body: dockerfile }];
  }
  return markers.map((match, index) => {
    const start = match.index! + 1;
    const next = markers[index + 1];
    const end = next ? next.index! + 1 : dockerfile.length;
    return { name: match[1], body: dockerfile.slice(start, end) };
  });
}

describe("patch sources versionados", () => {
  it("todo patch em pnpm.patchedDependencies existe no repositório", () => {
    const patches = Object.values(manifest.pnpm?.patchedDependencies ?? {});
    expect(patches.length).toBeGreaterThan(0);
    for (const patchPath of patches) {
      expect(existsSync(join(repositoryRoot, patchPath)), patchPath).toBe(true);
    }
  });
});

describe.each(dockerfileNames)("propagação de pnpm patches em %s", (dockerfileName) => {
  const dockerfile = readFileSync(join(repositoryRoot, dockerfileName), "utf8");
  const stages = stagesOf(dockerfile);

  it("copia patches/ antes de todo install congelado que consome o lockfile raiz", () => {
    for (const { name, body } of stages) {
      const frozenInstalls = [...body.matchAll(FROZEN_INSTALL)];
      if (frozenInstalls.length === 0) {
        continue;
      }
      const patchCopyIndex = body.indexOf("COPY patches");
      for (const install of frozenInstalls) {
        expect(
          patchCopyIndex,
          `${dockerfileName} estágio "${name}": roda install congelado sem "COPY patches ./patches" antes ` +
            `- pnpm.patchedDependencies (ex. extract-zip@2.0.1.patch) não estaria disponível e o install falharia com ENOENT`
        ).toBeGreaterThanOrEqual(0);
        expect(
          install.index!,
          `${dockerfileName} estágio "${name}": "COPY patches ./patches" precisa vir ANTES do install congelado, não depois`
        ).toBeGreaterThan(patchCopyIndex);
      }
    }
  });

  it("não leva patches/ para o estágio runtime final, quando existir um", () => {
    const runtimeStage = stages.find((stage) => stage.name === "runtime");
    if (!runtimeStage) {
      return;
    }
    expect(runtimeStage.body).not.toContain("COPY patches");
  });
});
