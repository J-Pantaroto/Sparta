import { useState } from "react";
import {
  championSplashUrl,
  championSquareUrl,
  fetchAllChampions,
  fetchChampionSkins,
  type DataDragonChampionSummary,
  type DataDragonSkin
} from "./datadragon";
import { useFeaturedChampion } from "./featured-champion-context";
import { useAsyncData } from "./use-async-data";

interface ChampionSkinPickerProps {
  ddragonVersion: string;
}

/**
 * Fluxo de 2 passos pra escolher o tema visual: qualquer campeao -> qualquer
 * skin dele (base ou nao). Substitui a lista curada fixa de 12 campeoes que
 * existia antes. Lista de campeoes/skins vem direto da CDN publica da Data
 * Dragon (mesmo padrao de championSquareUrl/championSplashUrl), sem
 * nenhuma rota nova no backend Sparta.
 */
export function ChampionSkinPicker({ ddragonVersion }: ChampionSkinPickerProps) {
  const { featuredChampion, setFeaturedChampion } = useFeaturedChampion();
  const [search, setSearch] = useState("");
  const [selectedChampion, setSelectedChampion] = useState<DataDragonChampionSummary | null>(null);
  const [downloadingSkin, setDownloadingSkin] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const champions = useAsyncData<DataDragonChampionSummary[]>(() => fetchAllChampions(ddragonVersion), [ddragonVersion]);
  const skins = useAsyncData<DataDragonSkin[]>(
    () => (selectedChampion ? fetchChampionSkins(selectedChampion.key, ddragonVersion) : undefined),
    [selectedChampion?.key, ddragonVersion]
  );

  const filteredChampions = (champions.data ?? []).filter((champion) =>
    champion.name.toLowerCase().includes(search.toLowerCase())
  );

  function applySkin(champion: DataDragonChampionSummary, skin: DataDragonSkin) {
    setFeaturedChampion({ key: champion.key, name: champion.name, skinIndex: skin.num, skinName: skin.name });
  }

  async function downloadSkin(champion: DataDragonChampionSummary, skin: DataDragonSkin) {
    if (!window.sparta?.downloadSkin) return;
    setDownloadingSkin(skin.num);
    setDownloadError(null);
    try {
      const url = championSplashUrl(champion.key, skin.num);
      const localPath = await window.sparta.downloadSkin(url, `${champion.key}_${skin.num}.jpg`);
      setFeaturedChampion({
        key: champion.key,
        name: champion.name,
        skinIndex: skin.num,
        skinName: skin.name,
        localSplashPath: `file://${localPath}`
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
        <>
          <input
            type="text"
            placeholder="Buscar campeão..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {champions.status === "loading" && <p>Carregando campeões...</p>}
          {champions.status === "error" && <p>{champions.error}</p>}
          <div className="theme-picker-grid">
            {filteredChampions.map((champion) => (
              <button
                key={champion.key}
                type="button"
                className="theme-picker-option"
                onClick={() => setSelectedChampion(champion)}
                title={champion.name}
              >
                <img className="champion-icon sm" src={championSquareUrl(champion.key, ddragonVersion)} alt={champion.name} />
              </button>
            ))}
          </div>
        </>
      )}

      {selectedChampion && (
        <>
          <button type="button" onClick={() => setSelectedChampion(null)}>
            ← Voltar pra lista de campeões
          </button>
          <h3>{selectedChampion.name}</h3>
          {skins.status === "loading" && <p>Carregando skins...</p>}
          {downloadError && <p>{downloadError}</p>}
          <div className="theme-picker-grid">
            {(skins.data ?? []).map((skin) => {
              const isActive = featuredChampion.key === selectedChampion.key && featuredChampion.skinIndex === skin.num;
              return (
                <div key={skin.num} className={`theme-picker-option${isActive ? " active" : ""}`}>
                  <img
                    className="champion-icon"
                    src={championSplashUrl(selectedChampion.key, skin.num)}
                    alt={skin.name}
                    onClick={() => applySkin(selectedChampion, skin)}
                    style={{ cursor: "pointer" }}
                  />
                  <span>{skin.num === 0 ? selectedChampion.name : skin.name}</span>
                  <button
                    type="button"
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
