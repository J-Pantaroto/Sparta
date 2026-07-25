import { useState, type CSSProperties, type ReactNode } from "react";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchAllChampions, type DataDragonChampionSummary } from "../services/datadragon";
import { ChampionAvatar } from "./ChampionAvatar";
import { SearchInput } from "./Field";
import { EmptyState, ErrorState, SkeletonGrid } from "./States";
import "./ChampionGrid.css";

interface ChampionGridProps {
  ddragonVersion: string;
  onSelect: (champion: DataDragonChampionSummary) => void;
  isSelected?: (champion: DataDragonChampionSummary) => boolean;
  isDisabled?: (champion: DataDragonChampionSummary) => boolean;
  searchPlaceholder?: string;
  /** Altura maxima da grade (ela rola por dentro). */
  maxHeight?: string;
  /** Conteudo extra na barra de ferramentas (contador, acoes). */
  toolbarExtra?: ReactNode;
}

/**
 * Busca + grade de selecao de campeao, compartilhada pelo seletor de time
 * inimigo e pela galeria de temas. "Selecionar" e generico de proposito:
 * quem chama decide o que o clique significa.
 *
 * A grade rola por dentro (altura limitada) - com ~170 campeoes, deixar
 * ela crescer livremente empurrava o resto da tela pra fora da janela.
 */
export function ChampionGrid({
  ddragonVersion,
  onSelect,
  isSelected,
  isDisabled,
  searchPlaceholder,
  maxHeight,
  toolbarExtra
}: ChampionGridProps) {
  const [search, setSearch] = useState("");
  const champions = useAsyncData<DataDragonChampionSummary[]>(
    () => fetchAllChampions(ddragonVersion),
    [ddragonVersion]
  );

  const term = search.trim().toLowerCase();
  const filtered = (champions.data ?? []).filter((champion) => champion.name.toLowerCase().includes(term));

  return (
    <div className="sp-champgrid">
      <div className="sp-champgrid__toolbar">
        <div className="sp-champgrid__search">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={searchPlaceholder ?? "Buscar campeão..."}
            ariaLabel="Buscar campeão"
          />
        </div>
        {toolbarExtra ?? (
          champions.data && <span className="sp-champgrid__count">{filtered.length} campeões</span>
        )}
      </div>

      {champions.status === "error" && <ErrorState inline description={champions.error ?? undefined} />}
      {champions.status === "loading" && <SkeletonGrid count={28} size={40} />}

      {champions.data && filtered.length === 0 && (
        <EmptyState inline title="Nenhum campeão encontrado" description={`Nada corresponde a "${search}".`} />
      )}

      {filtered.length > 0 && (
        <div
          className="sp-champgrid__list"
          style={maxHeight ? ({ ["--sp-champgrid-height" as string]: maxHeight } as CSSProperties) : undefined}
        >
          {filtered.map((champion) => {
            const active = isSelected?.(champion) ?? false;
            const disabled = (isDisabled?.(champion) ?? false) && !active;
            return (
              <button
                key={champion.key}
                type="button"
                className="sp-champgrid__option"
                onClick={() => onSelect(champion)}
                disabled={disabled}
                aria-pressed={isSelected ? active : undefined}
                title={champion.name}
              >
                <ChampionAvatar
                  championId={champion.id}
                  slug={champion.key}
                  ddragonVersion={ddragonVersion}
                  size="md"
                  alt={champion.name}
                  ring={active}
                  muted={disabled}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
