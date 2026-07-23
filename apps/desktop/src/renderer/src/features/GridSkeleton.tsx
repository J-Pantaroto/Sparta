interface GridSkeletonProps {
  count?: number;
}

/**
 * Placeholder de shimmer pros grids de campeao/skin enquanto carregam -
 * antes disso o grid ficava vazio com so um texto "Carregando..." acima
 * (Fase 8b).
 */
export function GridSkeleton({ count = 24 }: GridSkeletonProps) {
  return (
    <div className="grid-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grid-skeleton-tile" />
      ))}
    </div>
  );
}
