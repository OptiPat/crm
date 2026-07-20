import { ReactNode, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadDashboardSectionOpen,
  saveDashboardSectionOpen,
  type DashboardSectionId,
} from "@/lib/dashboard/dashboard-page-preferences";
import { formatDashboardPercent } from "./dashboard-format";

export function ChartLoading({ height = 360 }: { height?: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm"
      style={{ height }}
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
      Chargement…
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-muted rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 bg-muted rounded" />
          <div className="h-7 w-28 bg-muted rounded" />
          <div className="h-3 w-16 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}

export function ContactInitialsAvatar({
  prenom,
  nom,
  className,
}: {
  prenom: string;
  nom: string;
  className?: string;
}) {
  const initials = `${prenom?.trim().charAt(0) ?? ""}${nom?.trim().charAt(0) ?? ""}`.toUpperCase() || "?";
  return (
    <div
      className={cn(
        "h-11 w-11 rounded-full bg-primary/10 text-primary font-semibold text-sm",
        "flex items-center justify-center shrink-0 ring-2 ring-background",
        className
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function DashboardPanel({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden flex flex-col",
        className
      )}
    >
      <div className="border-b border-border/50 px-5 py-3.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-base font-semibold text-foreground tracking-tight">
              {title}
            </h3>
            {description ? (
              <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
            ) : null}
          </div>
          {action}
        </div>
      </div>
      <div className="p-4 sm:p-5 flex-1 flex flex-col min-h-0">{children}</div>
    </section>
  );
}

export function ChartEmpty({
  height = 360,
  title,
  subtitle,
}: {
  height?: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className="flex items-center justify-center text-muted-foreground"
      style={{ height }}
    >
      <div className="text-center px-4">
        <p className="font-medium text-foreground/80">{title}</p>
        {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

export function ChartTooltipBox({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-border text-sm">
      {children}
    </div>
  );
}

export interface LegendItem {
  name: string;
  value: number;
  color: string;
  formatValue?: (v: number) => string;
}

export function ChartLegendGrid({
  items,
  total,
  columns = 2,
  maxHeight = "9rem",
  onItemClick,
}: {
  items: LegendItem[];
  total: number;
  columns?: 1 | 2 | 3;
  maxHeight?: string;
  onItemClick?: (index: number) => void;
}) {
  const colClass =
    columns === 3
      ? "sm:grid-cols-3"
      : columns === 1
        ? "grid-cols-1"
        : "sm:grid-cols-2";

  return (
    <div className="border-t pt-3 overflow-y-auto pr-1" style={{ maxHeight }}>
      <div className={`grid grid-cols-1 ${colClass} gap-x-4 gap-y-2 text-xs`}>
        {items.map((item, index) => {
          const valueLabel = item.formatValue
            ? item.formatValue(item.value)
            : String(item.value);
          const pct = formatDashboardPercent(item.value, total);
          const clickable = onItemClick != null;
          return (
            <div
              key={item.name}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              className={
                clickable
                  ? "flex items-center gap-2 min-w-0 rounded-md px-1 -mx-1 py-0.5 cursor-pointer hover:bg-muted/60 transition-colors"
                  : "flex items-center gap-2 min-w-0"
              }
              title={`${item.name} — ${valueLabel} (${pct})`}
              onClick={clickable ? () => onItemClick(index) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onItemClick(index);
                      }
                    }
                  : undefined
              }
            >
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-black/5"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate flex-1 text-foreground/90">{item.name}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">{pct}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardPageHeader() {
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <p className="text-xs font-medium text-muted-foreground capitalize border-b border-border/60 pb-3">
      {today}
    </p>
  );
}

export function DashboardKpiHelp() {
  return (
    <details className="group rounded-xl border bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 font-medium [&::-webkit-details-marker]:hidden">
        Comprendre les indicateurs
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 space-y-2 text-xs text-muted-foreground leading-relaxed border-t pt-3">
        <p>
          <strong className="text-foreground">Encours placements</strong> — valorisation actuelle
          AV, PER, épargne salariale, FIP/FCPI… « avec moi ». Les SCPI et l&apos;immobilier ne sont pas inclus.
        </p>
        <p>
          <strong className="text-foreground">Panier moyen</strong> — montants souscrits (
          <em>montant initial</em>) divisés par le nombre de clients, pas l&apos;encours actuel.
        </p>
        <p>
          <strong className="text-foreground">Versements programmés</strong> — projection annuelle
          des VP actifs sur le portefeuille « avec moi ».
        </p>
        <p>
          Analyses détaillées (source, prescripteur, géographie, couverture produits) : page{" "}
          <strong className="text-foreground">Statistiques</strong> dans le menu latéral.
        </p>
      </div>
    </details>
  );
}

export function DashboardCollapsibleSection({
  sectionId,
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  sectionId: DashboardSectionId;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(() => loadDashboardSectionOpen(sectionId, defaultOpen));

  return (
    <details
      className="group rounded-2xl border border-border/70 bg-card/40 open:bg-transparent open:border-transparent"
      open={open}
      onToggle={(event) => {
        const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
        setOpen(nextOpen);
        saveDashboardSectionOpen(sectionId, nextOpen);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-2 [&::-webkit-details-marker]:hidden">
        <DashboardSectionTitle subtitle={subtitle}>{title}</DashboardSectionTitle>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 ml-auto" />
      </summary>
      <div className="pt-3 space-y-3">{children}</div>
    </details>
  );
}

export function DashboardCockpitSection({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-gradient-to-b from-muted/30 to-card p-4 sm:p-5 space-y-4 shadow-sm">
      <DashboardSectionTitle subtitle="Agenda, tâches, anniversaires, campagnes et alertes">
        Cockpit du jour
      </DashboardSectionTitle>
      {children}
    </div>
  );
}

export function DashboardSectionTitle({
  children,
  subtitle,
  className = "",
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-2", className)}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-1 h-6 rounded-full bg-primary/80 shrink-0" aria-hidden />
        <div>
          <h3 className="font-serif text-lg font-semibold text-foreground tracking-tight">
            {children}
          </h3>
          {subtitle ? (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
