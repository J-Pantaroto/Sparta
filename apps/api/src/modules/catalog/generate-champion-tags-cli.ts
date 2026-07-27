import {
  buildChampionTagManifest,
  CHAMPION_TAG_DERIVATION_VERSION,
  deriveChampionTag,
  parseChampionTagManifest,
  serializeChampionTagManifest,
  type ChampionClassProfile,
  type ChampionTagManifest
} from "@sparta/core";
import { fetchDataDragonChampions, fetchDataDragonVersions } from "@sparta/riot";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regenera `data/seeds/champion-tags.json` cobrindo todos os campeoes,
 * derivando os atributos de gameplay das tags/notas da Data Dragon
 * (`deriveChampionTag`, em @sparta/core).
 *
 * O arquivo continua versionado no git de proposito: assim o resultado da
 * derivacao e revisavel num diff, e nao um efeito colateral invisivel de
 * rodar o seed. Desde a Etapa 8 ele e um **manifesto** com metadados
 * (versao real da Data Dragon, locale, recurso, versao do algoritmo, data
 * de geracao) em vez de um array plano sem origem nenhuma.
 *
 * Curadoria e preservada **por dimensao**: uma entrada com
 * `review.overrides.pickoff` mantem `pickoff` e recebe a derivacao
 * atualizada nas outras oito. O formato anterior preservava a entrada
 * inteira por `source: "manual"`, o que congelava dimensoes que ninguem
 * tinha revisado.
 *
 *   pnpm --filter @sparta/api champion-tags:generate
 *   pnpm --filter @sparta/api champion-tags:check
 *
 * O modo `--check` **nao escreve**: compara o arquivo com a fonte atual e
 * sai com codigo 1 quando ele esta desatualizado. Serve pra saber se vale
 * regenerar sem produzir um diff so pra descobrir.
 */

const LOCALE = "pt_BR";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/src/modules/catalog -> ... -> raiz do repo
const SEED_FILE = path.join(__dirname, "..", "..", "..", "..", "..", "data", "seeds", "champion-tags.json");

async function readExistingManifest(): Promise<ChampionTagManifest> {
  try {
    return parseChampionTagManifest(JSON.parse(await readFile(SEED_FILE, "utf-8")));
  } catch {
    return { champions: [] };
  }
}

async function main() {
  const checkOnly = process.argv.includes("--check");

  const [version] = await fetchDataDragonVersions();
  const champions = await fetchDataDragonChampions(version, LOCALE);

  const profiles: ChampionClassProfile[] = champions
    // Sem `info` nao ha o que derivar: melhor deixar o campeao de fora (o
    // motor ja trata ausencia de tag) do que gravar um perfil chutado.
    .filter((champion) => champion.info !== undefined)
    .map((champion) => ({
      championId: Number(champion.key),
      championName: champion.name,
      tags: champion.tags,
      attack: champion.info!.attack,
      defense: champion.info!.defense,
      magic: champion.info!.magic,
      difficulty: champion.info!.difficulty
    }));

  const previous = await readExistingManifest();
  const { manifest, report } = buildChampionTagManifest({
    derived: profiles.map(deriveChampionTag),
    previous,
    dataDragonVersion: version,
    locale: LOCALE,
    now: new Date().toISOString()
  });

  if (report.validationIssues.length > 0) {
    for (const issue of report.validationIssues) {
      console.error(`Dimensao invalida: ${issue.championName} (${issue.championId}) ${issue.dimension} ${issue.problem}`);
    }
    throw new Error(`${report.validationIssues.length} dimensao(oes) fora do contrato - nada foi gravado.`);
  }

  for (const edit of report.unregisteredEdits) {
    console.warn(
      `Aviso: ${edit.championName}.${edit.dimension} difere do valor derivado sem override registrado - ` +
        `sera devolvido ao valor derivado. Registre em "review.overrides" pra preservar.`
    );
  }
  if (report.added.length > 0) console.log(`Campeoes novos na fonte: ${report.added.join(", ")}`);
  if (report.removed.length > 0) console.log(`Campeoes que sumiram da fonte: ${report.removed.join(", ")}`);
  if (champions.length !== profiles.length) {
    console.warn(`${champions.length - profiles.length} campeoes ficaram de fora por nao trazerem "info".`);
  }

  // Arquivo sem metadados (formato antigo) conta como desatualizado: nao da
  // pra afirmar de que versao ele veio.
  const desatualizado = !report.unchanged || previous.metadata === undefined;

  if (checkOnly) {
    if (desatualizado) {
      console.error(
        `champion-tags.json esta desatualizado. Arquivo: Data Dragon ` +
          `${previous.metadata?.dataDragonVersion ?? "(ausente)"} / algoritmo ` +
          `${previous.metadata?.algorithmVersion ?? "(ausente)"}. Fonte atual: ${version} / ` +
          `${CHAMPION_TAG_DERIVATION_VERSION}. Rode champion-tags:generate.`
      );
      process.exitCode = 1;
      return;
    }
    console.log(`champion-tags.json atualizado (Data Dragon ${version}, ${CHAMPION_TAG_DERIVATION_VERSION}).`);
    return;
  }

  await writeFile(SEED_FILE, serializeChampionTagManifest(manifest), "utf-8");

  console.log(
    `champion-tags.json regenerado a partir da versao ${version} (${CHAMPION_TAG_DERIVATION_VERSION}): ` +
      `${manifest.champions.length} campeoes, ${report.championsWithOverrides} com curadoria ` +
      `(${report.preservedOverrides} dimensao(oes) preservada(s)).` +
      (report.unchanged ? " Nada funcional mudou - a data de geracao foi mantida." : "")
  );
}

main().catch((error) => {
  console.error("Falha ao gerar champion-tags.json:", error);
  process.exitCode = 1;
});
