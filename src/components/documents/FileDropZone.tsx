import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Zone « Glissez un fichier ici ou Sélectionner » (le dépôt est écouté par le parent). */
export function FileDropZone({
  isDragging,
  onSelect,
  label = "Glissez un fichier ici",
  buttonLabel = "Sélectionner un fichier",
  hint,
}: {
  isDragging: boolean;
  onSelect: () => void;
  label?: string;
  buttonLabel?: string;
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border/80 bg-muted/20"
      )}
    >
      <Upload
        className={cn("h-6 w-6", isDragging ? "text-primary" : "text-muted-foreground/60")}
        aria-hidden
      />
      <p className="text-sm font-medium text-foreground/80">
        {isDragging ? "Déposez le fichier ici" : label}
      </p>
      {!isDragging ? (
        <>
          <p className="text-xs text-muted-foreground">ou</p>
          <Button type="button" variant="outline" size="sm" onClick={onSelect}>
            {buttonLabel}
          </Button>
          {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
        </>
      ) : null}
    </div>
  );
}
