import { Badge } from "@/components/ui/badge";
import type { Document } from "@/lib/api/tauri-documents";
import type { Contact } from "@/lib/api/tauri-contacts";
import { DocumentRowActions } from "@/components/documents/DocumentRowActions";
import { getDocumentMetaLines } from "@/lib/documents/document-display";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, FileText, Image, Paperclip } from "lucide-react";

type DocumentListRowProps = {
  doc: Document;
  client?: Contact;
  onPreview: (doc: Document) => void;
  onOpenFile: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  onOpenClient?: (contactId: number) => void;
  onReimportStellium?: (doc: Document) => void;
};

function getMimeIcon(mimeType: string) {
  const className = "h-8 w-8 text-muted-foreground";
  if (mimeType.includes("pdf")) return <FileText className={className} aria-hidden />;
  if (mimeType.includes("word") || mimeType.includes("doc")) {
    return <FileText className={className} aria-hidden />;
  }
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) {
    return <FileSpreadsheet className={className} aria-hidden />;
  }
  if (mimeType.includes("image")) return <Image className={className} aria-hidden />;
  return <Paperclip className={className} aria-hidden />;
}

function getTypeColor(type: string) {
  switch (type) {
    case "IDENTITE":
      return "bg-blue-100 text-blue-800";
    case "FISCAL":
      return "bg-green-100 text-green-800";
    case "PATRIMOINE":
      return "bg-purple-100 text-purple-800";
    case "QPI":
      return "bg-indigo-100 text-indigo-800";
    case "CONTRAT":
      return "bg-orange-100 text-orange-800";
    case "RELEVE":
      return "bg-cyan-100 text-cyan-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DocumentListRow({
  doc,
  client,
  onPreview,
  onOpenFile,
  onDelete,
  onOpenClient,
  onReimportStellium,
}: DocumentListRowProps) {
  return (
    <div
      className={cn(
        "p-4 border border-border rounded-lg hover:bg-accent transition-colors cursor-pointer group"
      )}
      role="button"
      tabIndex={0}
      onClick={() => onPreview(doc)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview(doc);
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="shrink-0">{getMimeIcon(doc.mime_type || "")}</div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                {doc.nom_fichier}
              </h3>
              <Badge className={getTypeColor(doc.type_document)}>
                {getDocumentTypeLabel(doc.type_document)}
              </Badge>
            </div>
            {client && doc.contact_id != null && onOpenClient ? (
              <button
                type="button"
                className="text-sm text-primary hover:underline mb-1 relative z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenClient(doc.contact_id!);
                }}
              >
                Client : {client.prenom} {client.nom}
              </button>
            ) : !client && doc.contact_id == null ? (
              <p className="text-sm text-muted-foreground mb-1">Sans client lié</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{formatFileSize(doc.taille_fichier)}</span>
              {getDocumentMetaLines(doc).map((line) => (
                <span key={line.label}>
                  {line.label} : {line.value}
                </span>
              ))}
            </div>
            {doc.notes && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{doc.notes}</p>
            )}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <DocumentRowActions
            doc={doc}
            onOpenFile={() => onOpenFile(doc)}
            onOpenClient={
              doc.contact_id != null && onOpenClient
                ? () => onOpenClient(doc.contact_id!)
                : undefined
            }
            onReimportStellium={
              onReimportStellium ? () => onReimportStellium(doc) : undefined
            }
            onDelete={() => onDelete(doc)}
          />
        </div>
      </div>
    </div>
  );
}
