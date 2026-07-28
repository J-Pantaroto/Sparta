import {
  parseChampionCapabilityManifest,
  type ChampionCapabilityManifest,
  type ChampionCapabilityProfile
} from "@sparta/core";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_FILE = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "data",
  "seeds",
  "champion-capabilities.json"
);

export function findCapabilityProfileInManifest(
  manifest: ChampionCapabilityManifest,
  championId: number
): ChampionCapabilityProfile | undefined {
  return manifest.profiles.find((profile) => profile.championId === championId);
}

/**
 * Consulta técnica ao manifesto versionado. Arquivo ausente representa
 * catálogo antigo ainda sem a Etapa 14; não quebra rotas existentes.
 */
export async function findChampionCapabilityProfile(
  championId: number
): Promise<ChampionCapabilityProfile | undefined> {
  return (await findAllChampionCapabilityProfiles()).find(
    (profile) => profile.championId === championId
  );
}

/**
 * Carrega o snapshot inteiro uma vez por operação de draft. Ranking e
 * pré-game recebem exatamente os mesmos perfis versionados.
 */
export async function findAllChampionCapabilityProfiles(): Promise<ChampionCapabilityProfile[]> {
  let raw: string;
  try {
    raw = await readFile(MANIFEST_FILE, "utf-8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return parseChampionCapabilityManifest(JSON.parse(raw)).profiles;
}
