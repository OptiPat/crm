import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, File, X } from "lucide-react";
import { uploadDocument, createDocument, type NewDocument } from "@/lib/api/tauri-documents";

interface DocumentUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  contactId?: number;
  foyerId?: number;
}

export function DocumentUpload({
  open,
  onOpenChange,
  onSuccess,
  contactId,
  foyerId,
}: DocumentUploadProps) {
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{
    path: string;
    name: string;
    size: number;
  } | null>(null);
  const [formData, setFormData] = useState<Partial<NewDocument>>({
    contact_id: contactId,
    foyer_id: foyerId,
    type_document: "AUTRE",
    date_document: "",
    notes: "",
  });

  const handleFileSelect = async () => {
    try {
      const file = await uploadDocument();
      if (file) {
        setUploadedFile(file);
        setFormData((prev) => ({
          ...prev,
          nom_fichier: file.name,
        }));
      }
    } catch (error) {
      console.error("Error selecting file:", error);
      alert("Erreur lors de la sélection du fichier: " + String(error));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadedFile) {
      alert("Veuillez sélectionner un fichier");
      return;
    }

    setLoading(true);

    try {
      const newDoc: NewDocument = {
        contact_id: formData.contact_id,
        foyer_id: formData.foyer_id,
        type_document: formData.type_document || "AUTRE",
        nom_fichier: uploadedFile.name,
        chemin_fichier: uploadedFile.path,
        taille_fichier: uploadedFile.size,
        mime_type: getMimeType(uploadedFile.name),
        date_document: formData.date_document || undefined,
        notes: formData.notes,
      };

      await createDocument(newDoc);
      onSuccess();
      onOpenChange(false);
      
      // Réinitialiser
      setUploadedFile(null);
      setFormData({
        contact_id: contactId,
        foyer_id: foyerId,
        type_document: "AUTRE",
        date_document: "",
        notes: "",
      });
    } catch (error) {
      console.error("Error saving document:", error);
      alert("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const getMimeType = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      txt: "text/plain",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer un document</DialogTitle>
          <DialogDescription>
            Sélectionnez un fichier et renseignez les informations
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Sélection du fichier */}
          <div className="space-y-2">
            <Label>Fichier *</Label>
            {uploadedFile ? (
              <div className="flex items-center gap-2 p-3 border border-border rounded-lg">
                <File className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">{uploadedFile.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatFileSize(uploadedFile.size)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setUploadedFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleFileSelect}
              >
                <Upload className="h-4 w-4 mr-2" />
                Sélectionner un fichier
              </Button>
            )}
          </div>

          {/* Type de document */}
          <div className="space-y-2">
            <Label htmlFor="type_document">Type de document *</Label>
            <Select
              value={formData.type_document}
              onValueChange={(value) =>
                setFormData({ ...formData, type_document: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IDENTITE">Pièce d'identité</SelectItem>
                <SelectItem value="FISCAL">Document fiscal</SelectItem>
                <SelectItem value="PATRIMOINE">Document patrimonial</SelectItem>
                <SelectItem value="CONTRAT">Contrat</SelectItem>
                <SelectItem value="RELEVE">Relevé</SelectItem>
                <SelectItem value="AUTRE">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date du document */}
          <div className="space-y-2">
            <Label htmlFor="date_document">Date du document</Label>
            <Input
              id="date_document"
              type="date"
              value={formData.date_document || ""}
              onChange={(e) =>
                setFormData({ ...formData, date_document: e.target.value })
              }
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
              placeholder="Informations complémentaires..."
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading || !uploadedFile}>
              {loading ? "Enregistrement..." : "Importer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
