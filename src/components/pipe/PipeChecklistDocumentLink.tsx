import { useMemo, useState } from "react";
import { FileText, Link2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Document } from "@/lib/api/tauri-documents";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import { importPipeChecklistDocument } from "@/lib/pipe/pipe-checklist-document-import";
import { mergePipeChecklistDocument } from "@/lib/pipe/pipe-checklist-documents";
import { toast } from "sonner";

const NONE_DOC_VALUE = "__none__";

interface PipeChecklistDocumentLinkProps {
  contactId: number;
  documentId: number | null;
  documents: Document[];
  expanded: boolean;
  onExpand: () => void;
  onLink: (documentId: number | null) => void | Promise<void>;
  onDocumentImported?: (doc: Document) => void;
  /** Type document suggéré à l'import (ex. CNI, RIB). */
  suggestedTypeDocument?: string;
}

export function PipeChecklistDocumentLink({
  contactId,
  documentId,
  documents,
  expanded,
  onExpand,
  onLink,
  onDocumentImported,
  suggestedTypeDocument,
}: PipeChecklistDocumentLinkProps) {
  const [importing, setImporting] = useState(false);
  const [pendingDoc, setPendingDoc] = useState<Document | null>(null);

  const documentOptions = useMemo(
    () => (pendingDoc ? mergePipeChecklistDocument(documents, pendingDoc) : documents),
    [documents, pendingDoc]
  );

  const linkedDoc =
    documentId != null
      ? documentOptions.find((doc) => doc.id === documentId)
      : undefined;

  const linkDocument = async (nextDocumentId: number | null) => {
    if (nextDocumentId === (documentId ?? null)) return;
    try {
      await onLink(nextDocumentId);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const runImport = async () => {
    if (contactId <= 0) {
      toast.error("Aucun contact lié à cette affaire.");
      return;
    }
    setImporting(true);
    try {
      const created = await importPipeChecklistDocument({
        contactId,
        typeDocument: suggestedTypeDocument,
      });
      if (!created) return;

      setPendingDoc(created);
      onDocumentImported?.(created);
      await onLink(created.id);
      setPendingDoc(null);
      toast.success("Pièce jointe importée et liée");
    } catch (err) {
      setPendingDoc(null);
      toast.error(String(err));
    } finally {
      setImporting(false);
    }
  };

  if (!expanded) {
    return (
      <div className="pl-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={onExpand}
        >
          <Link2 className="h-3 w-3 mr-1" />
          Lier un document
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pl-6">
      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Select
        value={documentId != null ? String(documentId) : NONE_DOC_VALUE}
        onValueChange={(value) => {
          void linkDocument(value === NONE_DOC_VALUE ? null : Number(value));
        }}
      >
        <SelectTrigger className="h-8 max-w-full flex-1 text-xs">
          <SelectValue placeholder="Choisir un document existant" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_DOC_VALUE}>Aucun document lié</SelectItem>
          {documentOptions.map((doc) => (
            <SelectItem key={doc.id} value={String(doc.id)}>
              {doc.nom_fichier} — {getDocumentTypeLabel(doc.type_document)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs shrink-0"
        disabled={importing}
        onClick={() => void runImport()}
      >
        {importing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5 mr-1" />
        )}
        Importer…
      </Button>
      {linkedDoc ? (
        <span className="text-[11px] text-muted-foreground truncate max-w-[12rem]">
          {getDocumentTypeLabel(linkedDoc.type_document)}
        </span>
      ) : null}
    </div>
  );
}
