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
  /** Infobulle (libellé complet). */
  title?: string;
}

export function InvestissementMetaRow({
  icon: Icon,
  children,
  className,
  tone = "default",
  title,
}: InvestissementMetaRowProps) {
  return (
    <span
      title={title}
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
