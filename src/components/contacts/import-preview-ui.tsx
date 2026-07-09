import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** Liste de lignes d'import — pas de défilement horizontal. */
export const IMPORT_PREVIEW_LIST_CLASS = "space-y-3";

/** Grille responsive : les champs se répartissent sur la largeur de l'écran. */
export const IMPORT_PREVIEW_FIELD_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

type ImportPreviewLineCardProps = {
  selectable?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  header: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ImportPreviewLineCard({
  selectable,
  checked,
  onCheckedChange,
  header,
  children,
  className,
}: ImportPreviewLineCardProps) {
  return (
    <div className={cn("rounded-lg border bg-card p-3 space-y-3", className)}>
      <div className="flex items-start gap-3">
        {selectable ? (
          <Checkbox
            className="mt-0.5"
            checked={checked}
            onCheckedChange={(c) => onCheckedChange?.(c === true)}
          />
        ) : (
          <div className="w-4 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1 space-y-1">{header}</div>
      </div>
      {children}
    </div>
  );
}

type ImportPreviewFieldProps = {
  label: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
  /** Surlignage aperçu enrichissement : complétion (fill) ou remplacement (change). */
  highlight?: "fill" | "change";
};

const IMPORT_PREVIEW_FIELD_HIGHLIGHT_CLASS: Record<"fill" | "change", string> = {
  fill: "rounded-md bg-emerald-50/90 px-2 py-1 ring-1 ring-emerald-200/80 dark:bg-emerald-950/35 dark:ring-emerald-800",
  change:
    "rounded-md bg-amber-50/90 px-2 py-1 ring-1 ring-amber-200/80 dark:bg-amber-950/35 dark:ring-amber-800",
};

export function ImportPreviewField({
  label,
  children,
  className,
  wide,
  highlight,
}: ImportPreviewFieldProps) {
  return (
    <div
      className={cn(
        "min-w-0 space-y-1",
        wide && "col-span-2 sm:col-span-2 lg:col-span-2 xl:col-span-2",
        className
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div
        className={cn("min-w-0", highlight && IMPORT_PREVIEW_FIELD_HIGHLIGHT_CLASS[highlight])}
      >
        {children}
      </div>
    </div>
  );
}

/** Section groupée dans l'aperçu import (Enrichir, À importer, …). */
export function ImportPreviewSection({
  title,
  count,
  children,
  className,
}: {
  title: string;
  count: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="sticky top-0 z-10 border-b bg-background/95 py-2 text-sm font-semibold backdrop-blur-sm">
        {title}
        <span className="ml-2 font-normal text-muted-foreground">({count})</span>
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

type ImportPreviewReadonlyFieldProps = {
  label: string;
  value: ReactNode;
  className?: string;
};

/** Champ lecture seule compact (aperçu import Excel personnalisé). */
export function ImportPreviewReadonlyField({
  label,
  value,
  className,
}: ImportPreviewReadonlyFieldProps) {
  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="truncate text-sm">{value || "—"}</p>
    </div>
  );
}
