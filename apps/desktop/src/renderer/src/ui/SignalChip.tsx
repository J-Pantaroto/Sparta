import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import "./SignalChip.css";

type ChipTone = "positive" | "negative" | "info";

interface SignalChipProps {
  tone: ChipTone;
  children: ReactNode;
  title?: string;
  /** Compacto e arredondado - pra rotulo curto, nao pra frase explicativa. */
  pill?: boolean;
}

const icons: Record<ChipTone, typeof CheckCircle2> = {
  positive: CheckCircle2,
  negative: AlertTriangle,
  info: Info
};

/**
 * Sinal de leitura rapida (ponto forte, alerta, razao de recomendacao).
 * A cor e sempre semantica - nunca a do tema -, senao "bom" e "ruim"
 * mudariam de cor a cada skin.
 */
export function SignalChip({ tone, children, title, pill = false }: SignalChipProps) {
  const Icon = icons[tone];
  return (
    <span className={`sp-chip sp-chip--${tone}${pill ? " sp-chip--pill" : ""}`} title={title}>
      <Icon className="sp-chip__icon" size={pill ? 12 : 14} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

/** Agrupador dos chips. `stacked` empilha (frases), padrao flui em linha. */
export function SignalChipList({ children, stacked = false }: { children: ReactNode; stacked?: boolean }) {
  return <div className={`sp-chip-list${stacked ? " sp-chip-list--stacked" : ""}`}>{children}</div>;
}
