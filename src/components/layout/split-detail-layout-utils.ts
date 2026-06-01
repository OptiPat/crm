import { cn } from "@/lib/utils";

/** Hauteur commune des colonnes split (liste + détail latéral). */
export const splitPanelHeightClass = "h-[calc(100dvh-12rem)]";

export function splitCardClassName(showSplit: boolean, className?: string) {
  return cn(
    className,
    showSplit && "flex min-h-0 flex-col overflow-hidden",
    showSplit && splitPanelHeightClass
  );
}

export function splitCardHeaderClassName(showSplit: boolean, className?: string) {
  return cn(className, showSplit && "shrink-0");
}

export function splitCardContentClassName(
  showSplit: boolean,
  className?: string,
  nested = false
) {
  return cn(
    className,
    showSplit && "flex min-h-0 flex-1 flex-col",
    showSplit && (nested ? "overflow-hidden" : "overflow-y-auto")
  );
}

/** Coque visuelle des panneaux embedded (fiche contact, foyer, arbre…). */
export function embeddedDetailShellClassName(className?: string) {
  return cn(
    "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm",
    className
  );
}
