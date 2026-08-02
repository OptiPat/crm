import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ArbitrageFicheConseilButtonProps {
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  stopPropagation?: boolean;
}

export function ArbitrageFicheConseilButton({
  disabled = false,
  onClick,
  className,
  stopPropagation = false,
}: ArbitrageFicheConseilButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className ?? "h-8 gap-1.5 text-xs shrink-0"}
      title="Générer la fiche conseil arbitrage"
      disabled={disabled}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        onClick();
      }}
    >
      <FileText className="h-3.5 w-3.5" />
      Fiche conseil
    </Button>
  );
}
