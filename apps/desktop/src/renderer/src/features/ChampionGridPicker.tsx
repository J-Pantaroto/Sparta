import { useState } from "react";
import { championSquareUrl, fetchAllChampions, type DataDragonChampionSummary } from "./datadragon";
import { GridSkeleton } from "./GridSkeleton";
import { useAsyncData } from "./use-async-data";

interface ChampionGridPickerProps {
  ddragonVersion: string;
  onSelect: (champion: DataDragonChampionSummary) => void;
  isSelected?: (champion: DataDragonChampionSummary) => boolean;
  isDisabled?: (champion: DataDragonChampionSummary) => boolean;
  searchPlaceholder?: string;
}

/**
 * Grid de busca + selecao de campeao, extraido do passo 1 do
 * `ChampionSkinPicker` (Fase 6a) pra ser reaproveitado tambem pelo seletor
 * de time inimigo do Champion Select (Fase 8a) - mesmo padrao visual,
 * mesma fonte de dado (`fetchAllChampions`, direto da Data Dragon).
 * "Selecionar" e generico de proposito: o chamador decide o que clicar
 * significa (navegar pro proximo passo, alternar num array de ate 5, etc).
 */
export function ChampionGridPicker({ ddragonVersion, onSelect, isSelected, isDisabled, searchPlaceholder }: ChampionGridPickerProps) {
  const [search, setSearch] = useState("");
  const champions = useAsyncData<DataDragonChampionSummary[]>(() => fetchAllChampions(ddragonVersion), [ddragonVersion]);

  const filteredChampions = (champions.data ?? []).filter((champion) =>
    champion.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="champion-grid-picker">
      <input
        type="text"
        placeholder={searchPlaceholder ?? "Buscar campeão..."}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {champions.status === "error" && <p>{champions.error}</p>}
      {champions.status === "loading" && <GridSkeleton />}
      <div className="theme-picker-grid">
        {filteredChampions.map((champion) => {
          const active = isSelected?.(champion) ?? false;
          const disabled = (isDisabled?.(champion) ?? false) && !active;
          return (
            <button
              key={champion.key}
              type="button"
              className={`theme-picker-option${active ? " active" : ""}`}
              onClick={() => onSelect(champion)}
              disabled={disabled}
              title={champion.name}
            >
              <img className="champion-icon sm" src={championSquareUrl(champion.key, ddragonVersion)} alt={champion.name} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
