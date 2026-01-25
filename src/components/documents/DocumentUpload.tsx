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
import { PatrimoineTriDialog } from "./PatrimoineTriDialog";
import { RioUpdateComparisonDialog } from "./RioUpdateComparisonDialog";
import { findContactByEmail, createContact, updateContact, getContactById, type NewContact } from "@/lib/api/tauri-contacts";
import { createInvestissement, getInvestissementsByContact, type NewInvestissement } from "@/lib/api/tauri-investissements";

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
  
  // États pour le dialogue de tri du patrimoine
  const [showPatrimoineTri, setShowPatrimoineTri] = useState(false);
  const [triContactId, setTriContactId] = useState<number | null>(null);
  const [triExtractedData, setTriExtractedData] = useState<ExtractedData | null>(null);
  
  // États pour le dialogue de mise à jour (comparaison)
  const [showRioUpdate, setShowRioUpdate] = useState(false);
  const [updateContactNom, setUpdateContactNom] = useState<string>("");
  
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
      const result = await extractTextFromPDFPath(filePath);
      setExtractedText(result.text);

      // Parser les données
      const parsedData = parseAuto(result.text);
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
   * Convertit une date française (jj/mm/aaaa) en Date
   * Utilise Date.UTC pour éviter les problèmes de timezone
   */
  const parseFrenchDate = (dateStr?: string): Date | undefined => {
    if (!dateStr) return undefined;
    
    // Format: 19/07/1995 ou 08/04/2025
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return undefined;
    
    const [, day, month, year] = match;
    // Utiliser Date.UTC avec heure à midi pour éviter le décalage de timezone
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0));
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
    setLoading(true);

    try {
      let finalContactId = contactId;
      let successMessage = "";
      let isExistingContactWithInvestments = false;
      let existingContactNom = "";
      
      // 1. Chercher un contact existant par email
      if (data.email) {
        const existingContact = await findContactByEmail(data.email);
        
        if (existingContact) {
          // Contact existant → UPDATE (fusion des données)
          const newData = mapExtractedDataToContact(data);
          const mergedData: NewContact = {
            ...newData, // Nouvelles données
            foyer_id: existingContact.foyer_id,
            categorie: existingContact.categorie, // PRÉSERVER la catégorie existante !
            statut_suivi: existingContact.statut_suivi, // Préserver le statut actuel
            notes: existingContact.notes,
            source_lead: existingContact.source_lead,
            profil_risque_sri: existingContact.profil_risque_sri,
          };
          await updateContact(existingContact.id, mergedData);
          finalContactId = existingContact.id;
          successMessage = `✅ Contact mis à jour: ${data.prenom} ${data.nom}`;
          existingContactNom = `${existingContact.prenom} ${existingContact.nom}`;
          
          // Vérifier si le contact a déjà des investissements
          try {
            const existingInvestissements = await getInvestissementsByContact(existingContact.id);
            isExistingContactWithInvestments = existingInvestissements.length > 0;
          } catch {
            isExistingContactWithInvestments = false;
          }
        } else {
          // Contact inexistant → CREATE
          const contactData = mapExtractedDataToContact(data);
          const newContact = await createContact(contactData);
          finalContactId = newContact.id;
          successMessage = `✅ Nouveau contact créé: ${data.prenom} ${data.nom}`;
        }
      } else {
        // Pas d'email → impossible de chercher, on crée forcément
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
      }

      // 3. Vérifier s'il y a du patrimoine à trier (RIO avec AV, PER, SCPI, immobilier...)
      const hasPatrimoineToTri = Boolean(
        data.assuranceVie || 
        data.per || 
        data.scpi || 
        data.residencePrincipale?.valeur ||
        data.residenceSecondaire?.valeur ||
        data.immobilierLocatif?.valeur ||
        (data.biensImmobiliers && data.biensImmobiliers.length > 0) ||
        data.livretA ||
        data.ldd ||
        data.compteCourant
      );

      if (hasPatrimoineToTri && finalContactId) {
        setShowPreview(false);
        setTriContactId(finalContactId);
        setTriExtractedData(data);
        
        if (isExistingContactWithInvestments) {
          // Contact existant avec investissements → Afficher le dialogue de COMPARAISON
          setUpdateContactNom(existingContactNom || `${data.prenom} ${data.nom}`);
          setShowRioUpdate(true);
        } else {
          // Nouveau contact ou contact sans investissements → Afficher le dialogue de TRI classique
          setShowPatrimoineTri(true);
        }
      } else {
        // Pas de patrimoine → terminer normalement
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
      }

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
    setExtractedData(null);
  };

  /**
   * Gère la validation du tri du patrimoine
   */
  const handlePatrimoineTriComplete = async (investissements: NewInvestissement[]) => {
    setLoading(true);
    
    try {
      // Créer chaque investissement
      for (const inv of investissements) {
        await createInvestissement(inv);
      }
      
      // Compter les investissements par origine
      const avecMoi = investissements.filter(i => i.origine === "MON_CONSEIL").length;
      const aCote = investissements.filter(i => i.origine === "EXISTANT_CLIENT").length;
      
      // Mise à jour de la catégorie du contact
      // Si au moins 1 "avec moi" → CLIENT
      // Sinon (RIO sans investissement "avec moi") → PROSPECT (car RIO = contact établi)
      if (triContactId) {
        try {
          const existingContact = await getContactById(triContactId);
          const newCategorie = avecMoi > 0 ? "CLIENT" : "PROSPECT_CLIENT";
          
          // Mettre à jour la catégorie si différente
          if (existingContact.categorie !== newCategorie) {
            // Préparer les données de mise à jour
            // Gérer la date de naissance avec prudence
            let dateNaissanceISO: string | undefined = undefined;
            if (existingContact.date_naissance && existingContact.date_naissance > 0) {
              try {
                const dateObj = new Date(existingContact.date_naissance * 1000);
                if (!isNaN(dateObj.getTime())) {
                  dateNaissanceISO = dateObj.toISOString();
                }
              } catch {
                // Date de naissance invalide, ignorer
              }
            }
            
            const updatedContact: NewContact = {
              nom: existingContact.nom,
              prenom: existingContact.prenom,
              categorie: newCategorie,
              statut_suivi: existingContact.statut_suivi,
              civilite: existingContact.civilite,
              email: existingContact.email,
              telephone: existingContact.telephone,
              adresse: existingContact.adresse,
              code_postal: existingContact.code_postal,
              ville: existingContact.ville,
              date_naissance: dateNaissanceISO,
              profession: existingContact.profession,
              situation_familiale: existingContact.situation_familiale,
              foyer_id: existingContact.foyer_id,
              notes: existingContact.notes,
              source_lead: existingContact.source_lead,
              profil_risque_sri: existingContact.profil_risque_sri,
            };
            
            await updateContact(triContactId, updatedContact);
          }
        } catch {
          // Impossible de mettre à jour la catégorie, ignorer
        }
      }
      
      alert(`✅ Import terminé!\n\n🎯 Avec moi: ${avecMoi} investissement(s)\n📋 À côté: ${aCote} investissement(s)`);
      
      // Réinitialiser et fermer
      setShowPatrimoineTri(false);
      setTriContactId(null);
      setTriExtractedData(null);
      setExtractedData(null);
      setUploadedFile(null);
      setExtractedText("");
      setFormData({
        contact_id: contactId,
        foyer_id: foyerId,
        type_document: "AUTRE",
        date_document: "",
        notes: "",
      });
      
      onSuccess();
      onOpenChange(false);
      
    } catch (error) {
      console.error("❌ Erreur lors de la création des investissements:", error);
      alert("❌ Erreur lors de la création des investissements:\n\n" + String(error));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Annule le tri du patrimoine
   */
  const handlePatrimoineTriCancel = () => {
    setShowPatrimoineTri(false);
    setTriContactId(null);
    setTriExtractedData(null);
    
    // Fermer tout
    onSuccess();
    onOpenChange(false);
  };

  /**
   * Gère la validation de la mise à jour RIO (comparaison)
   */
  const handleRioUpdateComplete = () => {
    setShowRioUpdate(false);
    setTriContactId(null);
    setTriExtractedData(null);
    setUpdateContactNom("");
    
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
    
    onSuccess();
    onOpenChange(false);
  };

  /**
   * Annule la mise à jour RIO
   */
  const handleRioUpdateCancel = () => {
    setShowRioUpdate(false);
    setTriContactId(null);
    setTriExtractedData(null);
    setUpdateContactNom("");
    
    // Fermer tout
    onSuccess();
    onOpenChange(false);
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

      {/* Dialog de tri du patrimoine (nouveau contact) */}
      {triExtractedData && triContactId && (
        <PatrimoineTriDialog
          open={showPatrimoineTri}
          onOpenChange={setShowPatrimoineTri}
          extractedData={triExtractedData}
          contactId={triContactId}
          onComplete={handlePatrimoineTriComplete}
          onCancel={handlePatrimoineTriCancel}
        />
      )}
      
      {/* Dialog de comparaison RIO (mise à jour contact existant) */}
      {triExtractedData && triContactId && (
        <RioUpdateComparisonDialog
          open={showRioUpdate}
          onOpenChange={setShowRioUpdate}
          extractedData={triExtractedData}
          contactId={triContactId}
          contactNom={updateContactNom}
          onComplete={handleRioUpdateComplete}
          onCancel={handleRioUpdateCancel}
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
