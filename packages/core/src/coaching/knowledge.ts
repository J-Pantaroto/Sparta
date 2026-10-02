import type { CoachingCategory, PatchKnowledge, PatchKnowledgeEntry } from "./contracts.js";

export const GENERIC_COACHING_KNOWLEDGE_VERSION = "league-generic/1.0.0";

export const GENERIC_COACHING_KNOWLEDGE: PatchKnowledgeEntry[] = [
  {
    id: "generic.vision.safe-window.v1",
    kind: "GENERIC_KNOWLEDGE",
    source: "SPARTA_REVIEWED_GUIDANCE",
    sourceRef: "internal-review:31O.1",
    reviewedAt: "2026-10-02",
    patchVersion: "generic",
    patchSensitive: false,
    categories: ["VISION"],
    statement:
      "Visao deve ser considerada somente quando houver margem segura; nao presume posicao inimiga."
  },
  {
    id: "generic.early.safety-margin.v1",
    kind: "GENERIC_KNOWLEDGE",
    source: "SPARTA_REVIEWED_GUIDANCE",
    sourceRef: "internal-review:31O.1",
    reviewedAt: "2026-10-02",
    patchVersion: "generic",
    patchSensitive: false,
    categories: ["EARLY_SAFETY"],
    statement:
      "No inicio, preservar margem de seguranca e uma opcao; o dado nao prova risco adversario."
  },
  {
    id: "generic.survivability.margin.v1",
    kind: "GENERIC_KNOWLEDGE",
    source: "SPARTA_REVIEWED_GUIDANCE",
    sourceRef: "internal-review:31O.1",
    reviewedAt: "2026-10-02",
    patchVersion: "generic",
    patchSensitive: false,
    categories: ["SURVIVABILITY"],
    statement:
      "Vida ou recurso baixos sustentam apenas uma lembranca de margem, nunca uma ordem ou previsao."
  },
  {
    id: "generic.farm.resources.v1",
    kind: "GENERIC_KNOWLEDGE",
    source: "SPARTA_REVIEWED_GUIDANCE",
    sourceRef: "internal-review:31O.1",
    reviewedAt: "2026-10-02",
    patchVersion: "generic",
    patchSensitive: false,
    categories: ["FARM_RESOURCES"],
    statement:
      "Farm e recursos proprios podem ser lembrados factualmente, sem comparar adversarios."
  }
];

export function buildPatchKnowledge(
  currentPatch: string | null,
  entries: PatchKnowledgeEntry[] = GENERIC_COACHING_KNOWLEDGE,
  allowedCategories: CoachingCategory[] = [
    "VISION",
    "EARLY_SAFETY",
    "SURVIVABILITY",
    "FARM_RESOURCES"
  ]
): PatchKnowledge {
  const filtered = entries.filter((entry) => {
    if (!entry.categories.some((category) => allowedCategories.includes(category))) return false;
    if (!entry.patchSensitive) return true;
    return currentPatch !== null && entry.patchVersion === currentPatch;
  });
  const sensitive = filtered.filter((entry) => entry.patchSensitive);
  return {
    version: GENERIC_COACHING_KNOWLEDGE_VERSION,
    currentPatch,
    patchMatch:
      sensitive.length === 0 || sensitive.every((entry) => entry.patchVersion === currentPatch),
    entries: filtered
  };
}
