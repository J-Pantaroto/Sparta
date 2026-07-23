interface LoadingProps {
  label?: string;
}

/**
 * Spinner CSS puro (sem lib de animacao) compartilhado por todas as telas -
 * antes cada uma reimplementava seu proprio `<p>Carregando...</p>` solto,
 * sem nenhum indicador visual de progresso (Fase 8b).
 */
export function Loading({ label = "Carregando..." }: LoadingProps) {
  return (
    <div className="loading-indicator">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
