/**
 * Design system do Sparta - fonte unica dos componentes e tokens visuais.
 *
 * Mora aqui (e nao em `packages/ui`) porque aquele pacote nao tem pipeline
 * de CSS e nao tem outro consumidor possivel: API e analyzer nao renderizam
 * UI. Colocar os componentes la separaria o CSS do TSX e dividiria a fonte
 * de verdade em vez de unifica-la.
 *
 * Convencoes:
 * - Toda classe usa o prefixo `sp-` e nomeia o proprio bloco (`sp-card`,
 *   `sp-card__header`, `sp-card--feature`). Nunca estilizar elemento
 *   descendente generico (`.card span`) - foi a causa raiz de um bug real
 *   de cor na Fase 9b.
 * - Nenhum componente escreve hex, px de raio ou duracao literal: se falta
 *   um valor, nasce um token em `tokens.css`.
 * - Cor de DESTAQUE (`--color-accent*`) segue a skin; cor SEMANTICA
 *   (verde/amarelo/vermelho) e fixa, senao "bom" e "ruim" trocariam de cor
 *   a cada tema.
 */

export { AppShell, Sidebar, SidebarGroup, SidebarNavItem, PlayerSummary, Topbar } from "./AppShell";
export { AuthForm, AuthLayout } from "./AuthLayout";
export { Badge, StatusBadge, type BadgeTone } from "./Badge";
export { Button, IconButton } from "./Button";
export { Card, InteractiveCard, SectionHeader } from "./Card";
export { ChampionAvatar, EmptyAvatarSlot } from "./ChampionAvatar";
export { ChampionGrid } from "./ChampionGrid";
export { DataRow, DataTable, IdentityCell, NumCell } from "./DataTable";
export { Field, NumberField, ReadOnlyValue, SearchInput, Select, TextField } from "./Field";
export { HashChip } from "./HashChip";
export {
  Columns,
  Grid,
  InlineStat,
  InlineStats,
  PageHero,
  PageLayout,
  PageSection,
  Toolbar,
  ToolbarSpacer
} from "./PageLayout";
export { ScoreBadge, ScoreBlock, scoreColor } from "./ScoreBadge";
export { SegmentedControl, Tabs, type SegmentOption } from "./SegmentedControl";
export { SignalChip, SignalChipList } from "./SignalChip";
export { MetricRow } from "./MetricRow";
export {
  EmptyState,
  ErrorState,
  GlobalNotice,
  Loading,
  Skeleton,
  SkeletonGrid,
  SkeletonRows
} from "./States";
export { StatBar } from "./StatBar";
export { InfoHint, Tooltip } from "./Tooltip";
export {
  ChampionPerformanceCard,
  CoverageBadge,
  InsightCard,
  MetricCard,
  ProfileDataNotice,
  ProfileHero,
  RecentMatchRow,
  TrendChart
} from "./ProfileAnalytics";
export type { TrendChartMetric } from "./ProfileAnalytics";
