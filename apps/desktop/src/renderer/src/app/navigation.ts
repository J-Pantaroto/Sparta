import { Activity, BarChart3, Crosshair, Gauge, Settings, Shield, TrendingUp, type LucideIcon } from "lucide-react";

export type Page = "dashboard" | "profile" | "select" | "pregame" | "postgame" | "growth" | "settings";

interface NavEntry {
  page: Page;
  label: string;
  icon: LucideIcon;
}

/**
 * Navegacao agrupada por MOMENTO DE USO, nao por ordem de implementacao:
 * o que o jogador consulta a frio (analise), o que ele usa em volta de uma
 * partida (preparacao e revisao) e o que configura uma vez (app). Antes era
 * uma lista unica de 7 itens sem nenhuma separacao.
 */
export const navGroups: { label: string; items: NavEntry[] }[] = [
  {
    label: "Análise",
    items: [
      { page: "dashboard", label: "Dashboard", icon: Gauge },
      { page: "profile", label: "Perfil", icon: Activity },
      { page: "growth", label: "Evolução", icon: TrendingUp }
    ]
  },
  {
    label: "Partida",
    items: [
      { page: "select", label: "Champion Select", icon: Crosshair },
      { page: "pregame", label: "Pré-game", icon: Shield },
      { page: "postgame", label: "Pós-game", icon: BarChart3 }
    ]
  },
  {
    label: "App",
    items: [{ page: "settings", label: "Configurações", icon: Settings }]
  }
];
