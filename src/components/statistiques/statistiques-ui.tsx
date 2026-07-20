import { ChevronDown, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  loadStatistiquesSectionOpen,
  saveStatistiquesSectionOpen,
  type StatistiquesPanelId,
  type StatistiquesSectionId,
} from "@/lib/statistiques/statistiques-page-preferences";
import { cn } from "@/lib/utils";

export function StatistiquesSectionTitle({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="w-1 h-6 rounded-full bg-primary/80 shrink-0" aria-hidden />
      <div>
        <h3 className="font-serif text-lg font-semibold text-foreground tracking-tight">
          {children}
        </h3>
        {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function StatistiquesCollapsibleSection({
  sectionId,
  title,
  subtitle,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  sectionId: StatistiquesSectionId;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(() => loadStatistiquesSectionOpen(sectionId, defaultOpen));

  return (
    <details
      className="group rounded-2xl border border-border/70 bg-card/40 open:bg-transparent open:border-transparent"
      open={open}
      onToggle={(event) => {
        const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
        setOpen(nextOpen);
        saveStatistiquesSectionOpen(sectionId, nextOpen);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-2 [&::-webkit-details-marker]:hidden">
        {Icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        ) : null}
        <StatistiquesSectionTitle subtitle={subtitle}>{title}</StatistiquesSectionTitle>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 ml-auto"
          )}
        />
      </summary>
      <div className="pt-3 space-y-3">{children}</div>
    </details>
  );
}

export function StatistiquesPanel({
  title,
  description,
  children,
  collapsible = false,
  panelId,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  collapsible?: boolean;
  panelId?: StatistiquesPanelId;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(() =>
    panelId ? loadStatistiquesSectionOpen(panelId, defaultOpen) : defaultOpen
  );

  if (!collapsible) {
    return (
      <section className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 space-y-4 shadow-sm">
        <div>
          <h4 className="font-medium text-foreground">{title}</h4>
          {description ? <p className="text-xs text-muted-foreground mt-1">{description}</p> : null}
        </div>
        {children}
      </section>
    );
  }

  return (
    <details
      className="group rounded-xl border border-border/70 bg-card shadow-sm"
      open={open}
      onToggle={(event) => {
        const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
        setOpen(nextOpen);
        if (panelId) saveStatistiquesSectionOpen(panelId, nextOpen);
      }}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-foreground">{title}</h4>
          {description ? <p className="text-xs text-muted-foreground mt-1">{description}</p> : null}
        </div>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          )}
          aria-hidden
        />
      </summary>
      <div className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5 pt-0">{children}</div>
    </details>
  );
}
