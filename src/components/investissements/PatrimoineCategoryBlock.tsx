import { Badge } from "@/components/ui/badge";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function PatrimoineCategoryBlock({
  title,
  icon: Icon,
  accentClass,
  totalCentimes,
  count,
  children,
  headerOnly = false,
}: {
  title: string;
  icon: LucideIcon;
  accentClass: string;
  totalCentimes: number;
  count: number;
  children?: React.ReactNode;
  /** En-tête seul (listes virtualisées). */
  headerOnly?: boolean;
}) {
  if (count === 0) return null;

  const header = (
    <div className="flex items-center justify-between gap-2 px-0.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("p-1.5 rounded-md", accentClass)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Badge variant="secondary" className="text-[10px] h-5">
          {count}
        </Badge>
      </div>
      <p className="text-sm font-medium tabular-nums text-foreground shrink-0">
        {formatEuroCentimes(totalCentimes)}
      </p>
    </div>
  );

  if (headerOnly) return header;

  return (
    <section className="space-y-2">
      {header}
      <div className="space-y-2">{children}</div>
    </section>
  );
}
