import { useState } from "react";
import { ChampionGridPicker } from "./ChampionGridPicker";
import {
  championSplashUrl,
  communityDragonSplashUrl,
  fetchChampionSkins,
  type DataDragonChampionSummary,
  type DataDragonSkin
} from "./datadragon";
import { useFeaturedChampion } from "./featured-champion-context";
import { GridSkeleton } from "./GridSkeleton";
import { SkinSplash } from "./SkinSplash";
import { useAsyncData } from "./use-async-data";

interface ChampionSkinPickerProps {
  ddragonVersion: string;
}

/**
 * Fluxo de 2 passos pra escolher o tema visual: qualquer campeao -> qualquer
 * skin dele (base ou nao). Splash art vem da Data Dragon, com Community
 * Dragon como fallback quando aquela skin especifica nao existe la (skins
 * muito novas, chromas) ou a CDN esta indisponivel.
 */
export function ChampionSkinPicker({ ddragonVersion }: ChampionSkinPickerProps) {
  const { featuredChampion, setFeaturedChampion } = useFeaturedChampion();
  const [selectedChampion, setSelectedChampion] = useState<DataDragonChampionSummary | null>(null);
  const [downloadingSkin, setDownloadingSkin] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const skins = useAsyncData<DataDragonSkin[]>(
    () => (selectedChampion ? fetchChampionSkins(selectedChampion.key, ddragonVersion) : undefined),
    [selectedChampion?.key, ddragonVersion]
  );

  function applySkin(champion: DataDragonChampionSummary, skin: DataDragonSkin) {
    // Aplicar sem baixar volta pra CDN (localSplashPath undefined) - o tema
    // funciona online; "Baixar" e o que garante funcionar offline depois.
    setFeaturedChampion({ key: champion.key, name: champion.name, skinIndex: skin.num, skinName: skin.name });
  }

  async function downloadSkin(champion: DataDragonChampionSummary, skin: DataDragonSkin) {
    if (!window.sparta?.downloadSkin) {
      setDownloadError("Download disponível apenas no aplicativo desktop.");
      return;
    }
    setDownloadingSkin(skin.num);
    setDownloadError(null);
    const fileName = `${champion.key}_${skin.num}.jpg`;
    try {
      let localUrl: string;
      try {
        localUrl = await window.sparta.downloadSkin(championSplashUrl(champion.key, skin.num), fileName);
      } catch (primaryError) {
        // Data Dragon nao tem essa arte (ou caiu) - tenta a Community Dragon
        // antes de reportar erro pro usuario.
        const fallbackUrl = await communityDragonSplashUrl(champion.id, skin.num);
        if (!fallbackUrl) throw primaryError;
        localUrl = await window.sparta.downloadSkin(fallbackUrl, fileName);
      }
      setFeaturedChampion({
        key: champion.key,
        name: champion.name,
        skinIndex: skin.num,
        skinName: skin.name,
        // Data URL devolvido pelo main - `file://` nao carrega no renderer
        // por seguranca do Electron.
        localSplashPath: localUrl
      });
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Não foi possível baixar a skin.");
    } finally {
      setDownloadingSkin(null);
    }
  }

  return (
    <div className="panel wide">
      <h2>Tema</h2>
      <p>
        Atual: {featuredChampion.name} - {featuredChampion.skinName}
        {featuredChampion.localSplashPath ? " (baixada, funciona offline)" : ""}
      </p>

      {!selectedChampion && (
        <ChampionGridPicker ddragonVersion={ddragonVersion} onSelect={setSelectedChampion} />
      )}

      {selectedChampion && (
        <>
          <button type="button" className="btn-secondary" onClick={() => setSelectedChampion(null)}>
            ← Voltar pra lista de campeões
          </button>
          <h3>{selectedChampion.name}</h3>
          {downloadError && <p className="auth-error">{downloadError}</p>}
          {skins.status === "loading" && <GridSkeleton count={6} />}
          <div className="theme-picker-grid">
            {(skins.data ?? []).map((skin) => {
              const isActive = featuredChampion.key === selectedChampion.key && featuredChampion.skinIndex === skin.num;
              return (
                <div key={skin.num} className={`skin-picker-card${isActive ? " active" : ""}`}>
                  <SkinSplash
                    championKey={selectedChampion.key}
                    championId={selectedChampion.id}
                    skinNum={skin.num}
                    ddragonVersion={ddragonVersion}
                    alt={skin.name}
                    onClick={() => applySkin(selectedChampion, skin)}
                  />
                  <span>{skin.num === 0 ? selectedChampion.name : skin.name}</span>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={downloadingSkin === skin.num}
                    onClick={() => void downloadSkin(selectedChampion, skin)}
                  >
                    {downloadingSkin === skin.num ? "Baixando..." : "Baixar"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
