import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

interface SignalChipProps {
  tone: "positive" | "negative";
  children: ReactNode;
  title?: string;
}

/**
 * Pill curta com icone (lucide-react, ja instalado) pra reasons/warnings
 * (Champion Select), strengths/weaknesses (Perfil, Pos-game) e tips -
 * substitui os paragrafos soltos com prefixo emoji (✓/⚠) usados ate a
 * Fase 8 por algo mais visual, consistente com o TrendCell da Evolucao.
 */
export function SignalChip({ tone, children, title }: SignalChipProps) {
  const Icon = tone === "positive" ? CheckCircle2 : AlertTriangle;
  return (
    <span className={`signal-chip ${tone}`} title={title}>
      <Icon size={13} />
      {children}
    </span>
  );
}
