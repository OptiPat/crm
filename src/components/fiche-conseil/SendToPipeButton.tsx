import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SendToPipeButtonProps {
  disabled?: boolean;
  onClick: () => void;
  /** Cockpit : libellé court « Pipe ». */
  compact?: boolean;
  className?: string;
  stopPropagation?: boolean;
}

export function SendToPipeButton({
  disabled = false,
  onClick,
  compact = false,
  className,
  stopPropagation = false,
}: SendToPipeButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className ?? "h-8 gap-1.5 text-xs shrink-0"}
      title="Créer un suivi dans le Pipe"
      disabled={disabled}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        onClick();
      }}
    >
      <ClipboardList className="h-3.5 w-3.5" />
      {compact ? "Pipe" : "Dans le pipe"}
    </Button>
  );
}
