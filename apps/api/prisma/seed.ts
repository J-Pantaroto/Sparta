import { PrismaClient } from "@prisma/client";
import {
  entryProvenance,
  parseChampionTagManifest,
  type ChampionTagManifestEntry,
  type ChampionTagManifestMetadata
} from "@sparta/core";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/prisma -> apps/api -> apps -> raiz do repo.
const SEED_FILE = path.join(__dirname, "..", "..", "..", "data", "seeds", "champion-tags.json");

/**
 * Le data/seeds/champion-tags.json e faz upsert de cada entrada. O arquivo
 * e gerado por `pnpm --filter @sparta/api champion-tags:generate` (deriva
 * os atributos das tags/notas da Data Dragon) e pode ser editado a mao -
 * dimensoes registradas em `review.overrides` sobrevivem a regeneracao.
 *
 * **O arquivo versionado e a unica fonte deste seed.** Nada aqui infere,
 * completa nem inventa: o que nao esta no manifesto nao chega ao banco.
 *
 * Desde a Etapa 8 o seed tambem persiste a proveniencia (versao da Data
 * Dragon, locale, recurso, versao do algoritmo, data de geracao, estado de
 * revisao e dimensoes revisadas). Arquivo no formato antigo (array plano,
 * sem metadados) continua funcionando: as colunas de proveniencia ficam
 * nulas, que e como o banco representa "origem nao informada" - nunca
 * "derivado" nem "revisado".
 *
 * O upsert e IDEMPOTENTE de verdade: linha ja igual nao e reescrita. A
 * comparacao usa os mesmos valores que seriam gravados, entao rodar duas
 * vezes seguidas reporta 0 escritas na segunda.
 */

/** Colunas de proveniencia derivadas do manifesto, ou nulas sem metadados. */
function provenanceColumns(entry: ChampionTagManifestEntry, metadata: ChampionTagManifestMetadata | undefined) {
  const provenance = entryProvenance(entry, metadata);
  if (!provenance) {
    return {
      dataDragonVersion: null,
      locale: null,
      sourceResource: null,
      algorithmVersion: null,
      generatedAt: null,
      reviewState: null,
      reviewedDimensions: [] as string[]
    };
  }

  return {
    dataDragonVersion: provenance.source.patch ?? null,
    locale: provenance.source.locale ?? null,
    sourceResource: provenance.source.resource ?? null,
    algorithmVersion: provenance.source.algorithmVersion ?? null,
    generatedAt: provenance.source.collectedAt ? new Date(provenance.source.collectedAt) : null,
    reviewState: provenance.reviewState,
    reviewedDimensions: [...provenance.reviewedDimensions]
  };
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function main() {
  const manifest = parseChampionTagManifest(JSON.parse(await readFile(SEED_FILE, "utf-8")));

  if (!manifest.metadata) {
    console.warn(
      "champion-tags.json sem metadados (formato antigo): a proveniencia sera gravada como nao informada. " +
        "Rode champion-tags:generate pra registrar versao da fonte e do algoritmo."
    );
  }

  let escritas = 0;
  let inalteradas = 0;

  for (const entry of manifest.champions) {
    /**
     * Garante que o `Champion` existe antes do `ChampionTag` (a FK exige).
     * O nome/`key` so sao definidos na criacao: quando o campeao ja veio do
     * `catalog:sync`, os dados de la (nome real, key da Data Dragon, versao)
     * sao melhores e nao devem ser sobrescritos pelo seed. `roles` e
     * atualizado apenas quando a entrada de fato traz rotas - a derivacao
     * automatica deixa o campo vazio de proposito (a Data Dragon nao publica
     * rota), e sobrescrever com `[]` apagaria curadoria existente.
     *
     * `version` vem do manifesto quando conhecido. A versao anterior gravava
     * a string fixa `"seed"`, que nao e versao de coisa nenhuma; sem
     * metadados o campo fica **nulo**, nao inventado.
     */
    await prisma.champion.upsert({
      where: { id: entry.championId },
      update: entry.roles.length > 0 ? { roles: entry.roles } : {},
      create: {
        id: entry.championId,
        key: entry.championName,
        name: entry.championName,
        roles: entry.roles,
        version: manifest.metadata?.dataDragonVersion ?? null
      }
    });

    const tag = {
      damageProfile: entry.damageProfile,
      tags: entry.tags,
      blindSafety: entry.blindSafety,
      difficulty: entry.difficulty,
      engage: entry.engage,
      peel: entry.peel,
      frontline: entry.frontline,
      pickoff: entry.pickoff,
      waveclear: entry.waveclear,
      scaling: entry.scaling,
      earlyPressure: entry.earlyPressure,
      ...provenanceColumns(entry, manifest.metadata)
    };

    const current = await prisma.championTag.findUnique({ where: { championId: entry.championId } });
    const igual =
      current !== null &&
      current.damageProfile === tag.damageProfile &&
      sameArray(current.tags, tag.tags) &&
      current.blindSafety === tag.blindSafety &&
      current.difficulty === tag.difficulty &&
      current.engage === tag.engage &&
      current.peel === tag.peel &&
      current.frontline === tag.frontline &&
      current.pickoff === tag.pickoff &&
      current.waveclear === tag.waveclear &&
      current.scaling === tag.scaling &&
      current.earlyPressure === tag.earlyPressure &&
      current.dataDragonVersion === tag.dataDragonVersion &&
      current.locale === tag.locale &&
      current.sourceResource === tag.sourceResource &&
      current.algorithmVersion === tag.algorithmVersion &&
      current.generatedAt?.getTime() === tag.generatedAt?.getTime() &&
      current.reviewState === tag.reviewState &&
      sameArray(current.reviewedDimensions, tag.reviewedDimensions);

    if (igual) {
      inalteradas += 1;
      continue;
    }

    await prisma.championTag.upsert({
      where: { championId: entry.championId },
      update: tag,
      create: { championId: entry.championId, ...tag }
    });
    escritas += 1;
  }

  const revisados = manifest.champions.filter((entry) => entry.review !== undefined).length;
  console.log(
    `Seed de ChampionTag concluido: ${manifest.champions.length} campeoes processados ` +
      `(${escritas} gravados, ${inalteradas} ja iguais, ${revisados} com dimensao revisada). ` +
      `Fonte: Data Dragon ${manifest.metadata?.dataDragonVersion ?? "(versao nao informada)"} / ` +
      `${manifest.metadata?.algorithmVersion ?? "(algoritmo nao informado)"}.`
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
