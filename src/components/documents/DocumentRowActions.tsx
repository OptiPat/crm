import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Document } from "@/lib/api/tauri-documents";
import {
  canReimportStelliumDocument,
  getStelliumReimportActionLabel,
} from "@/lib/documents/document-display";
import {
  CloudUpload,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";

type DocumentRowActionsProps = {
  doc: Document;
  onOpenFile: () => void;
  onOpenClient?: () => void;
  onSendToOneDrive?: () => void;
  sendingToOneDrive?: boolean;
  sendToOneDriveDisabled?: boolean;
  sendToOneDriveTitle?: string;
  onReimportStellium?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
};

export function DocumentRowActions({
  doc,
  onOpenFile,
  onOpenClient,
  onSendToOneDrive,
  sendingToOneDrive = false,
  sendToOneDriveDisabled = false,
  sendToOneDriveTitle = "Copie vers le dossier OneDrive du client (max 4 Mo)",
  onReimportStellium,
  onEdit,
  onDelete,
}: DocumentRowActionsProps) {
  const showReimport = canReimportStelliumDocument(doc) && onReimportStellium;
  const showClient = doc.contact_id != null && onOpenClient;
  const showSendToOneDrive = doc.contact_id != null && onSendToOneDrive;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          title="Actions"
          aria-label="Actions document"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-1"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 h-9"
          onClick={onOpenFile}
        >
          <ExternalLink className="h-4 w-4" />
          Ouvrir dans l&apos;application
        </Button>
        {showClient && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 h-9"
            onClick={onOpenClient}
          >
            <UserRound className="h-4 w-4" />
            Voir fiche client
          </Button>
        )}
        {showSendToOneDrive && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 h-9"
            disabled={sendingToOneDrive || sendToOneDriveDisabled}
            title={sendToOneDriveTitle}
            onClick={onSendToOneDrive}
          >
            {sendingToOneDrive ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CloudUpload className="h-4 w-4" />
            )}
            Envoyer vers OneDrive
          </Button>
        )}
        {showReimport && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 h-9"
            onClick={onReimportStellium}
          >
            <RefreshCw className="h-4 w-4" />
            {getStelliumReimportActionLabel(doc.type_document)}
          </Button>
        )}
        {onEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 h-9"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
            Modifier type et date
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 h-9 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          Supprimer
        </Button>
      </PopoverContent>
    </Popover>
  );
}
