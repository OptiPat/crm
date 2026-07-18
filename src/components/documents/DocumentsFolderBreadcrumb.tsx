import { ChevronRight, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DocumentsFolderBreadcrumb({
  folderLabel,
  onBackToFolders,
}: {
  folderLabel: string;
  onBackToFolders: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2"
        onClick={onBackToFolders}
      >
        <FolderOpen className="h-4 w-4" aria-hidden />
        Dossiers
      </Button>
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="font-medium text-foreground">{folderLabel}</span>
    </div>
  );
}
