import { ChevronDown, type LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
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
  badge,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="w-1 h-6 rounded-full bg-primary/80 shrink-0" aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-serif text-lg font-semibold text-foreground tracking-tight">
            {children}
          </h3>
          {badge}
        </div>
        {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
      </div>
    </div>
  );
}

/** Section toujours visible — ancrage + métadonnées accessibles. */
export function StatistiquesSection({
  sectionId,
  title,
  subtitle,
  icon: Icon,
  panelCount,
  intro,
  children,
}: {
  sectionId: StatistiquesSectionId;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  panelCount?: number;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const panelBadge =
    panelCount != null ? (
      <span
        className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums"
        aria-label={`${panelCount} indicateur${panelCount > 1 ? "s" : ""} dans cette section`}
      >
        {panelCount} indicateur{panelCount > 1 ? "s" : ""}
      </span>
    ) : null;

  return (
    <section
      id={`statistiques-section-${sectionId}`}
      className="scroll-mt-36 space-y-3"
      aria-labelledby={`statistiques-section-heading-${sectionId}`}
    >
      <div className="flex items-start gap-3 px-1">
        {Icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" aria-hidden />
          </div>
        ) : null}
        <div id={`statistiques-section-heading-${sectionId}`} className="min-w-0 flex-1">
          <StatistiquesSectionTitle subtitle={subtitle} badge={panelBadge}>
            {title}
          </StatistiquesSectionTitle>
        </div>
      </div>

      {intro ? (
        <p className="text-sm text-muted-foreground leading-relaxed px-1 border-l-2 border-primary/30 ml-1 pl-3">
          {intro}
        </p>
      ) : null}

      <div className="space-y-3">{children}</div>
    </section>
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

  useEffect(() => {
    if (!panelId) return;
    const handler = () => {
      setOpen(loadStatistiquesSectionOpen(panelId, defaultOpen));
    };
    window.addEventListener("statistiques-panels-reset", handler);
    return () => window.removeEventListener("statistiques-panels-reset", handler);
  }, [panelId, defaultOpen]);

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
      className={cn(
        "group flex h-full min-h-0 flex-col rounded-xl border border-border/70 bg-card shadow-sm"
      )}
      open={open}
      onToggle={(event) => {
        const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
        setOpen(nextOpen);
        if (panelId) saveStatistiquesSectionOpen(panelId, nextOpen);
      }}
    >
      <summary
        className={cn(
          "flex shrink-0 cursor-pointer list-none items-start gap-3 p-4 sm:p-5",
          "[&::-webkit-details-marker]:hidden",
          open ? "h-auto overflow-visible" : "h-[6.5rem] overflow-hidden"
        )}
      >
        <div className="min-w-0 flex-1">
          <h4
            className={cn(
              "font-medium text-foreground leading-snug",
              open ? "" : "line-clamp-2"
            )}
          >
            {title}
          </h4>
          <div className="mt-1 min-h-[2.5rem]">
            {description ? (
              <p
                className={cn(
                  "text-xs text-muted-foreground leading-relaxed",
                  open ? "" : "line-clamp-2"
                )}
              >
                {description}
              </p>
            ) : null}
          </div>
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
