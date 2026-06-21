import { useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Calendar,
  Clock,
  ListTodo,
  Mail,
  MoreHorizontal,
  X,
} from "lucide-react";

function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
  destructive,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted transition-colors ${
        destructive ? "text-red-600 hover:text-red-700" : ""
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="flex-1">
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

export function SuiviAlerteActionsMenu({
  showEmailAction,
  emailLoading,
  onReporter,
  onSnooze,
  onEnvoyerEmail,
  onPlanifierRdv,
  onCreateTache,
  onSupprimer,
}: {
  showEmailAction: boolean;
  emailLoading: boolean;
  onReporter: (mois: number) => void;
  onSnooze: (days: number) => void;
  onEnvoyerEmail: () => void;
  onPlanifierRdv?: () => void;
  onCreateTache?: () => void;
  onSupprimer: () => void;
}) {
  const [open, setOpen] = useState(false);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1">
          <MoreHorizontal className="h-4 w-4" />
          Suite
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1.5">
        <p className="px-2 pb-1 pt-0.5 text-xs text-muted-foreground">Actions</p>
        <MenuItem
          icon={Clock}
          label="Reporter 1 mois"
          onClick={() => run(() => onReporter(1))}
        />
        <MenuItem
          icon={Clock}
          label="Reporter 3 mois"
          onClick={() => run(() => onReporter(3))}
        />
        <MenuItem
          icon={Clock}
          label="Reporter 6 mois"
          onClick={() => run(() => onReporter(6))}
        />
        <MenuItem
          icon={Clock}
          label="Reporter 12 mois"
          onClick={() => run(() => onReporter(12))}
        />
        <MenuItem
          icon={Clock}
          label="Snooze 1 semaine"
          hint="sans modifier les dates contact"
          onClick={() => run(() => onSnooze(7))}
        />
        {showEmailAction && (
          <MenuItem
            icon={Mail}
            label={emailLoading ? "Préparation…" : "Email"}
            onClick={() => run(onEnvoyerEmail)}
          />
        )}
        {onPlanifierRdv && (
          <MenuItem
            icon={Calendar}
            label="Planifier RDV"
            onClick={() => run(onPlanifierRdv)}
          />
        )}
        {onCreateTache && (
          <MenuItem
            icon={ListTodo}
            label="Créer une tâche"
            onClick={() => run(onCreateTache)}
          />
        )}
        <MenuItem
          icon={X}
          label="Supprimer"
          destructive
          onClick={() => run(onSupprimer)}
        />
      </PopoverContent>
    </Popover>
  );
}
