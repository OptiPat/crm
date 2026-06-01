import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { splitPanelHeightClass } from "./split-detail-layout-utils";

interface SplitDetailLayoutProps {
  showSplit: boolean;
  /** Split à l'intérieur d'une Card qui a déjà un header (filtres). */
  nested?: boolean;
  list: ReactNode;
  detail?: ReactNode | null;
  className?: string;
}

export function SplitDetailLayout({
  showSplit,
  nested = false,
  list,
  detail,
  className,
}: SplitDetailLayoutProps) {
  return (
    <div
      className={cn(
        "grid items-start gap-4",
        showSplit && "lg:grid-cols-2",
        showSplit && nested && "h-full min-h-0",
        className
      )}
    >
      {list}
      {showSplit && detail != null ? detail : null}
    </div>
  );
}

interface SplitListColumnProps {
  showSplit: boolean;
  nested?: boolean;
  /** Afficher le libellé même sans split (ex. journal Interactions). */
  showListLabel?: boolean;
  listLabel?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SplitListColumn({
  showSplit,
  nested = false,
  showListLabel,
  listLabel,
  children,
  className,
}: SplitListColumnProps) {
  const displayLabel = (showListLabel ?? showSplit) && listLabel != null;

  return (
    <div
      className={cn(
        "min-w-0",
        showSplit && "flex min-h-0 flex-col overflow-hidden",
        showSplit && !nested && splitPanelHeightClass,
        showSplit && nested && "h-full min-h-0",
        className
      )}
    >
      {displayLabel ? (
        <p className="sticky top-0 z-10 shrink-0 bg-card px-1 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {listLabel}
        </p>
      ) : null}
      <div
        className={cn(
          "min-w-0 space-y-2",
          showSplit && "min-h-0 flex-1 overflow-y-auto lg:pr-1"
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface SplitDetailPaneProps {
  children: ReactNode;
  className?: string;
  nested?: boolean;
}

export function SplitDetailPane({ children, className, nested = false }: SplitDetailPaneProps) {
  return (
    <div
      className={cn(
        "hidden min-w-0 lg:block lg:sticky lg:top-0",
        nested ? "h-full min-h-0" : splitPanelHeightClass,
        className
      )}
    >
      {children}
    </div>
  );
}

/** Bouton retour + panneau embedded (foyer → contact, famille → membre…). */
export function SplitDetailStack({
  back,
  children,
}: {
  back?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {back ? <div className="shrink-0">{back}</div> : null}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
