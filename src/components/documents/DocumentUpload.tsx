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
import { Upload, File, X, FileText } from "lucide-react";
import { uploadDocument, createDocument, type NewDocument } from "@/lib/api/tauri-documents";
import { extractTextFromPDFPath, parseAuto, type ExtractedData } from "@/lib/pdf";
import { ExtractedDataPreviewAdvanced } from "./ExtractedDataPreviewAdvanced";
import { findContactByEmail, createContact, updateContact, type NewContact } from "@/lib/api/tauri-contacts";

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
  const [extracting, setExtracting] = useState(false);
  const [autoExtract, setAutoExtract] = useState(true);
  const [extractedText, setExtractedText] = useState<string>("");
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
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

        // Si c'est un PDF et que l'extraction auto est activée
        if (autoExtract && file.name.toLowerCase().endsWith(".pdf")) {
          await handleExtractText(file.path);
        }
      }
    } catch (error) {
      console.error("Error selecting file:", error);
      alert("Erreur lors de la sélection du fichier: " + String(error));
    }
  };

  const handleExtractText = async (filePath: string) => {
    setExtracting(true);
    setExtractedText("");
    setExtractedData(null);

    try {
      console.log("🔍 Extraction du texte du PDF...");
      const result = await extractTextFromPDFPath(filePath);

      console.log("✅ Extraction réussie!");
      console.log(`📄 Pages: ${result.numPages}`);
      console.log(`📊 Longueur du texte: ${result.text.length} caractères`);

      setExtractedText(result.text);

      // Parser les données
      console.log("🔍 Parsing des données...");
      const parsedData = parseAuto(result.text);

      console.log("✅ Données extraites:", parsedData);
      console.log(`📊 Confiance: ${parsedData.confidence}%`);

      setExtractedData(parsedData);

      // Afficher l'interface de prévisualisation
      setShowPreview(true);
    } catch (error) {
      console.error("❌ Erreur lors de l'extraction:", error);
      alert("Erreur lors de l'extraction du texte: " + String(error));
    } finally {
      setExtracting(false);
    }
  };

  /**
   * Convertit une date française (jj/mm/aaaa) en timestamp
   */
  const parseFrenchDate = (dateStr?: string): Date | undefined => {
    if (!dateStr) return undefined;
    
    // Format: 19/07/1995 ou 08/04/2025
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return undefined;
    
    const [, day, month, year] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  /**
   * Mappe ExtractedData vers NewContact
   */
  const mapExtractedDataToContact = (data: ExtractedData): NewContact => {
    const contact: NewContact = {
      nom: data.nom || "",
      prenom: data.prenom || "",
      categorie: "SUSPECT_CLIENT", // Par défaut
      statut_suivi: "ACTIF", // Par défaut
    };

    // Civilité (conversion MME/M vers MME/M du schema)
    if (data.civilite) {
      const civiliteMap: Record<string, "M" | "MME" | "AUTRE"> = {
        "M": "M",
        "M.": "M",
        "MONSIEUR": "M",
        "MME": "MME",
        "MADAME": "MME",
      };
      contact.civilite = civiliteMap[data.civilite.toUpperCase()] || "AUTRE";
    }

    // Coordonnées
    if (data.email) contact.email = data.email;
    if (data.telephone) contact.telephone = data.telephone;
    if (data.adresse) contact.adresse = data.adresse;
    if (data.codePostal) contact.code_postal = data.codePostal;
    if (data.ville) contact.ville = data.ville;

    // Informations personnelles
    if (data.dateNaissance) {
      const parsedDate = parseFrenchDate(data.dateNaissance);
      if (parsedDate) {
        contact.date_naissance = parsedDate.toISOString();
      }
    }
    if (data.profession) contact.profession = data.profession;

    // Situation familiale (conversion)
    if (data.situationFamiliale) {
      const situationMap: Record<string, "CELIBATAIRE" | "MARIE" | "PACSE" | "DIVORCE" | "VEUF" | "AUTRE"> = {
        "CELIBATAIRE": "CELIBATAIRE",
        "MARIE": "MARIE",
        "MARIÉ": "MARIE",
        "MARIEE": "MARIE",
        "MARIÉE": "MARIE",
        "PACSE": "PACSE",
        "PACS": "PACSE",
        "PACSÉ": "PACSE",
        "PACSEE": "PACSE",
        "DIVORCE": "DIVORCE",
        "DIVORCÉ": "DIVORCE",
        "DIVORCEE": "DIVORCE",
        "DIVORCÉE": "DIVORCE",
        "VEUF": "VEUF",
        "VEUVE": "VEUF",
      };
      contact.situation_familiale = situationMap[data.situationFamiliale.toUpperCase()] || "AUTRE";
    }

    return contact;
  };

  /**
   * Applique les données extraites : crée ou met à jour le contact
   */
  const handleApplyData = async (data: ExtractedData) => {
    console.log("📝 Données à appliquer:", data);
    setLoading(true);

    try {
      let finalContactId = contactId;
      let successMessage = "";
      
      // 1. Chercher un contact existant par email
      if (data.email) {
        const existingContact = await findContactByEmail(data.email);
        
        if (existingContact) {
          // Contact existant → UPDATE (fusion des données)
          console.log("✏️ Mise à jour du contact existant:", existingContact.id);
          const newData = mapExtractedDataToContact(data);
          const mergedData: NewContact = {
            ...newData, // Nouvelles données
            foyer_id: existingContact.foyer_id,
            statut_suivi: existingContact.statut_suivi, // Préserver le statut actuel
            notes: existingContact.notes,
            source_lead: existingContact.source_lead,
            profil_risque_sri: existingContact.profil_risque_sri,
          };
          await updateContact(existingContact.id, mergedData);
          finalContactId = existingContact.id;
          successMessage = `✅ Contact mis à jour: ${data.prenom} ${data.nom}`;
        } else {
          // Contact inexistant → CREATE
          console.log("➕ Création d'un nouveau contact");
          const contactData = mapExtractedDataToContact(data);
          const newContact = await createContact(contactData);
          finalContactId = newContact.id;
          successMessage = `✅ Nouveau contact créé: ${data.prenom} ${data.nom}`;
        }
      } else {
        // Pas d'email → impossible de chercher, on crée forcément
        console.log("⚠️ Pas d'email → création forcée");
        const contactData = mapExtractedDataToContact(data);
        const newContact = await createContact(contactData);
        finalContactId = newContact.id;
        successMessage = `✅ Nouveau contact créé: ${data.prenom} ${data.nom} (sans email)`;
      }

      // 2. Enregistrer le document lié au contact
      if (uploadedFile && finalContactId) {
        const newDoc: NewDocument = {
          contact_id: finalContactId,
          foyer_id: foyerId,
          type_document: data.typeDocument === "RIO" ? "PATRIMOINE" : formData.type_document || "AUTRE",
          nom_fichier: uploadedFile.name,
          chemin_fichier: uploadedFile.path,
          taille_fichier: uploadedFile.size,
          mime_type: getMimeType(uploadedFile.name),
          date_document: data.dateDocument ? convertDateToISO(data.dateDocument) : formData.date_document || undefined,
          notes: formData.notes,
        };

        await createDocument(newDoc);
        console.log("📄 Document enregistré");
      }

      // 3. Afficher le succès
      alert(successMessage + "\n\n📄 Document enregistré avec succès!");

      // 4. Fermer et rafraîchir
      setShowPreview(false);
      setExtractedData(null);
      onSuccess();
      onOpenChange(false);

      // Réinitialiser
      setUploadedFile(null);
      setExtractedText("");
      setFormData({
        contact_id: contactId,
        foyer_id: foyerId,
        type_document: "AUTRE",
        date_document: "",
        notes: "",
      });

    } catch (error) {
      console.error("❌ Erreur lors de l'application des données:", error);
      alert("❌ Erreur lors de l'enregistrement:\n\n" + String(error));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Convertit une date française en format ISO (YYYY-MM-DD)
   */
  const convertDateToISO = (dateStr: string): string => {
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return dateStr;
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  };

  const handleIgnoreData = () => {
    console.log("🚫 Données ignorées");
    setExtractedData(null);
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
      setExtractedText("");
      setExtractedData(null);
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
    <>
      {/* Dialog de prévisualisation des données */}
      {extractedData && (
        <ExtractedDataPreviewAdvanced
          open={showPreview}
          onOpenChange={setShowPreview}
          extractedData={extractedData}
          onApply={handleApplyData}
          onIgnore={handleIgnoreData}
        />
      )}

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
              <div className="space-y-2">
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
                    onClick={() => {
                      setUploadedFile(null);
                      setExtractedText("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Indicateur d'extraction */}
                {extracting && (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                    <FileText className="h-4 w-4 animate-pulse" />
                    Extraction du texte en cours...
                  </div>
                )}

                {/* Texte extrait (succès) */}
                {!extracting && extractedText && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    <FileText className="h-4 w-4" />
                    Texte extrait ({extractedText.length} caractères)
                  </div>
                )}
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

            {/* Option d'extraction automatique */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-extract"
                checked={autoExtract}
                onChange={(e) => setAutoExtract(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label
                htmlFor="auto-extract"
                className="text-sm font-normal cursor-pointer"
              >
                Extraire automatiquement les données des PDF
              </Label>
            </div>
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
    </>
  );
}
