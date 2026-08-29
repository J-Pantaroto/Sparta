import {
  Activity,
  BarChart3,
  Crosshair,
  Gauge,
  History,
  FlaskConical,
  ListChecks,
  Radio,
  Settings,
  Shield,
  TrendingUp,
  UserRound,
  type LucideIcon
} from "lucide-react";

export type Page =
  | "dashboard"
  | "profile"
  | "select"
  | "pregame"
  | "postgame"
  | "drafts"
  | "growth"
  | "motor"
  | "calibration"
  | "live-diagnostics"
  | "account"
  | "settings";

export interface NavEntry {
  page: Page;
  label: string;
  icon: LucideIcon;
  description: string;
  developmentOnly?: boolean;
}

/**
 * Navegacao agrupada por MOMENTO DE USO, nao por ordem de implementacao:
 * o que o jogador consulta a frio (analise), o que ele usa em volta de uma
 * partida (preparacao e revisao) e o que configura uma vez (app). Antes era
 * uma lista unica de 7 itens sem nenhuma separacao.
 */
export const navGroups: { label: string; items: NavEntry[] }[] = [
  {
    label: "Visão geral",
    items: [
      {
        page: "dashboard",
        label: "Dashboard",
        icon: Gauge,
        description: "Resumo do jogador, dados e ações principais"
      },
      {
        page: "profile",
        label: "Perfil",
        icon: Activity,
        description: "Índices, tendências e histórico pessoal"
      }
    ]
  },
  {
    label: "Análise",
    items: [
      {
        page: "select",
        label: "Champion Select",
        icon: Crosshair,
        description: "Recomendações durante a seleção"
      },
      {
        page: "drafts",
        label: "Histórico de drafts",
        icon: History,
        description: "Decisões e snapshots preservados"
      },
      {
        page: "pregame",
        label: "Pré-game",
        icon: Shield,
        description: "Leitura estratégica do draft atual"
      },
      {
        page: "postgame",
        label: "Partidas e pós-game",
        icon: BarChart3,
        description: "Partidas recentes e comparações disponíveis"
      }
    ]
  },
  {
    label: "Evolução",
    items: [
      {
        page: "growth",
        label: "Evolução pessoal",
        icon: TrendingUp,
        description: "Mudanças observadas no próprio histórico"
      },
      {
        page: "motor",
        label: "Histórico do motor",
        icon: ListChecks,
        description: "Relatórios longitudinais do motor"
      },
      {
        page: "calibration",
        label: "Laboratório",
        icon: FlaskConical,
        description: "Ambiente controlado de calibração",
        developmentOnly: true
      },
      {
        page: "live-diagnostics",
        label: "Observação ao vivo",
        icon: Radio,
        description: "Diagnóstico da fundação Live Client (protótipo local)",
        developmentOnly: true
      }
    ]
  },
  {
    label: "Conta",
    items: [
      {
        page: "settings",
        label: "Configurações",
        icon: Settings,
        description: "Tema, densidade e análise"
      },
      {
        page: "account",
        label: "Conta e segurança",
        icon: UserRound,
        description: "Email, vínculo Riot e sessões"
      }
    ]
  }
];

export const pageContext: Record<Page, { title: string; description: string }> = Object.fromEntries(
  navGroups.flatMap((group) =>
    group.items.map((item) => [item.page, { title: item.label, description: item.description }])
  )
) as Record<Page, { title: string; description: string }>;
