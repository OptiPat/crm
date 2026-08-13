import type { PatrimoineTimelineKind } from "@/lib/patrimoine/timeline";
import type { ComponentType } from "react";
import {
  ArrowLeftRight,
  Bell,
  CalendarClock,
  CalendarPlus,
  CheckSquare,
  KeyRound,
  Landmark,
  type LucideProps,
} from "lucide-react";
import { PATRIMOINE_SOURCE_COLORS } from "@/lib/patrimoine/patrimoine-palette";

export const CP_CHART_STROKE = "#1c1c1c";

export const CP = {
  root: "cp-root",
  kicker: "cp-kicker",
  caption: "cp-caption",
  meta: "cp-meta",
  body: "cp-body",
  amount: "cp-amount",
  sectionTitle: "cp-section-title",
  categoryTitle: "cp-category-title",
  heroName: "cp-hero-name",
  heroGreeting: "cp-hero-greeting",
  heroLabel: "cp-hero-label",
  heroTotal: "cp-hero-total",
  chartTotal: "cp-chart-total",
  card: "cp-card",
  hairline: "cp-hairline",
  tab: "cp-tab",
  tabActive: "cp-tab-active",
  tabIdle: "cp-tab-idle",
  badge: "cp-badge",
  rdvButton: "cp-rdv-button",
  rdvMenu: "cp-rdv-menu",
  rdvMenuItem: "cp-rdv-menu-item",
  sectionGap: "mt-8",
  padX: "px-5 @min-[36rem]:px-6",
} as const;

export const SOURCE_SLICE_COLORS = PATRIMOINE_SOURCE_COLORS;

export const TIMELINE_KIND_STYLE: Record<
  PatrimoineTimelineKind,
  { Icon: ComponentType<LucideProps> }
> = {
  fin_demembrement: { Icon: KeyRound },
  fin_pret: { Icon: Landmark },
  prochain_arbitrage: { Icon: ArrowLeftRight },
  cloture: { Icon: CalendarClock },
  alerte: { Icon: Bell },
  tache: { Icon: CheckSquare },
  conseiller: { Icon: CalendarPlus },
};

export function getGreetingHour(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export function formatDaysUntil(unix: number): string | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(unix * 1000);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86_400_000);
  if (diff < 0) return null;
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff < 30) return `Dans ${diff} jours`;
  if (diff < 365) {
    const months = Math.round(diff / 30);
    return `Dans ${months} mois`;
  }
  const years = Math.round(diff / 365);
  return `Dans ${years} an${years > 1 ? "s" : ""}`;
}
