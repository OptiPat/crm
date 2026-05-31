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
        "@container overflow-hidden border-border/70 bg-card/80 shadow-sm transition-all duration-200",
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
      <CardContent className="p-2.5 @min-[11rem]:p-3 @min-[14rem]:p-4">
        <div className="flex items-center gap-1.5 @min-[11rem]:gap-2 @min-[14rem]:gap-3 min-w-0">
          <div
            className={cn(
              "p-1.5 @min-[11rem]:p-2 @min-[14rem]:p-2.5 rounded-xl shrink-0",
              iconBgColor
            )}
            style={{ boxShadow: `inset 0 0 0 1px ${accentColor}22` }}
          >
            <Icon
              className={cn(
                "h-4 w-4 @min-[14rem]:h-5 @min-[14rem]:w-5",
                iconColor
              )}
              strokeWidth={2}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs @min-[11rem]:text-sm font-medium text-foreground/90 leading-tight truncate">
              {title}
            </p>
            <p className="text-[clamp(0.6875rem,9cqi,1.5rem)] font-serif font-bold text-primary mt-0.5 leading-tight tabular-nums tracking-tight whitespace-nowrap">
              {value}
            </p>
            <p className="text-[10px] @min-[11rem]:text-xs text-muted-foreground mt-0.5 @min-[11rem]:mt-1 line-clamp-1">
              {description}
            </p>
          </div>
          {interactive && (
            <ChevronRight className="hidden @min-[10rem]:block h-3.5 w-3.5 @min-[14rem]:h-4 @min-[14rem]:w-4 text-muted-foreground/60 shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
