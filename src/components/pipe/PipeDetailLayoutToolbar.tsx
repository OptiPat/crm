import { ArrowLeft, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PipeDetailLayoutToolbarProps {
  expanded: boolean;
  onExpand?: () => void;
  onBackToBoard?: () => void;
}

export function PipeDetailLayoutToolbar({
  expanded,
  onExpand,
  onBackToBoard,
}: PipeDetailLayoutToolbarProps) {
  if (expanded) {
    if (!onBackToBoard) return null;
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-1 -ml-2 h-7 px-2 text-xs text-muted-foreground"
        onClick={(event) => {
          event.stopPropagation();
          onBackToBoard();
        }}
      >
        <ArrowLeft className="size-3.5 mr-1.5" />
        Retour au tableau
      </Button>
    );
  }

  if (!onExpand) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="mb-1 -ml-2 h-7 px-2 text-xs text-muted-foreground"
      onClick={(event) => {
        event.stopPropagation();
        onExpand();
      }}
    >
      <Maximize2 className="size-3.5 mr-1.5" />
      Agrandir
    </Button>
  );
}
