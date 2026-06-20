import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, Mail, Tag } from "lucide-react";

export function EtiquetteFormPanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/80 bg-card/50 overflow-hidden",
        className
      )}
    >
      <div className="border-b border-border/60 px-5 py-4 sm:px-6 sm:py-5 bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="p-5 sm:p-6 space-y-5">{children}</div>
    </section>
  );
}

export function EtiquetteRuleSummaryCard({ summary }: { summary: string }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex gap-3">
      <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-medium text-primary uppercase tracking-wide">
          Résumé de la règle
        </p>
        <p className="text-sm text-foreground mt-1 leading-relaxed">{summary}</p>
      </div>
    </div>
  );
}

export function EtiquetteFormStatusBadges({
  actif,
  isAuto,
  emailActif,
  isSystem,
}: {
  actif: boolean;
  isAuto: boolean;
  emailActif: boolean;
  isSystem?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      <Badge variant={actif ? "default" : "secondary"} className="text-[10px]">
        {actif ? "Active" : "Désactivée"}
      </Badge>
      {isAuto && (
        <Badge variant="outline" className="text-[10px] gap-1">
          <Zap className="h-3 w-3" />
          Auto
        </Badge>
      )}
      {emailActif && (
        <Badge variant="outline" className="text-[10px] gap-1 border-blue-200 text-blue-800">
          <Mail className="h-3 w-3" />
          Email
        </Badge>
      )}
      {isSystem && (
        <Badge variant="outline" className="text-[10px] gap-1 border-amber-200 text-amber-800">
          <Tag className="h-3 w-3" />
          Préinstallée
        </Badge>
      )}
    </div>
  );
}

export function CategoryTogglePills({
  categories,
  selected,
  onToggle,
  single = false,
}: {
  categories: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Une seule valeur active (ex. intention template) */
  single?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((cat) => {
        const active = selected.includes(cat.value);
        return (
          <button
            key={cat.value}
            type="button"
            onClick={() => {
              if (single) {
                onToggle(cat.value);
                return;
              }
              onToggle(cat.value);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted/50"
            )}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
