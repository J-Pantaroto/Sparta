import { HelpCircle } from "lucide-react";
import { useId, type ReactNode } from "react";
import "./Tooltip.css";

interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
}

/**
 * Explicacao curta ancorada num elemento. Aparece no hover e no foco por
 * teclado (`:focus-within`), ligada por `aria-describedby` - um tooltip so
 * de mouse esconde a informacao de quem navega por Tab.
 */
export function Tooltip({ label, children }: TooltipProps) {
  const id = useId();
  return (
    <span className="sp-tooltip">
      <span aria-describedby={id}>{children}</span>
      <span role="tooltip" id={id} className="sp-tooltip__bubble">
        {label}
      </span>
    </span>
  );
}

/** Icone "?" com explicacao - pra rotulo cujo significado nao e obvio. */
export function InfoHint({ label }: { label: ReactNode }) {
  return (
    <Tooltip label={label}>
      <button type="button" className="sp-tooltip__trigger" aria-label="Mais informações">
        <HelpCircle size={13} />
      </button>
    </Tooltip>
  );
}
