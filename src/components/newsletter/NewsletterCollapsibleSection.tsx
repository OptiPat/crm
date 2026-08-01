import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type NewsletterCollapsibleSectionProps = {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
};

export function NewsletterCollapsibleSection({
  title,
  description,
  defaultOpen = false,
  badge,
  children,
}: NewsletterCollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border bg-muted/10">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{title}</p>
          {description ?
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge ?
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {badge}
            </span>
          : null}
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </div>
      </button>
      {open ?
        <div className="px-3 pb-3 space-y-3 border-t">{children}</div>
      : null}
    </div>
  );
}
