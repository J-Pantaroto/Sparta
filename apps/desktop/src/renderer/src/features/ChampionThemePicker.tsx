import { championSquareUrl } from "./datadragon";
import { useFeaturedChampion } from "./featured-champion-context";

/**
 * Seletor de campeao em destaque - troca a splash art usada no login e no
 * dashboard. So estetico por enquanto (ver featured-champion-context.tsx).
 */
export function ChampionThemePicker({ ddragonVersion }: { ddragonVersion: string }) {
  const { featuredChampion, setFeaturedChampionKey, options } = useFeaturedChampion();

  return (
    <div className="theme-picker">
      <span>Tema</span>
      <div className="theme-picker-grid">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`theme-picker-option${option.key === featuredChampion.key ? " active" : ""}`}
            onClick={() => setFeaturedChampionKey(option.key)}
            title={option.name}
          >
            <img className="champion-icon sm" src={championSquareUrl(option.key, ddragonVersion)} alt={option.name} />
          </button>
        ))}
      </div>
    </div>
  );
}
