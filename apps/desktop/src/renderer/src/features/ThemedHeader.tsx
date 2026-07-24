import type { ReactNode } from "react";
import { useFeaturedChampion } from "./featured-champion-context";

interface ThemedHeaderProps {
  /** Rotulo pequeno acima do titulo (contexto da tela). */
  label: ReactNode;
  title: ReactNode;
  /** Conteudo opcional a direita (badges, acoes). */
  aside?: ReactNode;
}

/**
 * Cabecalho padrao das telas, com a splash art do tema atual ao fundo -
 * substitui o `page-header compact` (so texto) que cada tela repetia. A
 * arte vem do contexto, entao qualquer tela ganha a identidade do tema sem
 * precisar receber props extras.
 */
export function ThemedHeader({ label, title, aside }: ThemedHeaderProps) {
  const { splashUrl } = useFeaturedChampion();

  return (
    <header className="page-header themed" style={{ backgroundImage: `url(${splashUrl})` }}>
      <div className="themed-header-row">
        <div>
          <span>{label}</span>
          <h1>{title}</h1>
        </div>
        {aside}
      </div>
    </header>
  );
}
