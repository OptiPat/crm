import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RioPdfPreviewPanel } from "@/components/documents/RioPdfPreviewPanel";
import type { Document } from "@/lib/api/tauri-documents";
import {
  getDocumentMetaLines,
  isDocumentPreviewable,
} from "@/lib/documents/document-display";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import { ExternalLink, UserRound } from "lucide-react";

type DocumentPreviewSheetProps = {
  doc: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientLabel?: string;
  onOpenExternal?: () => void;
  onOpenClient?: () => void;
};

export function DocumentPreviewSheet({
  doc,
  open,
  onOpenChange,
  clientLabel,
  onOpenExternal,
  onOpenClient,
}: DocumentPreviewSheetProps) {
  const previewable = doc ? isDocumentPreviewable(doc) : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-xl">
        {doc && (
          <>
            <SheetHeader>
              <SheetTitle className="truncate pr-8">{doc.nom_fichier}</SheetTitle>
              <SheetDescription asChild>
                <div className="space-y-1 text-left">
                  <p>{getDocumentTypeLabel(doc.type_document)}</p>
                  {clientLabel && <p>Client : {clientLabel}</p>}
                  {getDocumentMetaLines(doc).map((line) => (
                    <p key={line.label}>
                      {line.label} : {line.value}
                    </p>
                  ))}
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-hidden py-2">
              {previewable ? (
                <RioPdfPreviewPanel pdfPath={doc.chemin_fichier} active={open} />
              ) : (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <p>Aperçu indisponible pour ce format.</p>
                  {onOpenExternal && (
                    <Button type="button" variant="outline" size="sm" onClick={onOpenExternal}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ouvrir avec l&apos;application
                    </Button>
                  )}
                </div>
              )}
            </div>

            <SheetFooter className="flex-row flex-wrap gap-2 sm:justify-between">
              {onOpenClient && (
                <Button type="button" variant="outline" size="sm" onClick={onOpenClient}>
                  <UserRound className="h-4 w-4 mr-2" />
                  Voir fiche
                </Button>
              )}
              {previewable && onOpenExternal && (
                <Button type="button" variant="secondary" size="sm" onClick={onOpenExternal}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ouvrir dans l&apos;application
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
