import type { ReactNode } from "react";
import { PageHero } from "../ui";

interface ThemedPageHeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  meta?: ReactNode;
  variant?: "compact" | "feature";
}

/**
 * Variante usada pelas telas dentro do shell. A arte contextual agora vive
 * na camada ambiente unica de `AppShell`, atrás da composição inteira; não
 * é repetida como background de cada herói. O nome permanece para não
 * espalhar uma migração sem valor pelos consumidores existentes.
 */
export function ThemedPageHero(props: ThemedPageHeroProps) {
  return <PageHero {...props} />;
}
