import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INVESTISSEMENT_META_TONE_CLASS,
  type InvestissementMetaTone,
} from "@/lib/investissements/investissement-display";

interface InvestissementMetaRowProps {
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  tone?: InvestissementMetaTone;
}

export function InvestissementMetaRow({
  icon: Icon,
  children,
  className,
  tone = "default",
}: InvestissementMetaRowProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm",
        INVESTISSEMENT_META_TONE_CLASS[tone],
        className
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{children}</span>
    </span>
  );
}
