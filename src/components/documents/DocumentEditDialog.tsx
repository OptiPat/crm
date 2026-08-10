import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateDocument, type Document } from "@/lib/api/tauri-documents";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documents/document-type-labels";

/** Pour une pièce d'identité, `date_document` porte la date d'expiration : c'est
 *  elle que lit le contrôle de conformité pour signaler un document périmé. */
function dateFieldLabel(typeDocument: string): string {
  return typeDocument === "IDENTITE"
    ? "Date d'expiration"
    : "Date du document";
}

function dateFieldHint(typeDocument: string): string {
  return typeDocument === "IDENTITE"
    ? "Utilisée pour vous alerter quand la pièce arrive à échéance."
    : "Date figurant sur le document, si elle est connue.";
}

export interface DocumentEditDialogProps {
  doc: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function DocumentEditDialog({
  doc,
  open,
  onOpenChange,
  onSaved,
}: DocumentEditDialogProps) {
  const [typeDocument, setTypeDocument] = useState("AUTRE");
  const [dateDocument, setDateDocument] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!doc) return;
    setTypeDocument(doc.type_document);
    // L'API accepte du texte libre ; le champ HTML exige AAAA-MM-JJ.
    setDateDocument((doc.date_document ?? "").slice(0, 10));
  }, [doc]);

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      await updateDocument(doc.id, {
        contact_id: doc.contact_id,
        foyer_id: doc.foyer_id,
        type_document: typeDocument,
        nom_fichier: doc.nom_fichier,
        chemin_fichier: doc.chemin_fichier,
        taille_fichier: doc.taille_fichier,
        mime_type: doc.mime_type,
        date_document: dateDocument.trim() || undefined,
        notes: doc.notes,
        sensibilite_extra_financiere: doc.sensibilite_extra_financiere,
        experience_investissement: doc.experience_investissement,
      });
      toast.success("Document mis à jour");
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Modification impossible"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le document</DialogTitle>
          <DialogDescription className="truncate">
            {doc?.nom_fichier}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="document-edit-type">Type</Label>
            <Select value={typeDocument} onValueChange={setTypeDocument}>
              <SelectTrigger id="document-edit-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-edit-date">
              {dateFieldLabel(typeDocument)}
            </Label>
            <Input
              id="document-edit-date"
              type="date"
              value={dateDocument}
              onChange={(e) => setDateDocument(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {dateFieldHint(typeDocument)}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !doc}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
