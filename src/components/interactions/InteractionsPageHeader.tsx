import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function InteractionsPageHeader({
  filteredCount,
  onNewInteraction,
}: {
  filteredCount: number;
  onNewInteraction: () => void;
}) {
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-6">
      <div>
        <p className="text-xs font-medium text-muted-foreground capitalize">{today}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Journal des appels, emails, RDV et notes —{" "}
          <span className="tabular-nums">{filteredCount} dans la vue actuelle</span>
        </p>
      </div>
      <Button type="button" className="gap-2 shrink-0" onClick={onNewInteraction}>
        <Plus className="h-4 w-4" />
        Nouvelle interaction
      </Button>
    </header>
  );
}
