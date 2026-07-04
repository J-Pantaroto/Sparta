import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function extractFirstGitUrl(content: string): string | null {
  const match = content.match(/(?:https:\/\/github\.com\/[^\s]+?\.git|git@github\.com:[^\s]+?\.git)/i);
  return match?.[0] ?? null;
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function configureGitRemote(root = process.cwd()): string {
  const gitTxt = resolve(root, "git.txt");
  if (!existsSync(gitTxt)) throw new Error("git.txt não encontrado na raiz do projeto.");

  const url = extractFirstGitUrl(readFileSync(gitTxt, "utf8"));
  if (!url) throw new Error("Nenhuma URL GitHub válida encontrada em git.txt.");

  try {
    run("git", ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    run("git", ["init"]);
  }

  run("git", ["branch", "-M", "main"]);

  let currentOrigin = "";
  try {
    currentOrigin = run("git", ["remote", "get-url", "origin"]);
  } catch {
    run("git", ["remote", "add", "origin", url]);
  }

  if (currentOrigin && currentOrigin !== url) {
    console.log(`Atualizando origin: ${currentOrigin} -> ${url}`);
    run("git", ["remote", "set-url", "origin", url]);
  }

  console.log(run("git", ["status", "--short", "--branch"]));
  return url;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const url = configureGitRemote();
  console.log(`origin configurado: ${url}`);
}
