import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  accentColor: string;
  iconColor: string;
  iconBgColor: string;
  onClick?: () => void;
  highlight?: boolean;
}

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  accentColor,
  iconColor,
  iconBgColor,
  onClick,
  highlight,
}: StatCardProps) {
  const interactive = Boolean(onClick);

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/70 bg-card/80 shadow-sm transition-all duration-200",
        interactive &&
          "hover:shadow-md hover:border-primary/30 hover:bg-card cursor-pointer group focus-visible:ring-2 focus-visible:ring-primary/40",
        highlight && "ring-2 ring-amber-200/90 border-amber-200/70 bg-amber-50/30"
      )}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn("p-2.5 rounded-xl shrink-0", iconBgColor)}
            style={{ boxShadow: `inset 0 0 0 1px ${accentColor}22` }}
          >
            <Icon className={cn("h-5 w-5", iconColor)} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground/90 leading-tight">{title}</p>
            <p className="text-xl sm:text-2xl font-serif font-bold text-primary mt-0.5 leading-none tabular-nums tracking-tight">
              {value}
            </p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{description}</p>
          </div>
          {interactive && (
            <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
