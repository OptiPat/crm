import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  accentColor: string;
  iconColor: string;
  iconBgColor: string;
}

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  accentColor,
  iconColor,
  iconBgColor,
}: StatCardProps) {
  return (
    <Card
      className="overflow-hidden border-border/80 shadow-sm hover:shadow-md transition-shadow"
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      <CardContent className="p-4 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
              {title}
            </p>
            <p className="text-2xl lg:text-[1.65rem] font-serif font-bold text-primary mt-1 leading-tight tabular-nums">
              {value}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{description}</p>
          </div>
          <div className={`p-2.5 rounded-xl shrink-0 ${iconBgColor}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
