import { describe, expect, it } from "vitest";
import { CHAMPION_CAPABILITY_KEYS } from "@sparta/core";
import { findChampionCapabilityProfile } from "./champion-capability-repository.js";

describe("manifesto real de capacidades", () => {
  it("carrega perfil completo com referências rastreáveis", async () => {
    const profile = await findChampionCapabilityProfile(61);

    expect(profile).toMatchObject({
      championId: 61,
      championKey: "Orianna",
      dataDragonVersion: "16.14.1",
      locale: "pt_BR",
      algorithmVersion: "champion-capability-extraction/1.0.0",
      status: "PARTIAL",
      totalCapabilities: CHAMPION_CAPABILITY_KEYS.length
    });
    expect(profile?.capabilities).toHaveLength(
      CHAMPION_CAPABILITY_KEYS.length
    );
    expect(
      profile?.capabilities.find((entry) => entry.key === "RANGE_PROFILE")
    ).toMatchObject({
      status: "AVAILABLE",
      value: 525,
      evidence: [
        {
          sourceType: "CHAMPION_METADATA",
          sourceId: "stats.attackrange",
          extractionRule: "RANGE_PROFILE_BASE_ATTACK_RANGE/v1"
        }
      ]
    });
  });

  it("campeão inexistente fica ausente sem fallback", async () => {
    await expect(findChampionCapabilityProfile(999999)).resolves.toBeUndefined();
  });
});
