import {
  buildChampionCapabilityManifest,
  extractChampionCapabilityProfile,
  parseChampionCapabilityManifest,
  serializeChampionCapabilityManifest,
  type ChampionCapabilityManifest
} from "@sparta/core";
import {
  fetchDataDragonChampionDetails,
  fetchDataDragonChampions,
  fetchDataDragonVersions
} from "@sparta/riot";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCALE = "pt_BR";
const FETCH_CONCURRENCY = 8;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(
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

async function readExistingManifest(): Promise<
  ChampionCapabilityManifest | undefined
> {
  try {
    return parseChampionCapabilityManifest(
      JSON.parse(await readFile(SEED_FILE, "utf-8"))
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      result[index] = await mapper(values[index]!);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker()
    )
  );
  return result;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const [version] = await fetchDataDragonVersions();
  if (!version) throw new Error("Data Dragon não informou versão atual.");

  const catalog = await fetchDataDragonChampions(version, LOCALE);
  const details = await mapWithConcurrency(
    [...catalog].sort((left, right) => Number(left.key) - Number(right.key)),
    FETCH_CONCURRENCY,
    async (champion) => {
      const detail = await fetchDataDragonChampionDetails(
        version,
        champion.id,
        LOCALE
      );
      if (detail.id !== champion.id || detail.key !== champion.key) {
        throw new Error(
          `Detalhe divergente para ${champion.id}: recebido ${detail.id}/${detail.key}.`
        );
      }
      return detail;
    }
  );
  if (details.length !== catalog.length) {
    throw new Error(
      `Catálogo incompleto: ${details.length} detalhes para ${catalog.length} campeões.`
    );
  }

  const profiles = details.map((champion) =>
    extractChampionCapabilityProfile({
      championId: Number(champion.key),
      championKey: champion.id,
      championName: champion.name,
      dataDragonVersion: version,
      locale: LOCALE,
      passive: champion.passive,
      spells: champion.spells,
      attackRange: champion.stats?.attackrange
    })
  );
  const previous = await readExistingManifest();
  const { manifest, report } = buildChampionCapabilityManifest({
    profiles,
    dataDragonVersion: version,
    locale: LOCALE,
    now: new Date().toISOString(),
    previous
  });

  if (report.validationIssues.length > 0) {
    for (const issue of report.validationIssues.slice(0, 20)) {
      console.error(
        `Perfil inválido: campeão ${issue.championId ?? "?"} ` +
          `${issue.key ?? "perfil"} — ${issue.problem}`
      );
    }
    throw new Error(
      `${report.validationIssues.length} inconsistência(s); nada foi gravado.`
    );
  }

  if (checkOnly) {
    if (!previous || !report.unchanged) {
      console.error(
        "champion-capabilities.json está ausente ou desatualizado. " +
          "Rode champion-capabilities:generate."
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `champion-capabilities.json atualizado (${profiles.length} campeões, ` +
        `Data Dragon ${version}, ${manifest.metadata.algorithmVersion}).`
    );
    return;
  }

  if (previous && report.unchanged) {
    console.log(
      `Nenhuma alteração funcional em ${profiles.length} perfis; arquivo preservado.`
    );
    return;
  }
  await writeFile(
    SEED_FILE,
    serializeChampionCapabilityManifest(manifest),
    "utf-8"
  );
  console.log(
    `Manifesto gravado: ${profiles.length} campeões, Data Dragon ${version}, ` +
      `${manifest.metadata.algorithmVersion}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
