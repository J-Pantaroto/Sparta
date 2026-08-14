import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dockerfile = readFileSync(join(repositoryRoot, "Dockerfile.api"), "utf8");
const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as {
  pnpm?: { patchedDependencies?: Record<string, string> };
};

function stage(name: string): string {
  const marker = ` AS ${name}`;
  const start = dockerfile.indexOf(marker);
  expect(start, `estágio ${name} deve existir`).toBeGreaterThanOrEqual(0);
  const next = dockerfile.indexOf("\nFROM ", start + marker.length);
  return dockerfile.slice(start, next === -1 ? undefined : next);
}

describe("propagação de pnpm patches no Docker da API", () => {
  it("mantém todos os patch sources registrados e versionados", () => {
    const patches = Object.values(manifest.pnpm?.patchedDependencies ?? {});
    expect(patches.length).toBeGreaterThan(0);
    for (const patchPath of patches) {
      expect(existsSync(join(repositoryRoot, patchPath)), patchPath).toBe(true);
    }
  });

  it("copia patches antes de cada install congelado que pode aplicá-los", () => {
    for (const stageName of ["deps", "build"]) {
      const contents = stage(stageName);
      const patchCopy = contents.indexOf("COPY patches ./patches");
      const frozenInstall = contents.indexOf("pnpm install --frozen-lockfile");
      expect(patchCopy, `${stageName} precisa copiar patches`).toBeGreaterThanOrEqual(0);
      expect(frozenInstall, `${stageName} precisa instalar com lockfile`).toBeGreaterThan(
        patchCopy
      );
    }
  });

  it("não leva os patch sources para a imagem final", () => {
    expect(stage("runtime")).not.toContain("COPY patches");
  });
});
