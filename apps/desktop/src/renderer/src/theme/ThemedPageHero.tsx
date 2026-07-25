import type { ReactNode } from "react";
import { PageHero } from "../ui";
import { useFeaturedChampion } from "./featured-champion-context";

interface ThemedPageHeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  meta?: ReactNode;
  variant?: "compact" | "feature";
}

/**
 * Liga o `PageHero` (agnostico, do design system) a splash do tema atual.
 * Fica aqui e nao em `ui/` pra o design system nao depender do contexto de
 * tema - qualquer tela ganha a identidade da skin so trocando o import,
 * sem receber props extras.
 */
export function ThemedPageHero(props: ThemedPageHeroProps) {
  const { splashUrl } = useFeaturedChampion();
  return <PageHero {...props} artUrl={splashUrl} />;
}
