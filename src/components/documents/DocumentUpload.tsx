import { useEffect, useState } from "react";
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
import { extractTextFromPDFPath, parseAuto, isNativeTextPDF, type ExtractedData } from "@/lib/pdf";
import { ExtractedDataPreviewAdvanced } from "./ExtractedDataPreviewAdvanced";
import { IdentityExtractPreviewDialog, type IdentityPreviewValues } from "./IdentityExtractPreviewDialog";
import { PatrimoineTriDialog } from "./PatrimoineTriDialog";
import { RioUpdateComparisonDialog } from "./RioUpdateComparisonDialog";
import {
  extractIdentityFromFilePath,
  extractIdentityFromRectoVersoFiles,
  isIdentityFilePath,
  isLikelyIdentityFileName,
  looksLikeIdentityDocument,
  parseIdentityFromText,
  resolveIdentityToastMessage,
  terminateOcrWorker,
  type IdentityExtractResult,
} from "@/lib/identity";
import { buildIdentityMergePatch, identityExpirationToDocumentDate } from "@/lib/identity/merge-identity-fields";
import { identityDateFrToIso } from "@/lib/identity/parse-identity-document";
import {
  findContactByEmail,
  findContactByName,
  createContact,
  updateContact,
  getContactById,
  getAllContacts,
  type Contact,
  type NewContact,
} from "@/lib/api/tauri-contacts";
import { createInvestissement, getInvestissementsByContact, type NewInvestissement } from "@/lib/api/tauri-investissements";
import { toast } from "sonner";
import {
  formatIdentityLine,
  getPairIdentityConflictMessages,
} from "@/lib/contacts/duplicate-identity";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";

interface DocumentUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  contactId?: number;
  /** Pré-sélection client (page Documents filtrée) — modifiable. */
  defaultContactId?: number;
  foyerId?: number;
  /** Affichage dialogue identité (fiche contact). */
  contactNom?: string;
  contactPrenom?: string;
  contactDateNaissance?: number;
  contactLieuNaissance?: string;
}

const IDENTITY_REQUIRED_MSG =
  "Sélectionnez un client pour importer une pièce d'identité.";

type PickedFile = { path: string; name: string; size: number };
type IdentityImportMode = "single" | "two_files";

export function DocumentUpload({
  open,
  onOpenChange,
  onSuccess,
  contactId,
  defaultContactId,
  foyerId,
  contactNom,
  contactPrenom,
  contactDateNaissance,
  contactLieuNaissance,
}: DocumentUploadProps) {
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [autoExtract, setAutoExtract] = useState(true);
  const [extractedText, setExtractedText] = useState<string>("");
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showIdentityPreview, setShowIdentityPreview] = useState(false);
  const [identityExtracted, setIdentityExtracted] = useState<IdentityExtractResult | null>(null);
  const [identityImportMode, setIdentityImportMode] = useState<IdentityImportMode>("single");
  const [uploadedVersoFile, setUploadedVersoFile] = useState<PickedFile | null>(null);
  
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
  const [selectedContactId, setSelectedContactId] = useState<number | undefined>(
    contactId ?? defaultContactId
  );
  const [importContacts, setImportContacts] = useState<Contact[]>([]);
  const [linkedContact, setLinkedContact] = useState<Contact | null>(null);
  const contactLocked = contactId != null;
  const effectiveContactId = contactId ?? selectedContactId;
  const [formData, setFormData] = useState<Partial<NewDocument>>({
    contact_id: contactId ?? defaultContactId,
    foyer_id: foyerId,
    type_document: "AUTRE",
    date_document: "",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setSelectedContactId(contactId ?? defaultContactId);
    setFormData((prev) => ({
      ...prev,
      contact_id: contactId ?? defaultContactId,
      foyer_id: foyerId,
    }));
  }, [open, contactId, defaultContactId, foyerId]);

  useEffect(() => {
    if (!open || contactLocked) return;
    void getAllContacts()
      .then(setImportContacts)
      .catch((error) => console.error("Error loading contacts:", error));
  }, [open, contactLocked]);

  useEffect(() => {
    if (!effectiveContactId) {
      setLinkedContact(null);
      return;
    }
    if (contactLocked) return;
    void getContactById(effectiveContactId)
      .then(setLinkedContact)
      .catch((error) => {
        console.error("Error loading contact:", error);
        setLinkedContact(null);
      });
  }, [effectiveContactId, contactLocked]);

  useEffect(() => {
    setFormData((prev) => ({ ...prev, contact_id: effectiveContactId }));
  }, [effectiveContactId]);

  const isIdentityMode = formData.type_document === "IDENTITE";

  const shouldUseIdentityPipeline = (fileName: string, typeDoc?: string) =>
    isImageFile(fileName) ||
    typeDoc === "IDENTITE" ||
    isLikelyIdentityFileName(fileName);

  const openIdentityPreviewFromText = (text: string) => {
    const parsed = parseIdentityFromText(text);
    setIdentityExtracted(parsed);
    setExtractedText(text);
    setExtractedData(null);
    setShowPreview(false);
    setShowIdentityPreview(true);
    if (parsed.confidence < 50) {
      const toastMsg = resolveIdentityToastMessage(parsed);
      if (toastMsg) toast.warning(toastMsg);
    }
  };

  const requireContactForIdentity = (): boolean => {
    if (effectiveContactId) return true;
    toast.error(IDENTITY_REQUIRED_MSG);
    return false;
  };

  const isImageFile = (name: string) => /\.(jpe?g|png|webp)$/i.test(name);

  const resetIdentityFiles = () => {
    setUploadedFile(null);
    setUploadedVersoFile(null);
    setExtractedText("");
    setIdentityExtracted(null);
  };

  const runIdentityExtractForCurrentFiles = async () => {
    if (!uploadedFile || !requireContactForIdentity()) return;
    if (!isIdentityFilePath(uploadedFile.path)) {
      toast.error("Format non supporté pour la pièce d'identité (PDF, JPG, PNG).");
      return;
    }
    if (identityImportMode === "two_files") {
      if (!uploadedVersoFile) {
        toast.error("Sélectionnez aussi le fichier verso.");
        return;
      }
      if (!isIdentityFilePath(uploadedVersoFile.path)) {
        toast.error("Format verso non supporté (PDF, JPG, PNG).");
        return;
      }
      await runDualIdentityExtract(uploadedFile, uploadedVersoFile);
      return;
    }
    await handleExtractIdentity(uploadedFile.path);
  };

  const canRunIdentityExtract =
    Boolean(effectiveContactId) &&
    isIdentityMode &&
    uploadedFile &&
    isIdentityFilePath(uploadedFile.path) &&
    (identityImportMode === "single" || Boolean(uploadedVersoFile));

  const runDualIdentityExtract = async (recto: PickedFile, verso: PickedFile) => {
    if (!requireContactForIdentity()) return;

    setExtracting(true);
    setIdentityExtracted(null);
    setExtractedData(null);
    setExtractedText("");

    try {
      const result = await extractIdentityFromRectoVersoFiles(recto.path, verso.path);
      setIdentityExtracted(result);
      setExtractedText(result.rawText);
      setShowIdentityPreview(true);
      toast.info("Extraction terminée — vérifiez les champs avant d'appliquer.");
      const toastMsg = resolveIdentityToastMessage(result);
      if (toastMsg) toast.warning(toastMsg);
    } catch (error) {
      console.error("Erreur extraction identité (2 fichiers):", error);
      toast.error("Erreur lors de la lecture recto/verso: " + String(error));
    } finally {
      setExtracting(false);
    }
  };

  const handleVersoFileSelect = async () => {
    try {
      const file = await uploadDocument();
      if (!file) return;

      setUploadedVersoFile(file);
      setFormData((prev) => ({
        ...prev,
        type_document: prev.type_document === "AUTRE" ? "IDENTITE" : prev.type_document,
      }));

      if (!autoExtract || !uploadedFile || !isIdentityFilePath(file.path)) return;
      if (!isIdentityFilePath(uploadedFile.path)) return;

      await runDualIdentityExtract(uploadedFile, file);
    } catch (error) {
      console.error("Error selecting verso file:", error);
      alert("Erreur lors de la sélection du verso: " + String(error));
    }
  };

  const handleFileSelect = async () => {
    try {
      const file = await uploadDocument();
      if (file) {
        const nextType =
          isImageFile(file.name) && (formData.type_document ?? "AUTRE") === "AUTRE"
            ? "IDENTITE"
            : formData.type_document ?? "AUTRE";

        setUploadedFile(file);
        setFormData((prev) => ({
          ...prev,
          nom_fichier: file.name,
          type_document: nextType,
        }));

        if (identityImportMode === "two_files") {
          if (autoExtract && uploadedVersoFile && isIdentityFilePath(file.path)) {
            await runDualIdentityExtract(file, uploadedVersoFile);
          }
          return;
        }

        if (!autoExtract || !isIdentityFilePath(file.path)) return;

        if (shouldUseIdentityPipeline(file.name, nextType)) {
          await handleExtractIdentity(file.path);
        } else if (file.name.toLowerCase().endsWith(".pdf")) {
          await handleExtractText(file.path);
        }
      }
    } catch (error) {
      console.error("Error selecting file:", error);
      alert("Erreur lors de la sélection du fichier: " + String(error));
    }
  };

  const handleExtractIdentity = async (filePath: string) => {
    if (!requireContactForIdentity()) return;

    setExtracting(true);
    setIdentityExtracted(null);
    setExtractedData(null);
    setExtractedText("");

    try {
      const result = await extractIdentityFromFilePath(filePath);
      setIdentityExtracted(result);
      setExtractedText(result.rawText);
      setShowIdentityPreview(true);
      toast.info("Extraction terminée — vérifiez les champs avant d'appliquer.");
      const toastMsg = resolveIdentityToastMessage(result);
      if (toastMsg) toast.warning(toastMsg);
    } catch (error) {
      console.error("Erreur extraction identité:", error);
      toast.error("Erreur lors de la lecture de la pièce d'identité: " + String(error));
    } finally {
      setExtracting(false);
    }
  };

  const handleExtractText = async (filePath: string) => {
    setExtracting(true);
    setExtractedText("");
    setExtractedData(null);

    try {
      const result = await extractTextFromPDFPath(filePath);
      setExtractedText(result.text);

      if (
        isIdentityMode ||
        looksLikeIdentityDocument(result.text) ||
        isLikelyIdentityFileName(filePath)
      ) {
        if (!requireContactForIdentity()) {
          setExtracting(false);
          return;
        }
        if (!isNativeTextPDF(result.text)) {
          await handleExtractIdentity(filePath);
          return;
        }
        openIdentityPreviewFromText(result.text);
        return;
      }

      if (!isNativeTextPDF(result.text)) {
        toast.warning(
          "Peu de texte extrait : PDF probablement scanné. Vérifiez les données avant d'appliquer."
        );
      }

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
      const situationMap: Record<
        string,
        "CELIBATAIRE" | "MARIE" | "PACSE" | "UNION_LIBRE" | "DIVORCE" | "VEUF" | "AUTRE"
      > = {
        "CELIBATAIRE": "CELIBATAIRE",
        "MARIE": "MARIE",
        "MARIÉ": "MARIE",
        "MARIEE": "MARIE",
        "MARIÉE": "MARIE",
        "PACSE": "PACSE",
        "PACS": "PACSE",
        "PACSÉ": "PACSE",
        "PACSEE": "PACSE",
        "UNION_LIBRE": "UNION_LIBRE",
        "UNION LIBRE": "UNION_LIBRE",
        "CONCUBINAGE": "UNION_LIBRE",
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

  const resolveExistingContact = async (data: ExtractedData): Promise<Contact | null> => {
    if (effectiveContactId) {
      try {
        return await getContactById(effectiveContactId);
      } catch {
        // Fiche introuvable : retomber sur email / nom comme pour un import libre
      }
    }
    if (data.email?.trim()) {
      const byEmail = await findContactByEmail(data.email.trim());
      if (byEmail) return byEmail;
    }
    const nom = data.nom?.trim();
    const prenom = data.prenom?.trim();
    if (nom && prenom) {
      return await findContactByName(nom, prenom);
    }
    return null;
  };

  /**
   * Applique les données extraites : crée ou met à jour le contact
   */
  const handleApplyData = async (data: ExtractedData) => {
    setLoading(true);

    try {
      let finalContactId = effectiveContactId;
      let successMessage = "";
      let isExistingContactWithInvestments = false;
      let existingContactNom = "";

      let existingContact = await resolveExistingContact(data);

      const identityConflicts =
        existingContact &&
        getPairIdentityConflictMessages(
          { email: data.email, telephone: data.telephone },
          existingContact
        );

      if (existingContact && identityConflicts && identityConflicts.length > 0) {
        const confirmMerge = window.confirm(
          [
            "Même nom/prénom mais coordonnées différentes :",
            identityConflicts.join(", "),
            "",
            "Fiche en base :",
            formatIdentityLine(existingContact),
            "Document :",
            formatIdentityLine({ email: data.email, telephone: data.telephone }),
            "",
            "Fusionner sur la fiche existante ?",
            "(Annuler = créer une nouvelle fiche)",
          ].join("\n")
        );
        if (!confirmMerge) {
          existingContact = null;
        }
      }

      if (existingContact) {
        const newData = mapExtractedDataToContact(data);
        await updateContact(
          existingContact.id,
          contactToUpdatePayload(existingContact, {
            nom: newData.nom || existingContact.nom,
            prenom: newData.prenom || existingContact.prenom,
            email: newData.email || existingContact.email,
            telephone: newData.telephone || existingContact.telephone,
            adresse: newData.adresse || existingContact.adresse,
            code_postal: newData.code_postal || existingContact.code_postal,
            ville: newData.ville || existingContact.ville,
            date_naissance: newData.date_naissance || undefined,
            profession: newData.profession || existingContact.profession,
            notes: newData.notes || existingContact.notes,
          })
        );
        finalContactId = existingContact.id;
        successMessage = `✅ Contact mis à jour: ${data.prenom} ${data.nom}`;
        existingContactNom = `${existingContact.prenom} ${existingContact.nom}`;

        try {
          const existingInvestissements = await getInvestissementsByContact(existingContact.id);
          isExistingContactWithInvestments = existingInvestissements.length > 0;
        } catch {
          isExistingContactWithInvestments = false;
        }
      } else {
        const contactData = mapExtractedDataToContact(data);
        if (!contactData.nom?.trim() || !contactData.prenom?.trim()) {
          toast.error(
            "Impossible de créer le contact : nom et prénom manquants. Pour une CNI/passeport, importez depuis la fiche client (Patrimoine → Importer un document)."
          );
          return;
        }
        const newContact = await createContact(contactData);
        finalContactId = newContact.id;
        const sansEmail = !data.email?.trim();
        successMessage = sansEmail
          ? `✅ Nouveau contact créé: ${data.prenom} ${data.nom} (sans email)`
          : `✅ Nouveau contact créé: ${data.prenom} ${data.nom}`;
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
          contact_id: contactId ?? defaultContactId,
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
            await updateContact(
              triContactId,
              contactToUpdatePayload(existingContact, { categorie: newCategorie })
            );
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
        contact_id: contactId ?? defaultContactId,
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
    setTriExtractedData(null);
    if (triContactId) {
      toast.info("Patrimoine non importé. Le contact créé reste dans la base.");
    }
    setTriContactId(null);
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
      contact_id: contactId ?? defaultContactId,
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
    setTriExtractedData(null);
    if (triContactId) {
      toast.info("Mise à jour RIO annulée. Le contact reste enregistré.");
    }
    setTriContactId(null);
    setUpdateContactNom("");
    onSuccess();
    onOpenChange(false);
  };

  const handleApplyIdentity = async (values: IdentityPreviewValues) => {
    if (!effectiveContactId || !uploadedFile) {
      toast.error("Contact ou fichier manquant.");
      return;
    }
    if (identityImportMode === "two_files" && !uploadedVersoFile) {
      toast.error("Sélectionnez aussi le fichier verso.");
      return;
    }

    setLoading(true);
    try {
      const contact = await getContactById(effectiveContactId);
      const extracted: IdentityExtractResult = {
        source: identityExtracted?.source ?? "visual",
        confidence: identityExtracted?.confidence ?? 0,
        rawText: identityExtracted?.rawText ?? "",
        mrzVerified: identityExtracted?.mrzVerified ?? false,
        provenance: identityExtracted?.provenance ?? {
          dateNaissance: values.dateNaissanceFr ? "visual_suggestion" : "none",
          dateExpiration: values.dateExpirationFr ? "visual_suggestion" : "none",
          lieuNaissance: values.lieuNaissance ? "visual_suggestion" : "none",
          nom: values.nom ? "visual_suggestion" : "none",
          prenom: values.prenom ? "visual_suggestion" : "none",
        },
        nom: values.nom || undefined,
        prenom: values.prenom || undefined,
        lieuNaissance: values.lieuNaissance || undefined,
        dateNaissanceFr: values.dateNaissanceFr || undefined,
        dateNaissance: values.dateNaissanceFr
          ? identityDateFrToIso(values.dateNaissanceFr)
          : undefined,
        dateExpirationFr: values.dateExpirationFr || undefined,
        dateExpiration: values.dateExpirationFr
          ? identityDateFrToIso(values.dateExpirationFr)
          : undefined,
        sex: identityExtracted?.sex,
        layout: identityExtracted?.layout,
        documentKind: identityExtracted?.documentKind,
      };

      const { patch, filledFields, skippedFields } = buildIdentityMergePatch(contact, extracted);
      if (Object.keys(patch).length === 0) {
        toast.info("Aucun champ vide à compléter sur cette fiche.");
      } else {
        await updateContact(effectiveContactId, contactToUpdatePayload(contact, patch));
        toast.success(`Fiche complétée : ${filledFields.join(", ")}`);
      }
      if (skippedFields.length > 0) {
        toast.message(`Conservé (déjà renseigné) : ${skippedFields.join(", ")}`);
      }

      const documentExpiryDate =
        identityExpirationToDocumentDate(values.dateExpirationFr) ||
        formData.date_document ||
        undefined;

      await createDocument({
        contact_id: effectiveContactId,
        foyer_id: foyerId,
        type_document: "IDENTITE",
        nom_fichier: uploadedFile.name,
        chemin_fichier: uploadedFile.path,
        taille_fichier: uploadedFile.size,
        mime_type: getMimeType(uploadedFile.name),
        date_document: documentExpiryDate,
        notes: formData.notes
          ? `${formData.notes}${identityImportMode === "two_files" ? " (recto)" : ""}`
          : identityImportMode === "two_files"
            ? "Recto"
            : formData.notes,
      });

      if (uploadedVersoFile) {
        await createDocument({
          contact_id: effectiveContactId,
          foyer_id: foyerId,
          type_document: "IDENTITE",
          nom_fichier: uploadedVersoFile.name,
          chemin_fichier: uploadedVersoFile.path,
          taille_fichier: uploadedVersoFile.size,
          mime_type: getMimeType(uploadedVersoFile.name),
          date_document: documentExpiryDate,
          notes: formData.notes ? `${formData.notes} (verso)` : "Verso",
        });
      }

      setShowIdentityPreview(false);
      setIdentityExtracted(null);
      resetIdentityFiles();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erreur application identité:", error);
      alert("Erreur lors de la mise à jour: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadedFile) {
      alert("Veuillez sélectionner un fichier");
      return;
    }
    if (isIdentityMode && !effectiveContactId) {
      toast.error(IDENTITY_REQUIRED_MSG);
      return;
    }
    if (identityImportMode === "two_files" && isIdentityMode && !uploadedVersoFile) {
      alert("Sélectionnez le recto et le verso (2 fichiers).");
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

      if (uploadedVersoFile && identityImportMode === "two_files") {
        await createDocument({
          contact_id: formData.contact_id,
          foyer_id: formData.foyer_id,
          type_document: formData.type_document || "IDENTITE",
          nom_fichier: uploadedVersoFile.name,
          chemin_fichier: uploadedVersoFile.path,
          taille_fichier: uploadedVersoFile.size,
          mime_type: getMimeType(uploadedVersoFile.name),
          date_document: formData.date_document || undefined,
          notes: formData.notes ? `${formData.notes} (verso)` : "Verso",
        });
      }
      onSuccess();
      onOpenChange(false);
      
      // Réinitialiser
      setUploadedFile(null);
      setUploadedVersoFile(null);
      setExtractedText("");
      setExtractedData(null);
      setFormData({
        contact_id: contactId ?? defaultContactId,
        foyer_id: foyerId,
        type_document: "AUTRE",
        date_document: "",
        notes: "",
      });
      setIdentityImportMode("single");
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
      webp: "image/webp",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const previewContactNom = contactLocked ? contactNom : linkedContact?.nom;
  const previewContactPrenom = contactLocked ? contactPrenom : linkedContact?.prenom;
  const previewContactDateNaissance = contactLocked
    ? contactDateNaissance
    : linkedContact?.date_naissance;
  const previewContactLieuNaissance = contactLocked
    ? contactLieuNaissance
    : linkedContact?.lieu_naissance;

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

      <IdentityExtractPreviewDialog
        open={showIdentityPreview}
        onOpenChange={(nextOpen) => {
          setShowIdentityPreview(nextOpen);
          if (!nextOpen) void terminateOcrWorker();
        }}
        extracted={identityExtracted}
        onConfirm={handleApplyIdentity}
        loading={loading}
        contactNom={previewContactNom}
        contactPrenom={previewContactPrenom}
        contactDateNaissance={previewContactDateNaissance}
        contactLieuNaissance={previewContactLieuNaissance}
        rectoPreviewPath={uploadedFile?.path}
        versoPreviewPath={
          identityImportMode === "two_files" ? uploadedVersoFile?.path : undefined
        }
      />

      <Dialog open={open && !showIdentityPreview} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer un document</DialogTitle>
          <DialogDescription>
            {effectiveContactId ? (
              <>
                RIO, relevé patrimonial ou pièce d&apos;identité — détection automatique selon
                le fichier. La CNI complète uniquement les champs vides de la fiche.
              </>
            ) : (
              <>
                RIO et relevés patrimoniaux. Pour une pièce d&apos;identité, sélectionnez d&apos;abord
                un client.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!contactLocked && (
            <ContactPersonSearch
              label="Client"
              hint="Document lié à ce contact en base"
              placeholder="Rechercher un client…"
              contacts={importContacts}
              value={selectedContactId}
              onChange={(id) => setSelectedContactId(id)}
            />
          )}

          {/* Type de document */}
          <div className="space-y-2">
            <Label htmlFor="type_document">Type de document *</Label>
            <Select
              value={formData.type_document}
              onValueChange={(value) => {
                setFormData({ ...formData, type_document: value });
                if (value !== "IDENTITE") {
                  setIdentityImportMode("single");
                  setUploadedVersoFile(null);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IDENTITE">{getDocumentTypeLabel("IDENTITE")}</SelectItem>
                <SelectItem value="FISCAL">{getDocumentTypeLabel("FISCAL")}</SelectItem>
                <SelectItem value="PATRIMOINE">{getDocumentTypeLabel("PATRIMOINE")}</SelectItem>
                <SelectItem value="CONTRAT">{getDocumentTypeLabel("CONTRAT")}</SelectItem>
                <SelectItem value="RELEVE">{getDocumentTypeLabel("RELEVE")}</SelectItem>
                <SelectItem value="AUTRE">{getDocumentTypeLabel("AUTRE")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isIdentityMode && (
            <div className="space-y-2">
              <Label htmlFor="identity-import-mode">Format pièce d&apos;identité</Label>
              <Select
                value={identityImportMode}
                onValueChange={(value: IdentityImportMode) => {
                  setIdentityImportMode(value);
                  resetIdentityFiles();
                }}
              >
                <SelectTrigger id="identity-import-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">
                    Un fichier (1 page recto+verso, ou PDF 2 pages)
                  </SelectItem>
                  <SelectItem value="two_files">Deux fichiers (recto + verso)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Sélection du fichier */}
          <div className="space-y-2">
            <Label>{identityImportMode === "two_files" && isIdentityMode ? "Fichiers *" : "Fichier *"}</Label>

            {identityImportMode === "two_files" && isIdentityMode ? (
              <div className="space-y-3">
                {uploadedFile ? (
                  <div className="flex items-center gap-2 p-3 border border-border rounded-lg">
                    <File className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">Recto</div>
                      <div className="font-medium truncate">{uploadedFile.name}</div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setUploadedFile(null);
                        setExtractedText("");
                        setIdentityExtracted(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="w-full" onClick={handleFileSelect}>
                    <Upload className="h-4 w-4 mr-2" />
                    Sélectionner le recto
                  </Button>
                )}

                {uploadedVersoFile ? (
                  <div className="flex items-center gap-2 p-3 border border-border rounded-lg">
                    <File className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">Verso (MRZ)</div>
                      <div className="font-medium truncate">{uploadedVersoFile.name}</div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setUploadedVersoFile(null);
                        setExtractedText("");
                        setIdentityExtracted(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleVersoFileSelect}
                    disabled={!uploadedFile}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Sélectionner le verso
                  </Button>
                )}
              </div>
            ) : uploadedFile ? (
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
                      resetIdentityFiles();
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" className="w-full" onClick={handleFileSelect}>
                <Upload className="h-4 w-4 mr-2" />
                Sélectionner un fichier
              </Button>
            )}

            {extracting && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <FileText className="h-4 w-4 animate-pulse" />
                Lecture OCR en cours (30 s à 2 min selon la qualité du scan)…
              </div>
            )}

            {!extracting && canRunIdentityExtract && !showIdentityPreview && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void runIdentityExtractForCurrentFiles()}
              >
                <FileText className="h-4 w-4 mr-2" />
                {identityImportMode === "two_files"
                  ? "Analyser recto + verso"
                  : "Analyser la pièce d'identité"}
              </Button>
            )}

            {identityImportMode === "two_files" && isIdentityMode && uploadedFile && !uploadedVersoFile && (
              <p className="text-sm text-muted-foreground">
                Mode 2 fichiers : sélectionnez le verso pour lancer l&apos;analyse
                {autoExtract ? " automatiquement" : ""}.
              </p>
            )}

            {!extracting && extractedText && (
              <details className="p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <summary className="flex items-center gap-2 cursor-pointer">
                  <FileText className="h-4 w-4" />
                  Texte extrait ({extractedText.length} caractères) - cliquer pour voir
                </summary>
                <div className="mt-2 p-2 bg-white border rounded text-xs text-gray-700 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                  {extractedText}
                </div>
              </details>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-extract"
                checked={autoExtract}
                onChange={(e) => setAutoExtract(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="auto-extract" className="text-sm font-normal cursor-pointer">
                Extraire automatiquement les données (PDF patrimoine, pièce d&apos;identité)
              </Label>
            </div>
          </div>

          {/* Date du document (hors identité : validité saisie dans la preview OCR) */}
          {!isIdentityMode && (
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
          )}

          {isIdentityMode && (
            <p className="text-xs text-muted-foreground">
              Fin de validité : renseignée dans la preview après analyse de la pièce.
            </p>
          )}

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
