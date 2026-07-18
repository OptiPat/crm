import { useEffect, useMemo, useRef, useState } from "react";
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
import { uploadDocument, createDocument, discardStagedDocument, type NewDocument } from "@/lib/api/tauri-documents";
import { extractTextFromPDFPath, parseAuto, isNativeTextPDF, type ExtractedData } from "@/lib/pdf";
import { ExtractedDataPreviewAdvanced } from "./ExtractedDataPreviewAdvanced";
import { IdentityExtractPreviewDialog } from "./IdentityExtractPreviewDialog";
import { RioImportWizard } from "./RioImportWizard";
import { terminateOcrWorker, isLikelyIdentityFileName, looksLikeIdentityDocument, isIdentityFilePath } from "@/lib/identity";
import { getContactById, getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { toast } from "sonner";
import { isImageFile, useIdentityDocumentImport } from "@/hooks/useIdentityDocumentImport";
import { getMimeType } from "@/lib/documents/file-mime";
import type { IdentityImportMode } from "@/lib/documents/identity-document-apply";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import { cn } from "@/lib/utils";
import {
  nestedStackedDialogClass,
  nestedStackedOutsideHandlers,
  nestedStackedPortalLayer,
} from "@/lib/ui/nested-stacked-dialog";
import {
  stopWheelPropagation,
  useLockAppMainScroll,
} from "@/lib/ui/nested-sheet-scroll";
import { PortalLayerProvider } from "@/lib/ui/portal-layer-context";
import { assessRioImport } from "@/lib/documents/rio-import-guard";

interface DocumentUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  contactId?: number;
  /** Pré-sélection client (page Documents filtrée) — modifiable. */
  defaultContactId?: number;
  /** Type de document présélectionné (ex. PATRIMOINE depuis l’onglet Patrimoine). */
  defaultTypeDocument?: string;
  /** Fichier déjà copié (drag & drop page Documents). */
  initialUploadedFile?: PickedFile;
  foyerId?: number;
  /** Affichage dialogue identité (fiche contact). */
  contactNom?: string;
  contactPrenom?: string;
  contactDateNaissance?: number;
  contactLieuNaissance?: string;
  /** Volet empilé (drill-down dashboard). */
  nestedSheet?: boolean;
}

const IDENTITY_REQUIRED_MSG =
  "Sélectionnez un client pour importer une pièce d'identité.";

type PickedFile = { path: string; name: string; size: number };

export function DocumentUpload({
  open,
  onOpenChange,
  onSuccess,
  contactId,
  defaultContactId,
  defaultTypeDocument,
  initialUploadedFile,
  foyerId,
  contactNom,
  contactPrenom,
  contactDateNaissance,
  contactLieuNaissance,
  nestedSheet = false,
}: DocumentUploadProps) {
  useLockAppMainScroll(open && nestedSheet);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [autoExtract, setAutoExtract] = useState(true);
  const [extractedText, setExtractedText] = useState<string>("");
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<PickedFile | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<number | undefined>(
    contactId ?? defaultContactId
  );
  const [importContacts, setImportContacts] = useState<Contact[]>([]);
  const [linkedContact, setLinkedContact] = useState<Contact | null>(null);
  const contactLocked = contactId != null;
  const effectiveContactId = contactId ?? selectedContactId;
  const initialTypeDocument = defaultTypeDocument ?? "AUTRE";
  const [formData, setFormData] = useState<Partial<NewDocument>>({
    contact_id: contactId ?? defaultContactId,
    foyer_id: foyerId,
    type_document: initialTypeDocument,
    date_document: "",
    notes: "",
  });

  const resetFormData = (): Partial<NewDocument> => ({
    contact_id: contactId ?? defaultContactId,
    foyer_id: foyerId,
    type_document: defaultTypeDocument ?? "AUTRE",
    date_document: "",
    notes: "",
  });

  const importSucceededRef = useRef(false);

  const discardStagedPaths = async (...paths: (string | undefined)[]) => {
    for (const path of paths) {
      if (path) await discardStagedDocument(path);
    }
  };

  const identityImport = useIdentityDocumentImport({
    effectiveContactId,
    foyerId,
    formNotes: formData.notes,
    formDateDocument: formData.date_document,
    onSuccess,
    onOpenChange,
  });

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !importSucceededRef.current) {
      void discardStagedPaths(uploadedFile?.path, identityImport.uploadedVersoFile?.path);
    }
    if (!nextOpen) {
      importSucceededRef.current = false;
    }
    onOpenChange(nextOpen);
  };

  const identityTextCallbacks = {
    setExtractedText,
    clearExtractedData: () => setExtractedData(null),
  };

  useEffect(() => {
    if (open) return;
    setUploadedFile(null);
    setExtractedData(null);
    setShowPreview(false);
    setExtractedText("");
    setFormData(resetFormData());
    identityImport.setIdentityImportMode("single");
    identityImport.setUploadedVersoFile(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- reset à la fermeture uniquement

  useEffect(() => {
    if (!open) return;
    setSelectedContactId(contactId ?? defaultContactId);
    setFormData((prev) => ({
      ...prev,
      contact_id: contactId ?? defaultContactId,
      foyer_id: foyerId,
      type_document: defaultTypeDocument ?? prev.type_document ?? "AUTRE",
    }));
  }, [open, contactId, defaultContactId, foyerId, defaultTypeDocument]);

  const initialFileProcessedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      initialFileProcessedRef.current = false;
      return;
    }
    if (!initialUploadedFile || initialFileProcessedRef.current) return;
    initialFileProcessedRef.current = true;

    const file = initialUploadedFile;
    const nextType =
      isImageFile(file.name) && (defaultTypeDocument ?? "AUTRE") === "AUTRE"
        ? "IDENTITE"
        : defaultTypeDocument ?? "AUTRE";

    setUploadedFile(file);
    setFormData((prev) => ({
      ...prev,
      nom_fichier: file.name,
      type_document: nextType,
    }));

    void (async () => {
      if (identityImport.shouldUseIdentityPipeline(file.name, nextType)) {
        if (!isIdentityFilePath(file.path)) return;
        await identityImport.extractIdentity(file.path, identityTextCallbacks);
      } else if (file.name.toLowerCase().endsWith(".pdf")) {
        await handleExtractText(file.path);
      }
    })();
  }, [open, initialUploadedFile, defaultTypeDocument]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const isStelliumWizardMode =
    formData.type_document === "PATRIMOINE" || formData.type_document === "QPI";

  const handleVersoFileSelect = async () => {
    try {
      const file = await uploadDocument();
      if (!file) return;

      identityImport.setUploadedVersoFile(file);
      setFormData((prev) => ({
        ...prev,
        type_document: prev.type_document === "AUTRE" ? "IDENTITE" : prev.type_document,
      }));

      if (!autoExtract || !uploadedFile) return;
      if (!isIdentityFilePath(uploadedFile.path) || !isIdentityFilePath(file.path)) return;
      await identityImport.runDualIdentityExtract(uploadedFile, file, identityTextCallbacks);
    } catch (error) {
      console.error("Error selecting verso file:", error);
      alert("Erreur lors de la sélection du verso: " + String(error));
    }
  };

  const handleFileSelect = async () => {
    try {
      const file = await uploadDocument();
      if (!file) return;

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

        if (identityImport.identityImportMode === "two_files") {
          if (
            autoExtract &&
            identityImport.uploadedVersoFile &&
            isIdentityFilePath(file.path) &&
            isIdentityFilePath(identityImport.uploadedVersoFile.path)
          ) {
            await identityImport.runDualIdentityExtract(
              file,
              identityImport.uploadedVersoFile,
              identityTextCallbacks
            );
          }
          return;
        }

        if (!autoExtract) return;

        if (identityImport.shouldUseIdentityPipeline(file.name, nextType)) {
          if (!isIdentityFilePath(file.path)) return;
          await identityImport.extractIdentity(file.path, identityTextCallbacks);
        } else if (file.name.toLowerCase().endsWith(".pdf")) {
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

      const isIdentityCandidate =
        isIdentityMode ||
        looksLikeIdentityDocument(result.text) ||
        isLikelyIdentityFileName(filePath);

      if (isIdentityCandidate) {
        if (!identityImport.requireContactForIdentity()) return;
        if (!isNativeTextPDF(result.text)) {
          await identityImport.extractIdentity(filePath, identityTextCallbacks);
          return;
        }
        identityImport.openIdentityPreviewFromText(result.text, {
          setExtractedText,
          clearExtractedData: () => setExtractedData(null),
          closeRioPreview: () => setShowPreview(false),
        });
        return;
      }

      if (!isNativeTextPDF(result.text)) {
        toast.warning(
          "Peu de texte extrait : PDF probablement scanné. Vérifiez les données avant d'appliquer."
        );
      }

      const parsedData = parseAuto(result.text);
      const stelliumAssessment = assessRioImport(parsedData, {
        requestedType: formData.type_document,
      });
      const isStelliumDoc =
        parsedData.typeDocument === "QPI" || parsedData.typeDocument === "RIO";
      const inStelliumFlow =
        formData.type_document === "PATRIMOINE" || formData.type_document === "QPI";

      if (inStelliumFlow || isStelliumDoc) {
        if (parsedData.typeDocument === "QPI") {
          setFormData((prev) => ({ ...prev, type_document: "QPI" }));
        } else if (parsedData.typeDocument === "RIO") {
          setFormData((prev) => ({ ...prev, type_document: "PATRIMOINE" }));
        }
        setExtractedData(parsedData);
        if (!stelliumAssessment.canProceed) {
          toast.error(
            stelliumAssessment.issues[0] ?? "Import impossible — vérifiez le PDF."
          );
        }
        return;
      }

      setExtractedData(parsedData);
      setShowPreview(true);
    } catch (error) {
      console.error("❌ Erreur lors de l'extraction:", error);
      alert("Erreur lors de l'extraction du texte: " + String(error));
    } finally {
      setExtracting(false);
    }
  };

  const handleIgnoreData = () => {
    setExtractedData(null);
    setShowPreview(false);
  };

  const handleApplyIdentity = async (
    values: Parameters<typeof identityImport.handleApplyIdentity>[0]
  ) => {
    const applied = await identityImport.handleApplyIdentity(values, uploadedFile, setLoading);
    if (applied) {
      identityImport.resetIdentityFiles({
        clearUploadedFile: () => setUploadedFile(null),
        clearExtractedText: () => setExtractedText(""),
      });
      identityImport.setIdentityImportMode("single");
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
    if (identityImport.identityImportMode === "two_files" && isIdentityMode && !identityImport.uploadedVersoFile) {
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

      if (identityImport.uploadedVersoFile && identityImport.identityImportMode === "two_files") {
        await createDocument({
          contact_id: formData.contact_id,
          foyer_id: formData.foyer_id,
          type_document: formData.type_document || "IDENTITE",
          nom_fichier: identityImport.uploadedVersoFile.name,
          chemin_fichier: identityImport.uploadedVersoFile.path,
          taille_fichier: identityImport.uploadedVersoFile.size,
          mime_type: getMimeType(identityImport.uploadedVersoFile.name),
          date_document: formData.date_document || undefined,
          notes: formData.notes ? `${formData.notes} (verso)` : "Verso",
        });
      }
      importSucceededRef.current = true;
      onSuccess();
      handleDialogOpenChange(false);

      setUploadedFile(null);
      identityImport.setUploadedVersoFile(null);
      setExtractedText("");
      setExtractedData(null);
      setFormData(resetFormData());
      identityImport.setIdentityImportMode("single");
    } catch (error) {
      console.error("Error saving document:", error);
      await discardStagedPaths(uploadedFile?.path, identityImport.uploadedVersoFile?.path);
      alert("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
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

  const isExtracting = extracting || identityImport.extracting;
  const canRunIdentityExtract = identityImport.canRunIdentityExtract(uploadedFile, isIdentityMode);

  const stelliumImportAssessment = useMemo(() => {
    if (!extractedData || !isStelliumWizardMode) return null;
    return assessRioImport(extractedData, { requestedType: formData.type_document });
  }, [extractedData, formData.type_document, isStelliumWizardMode]);

  const stelliumBootstrap =
    uploadedFile || extractedData
      ? {
          initialUploadedFile: uploadedFile ?? undefined,
          initialExtractedData: extractedData ?? undefined,
          initialStep: (stelliumImportAssessment?.canProceed ? 2 : 1) as 1 | 2 | 3,
        }
      : {};

  return (
    <>
      {extractedData && !isStelliumWizardMode && (
        <ExtractedDataPreviewAdvanced
          open={showPreview}
          onOpenChange={setShowPreview}
          extractedData={extractedData}
          onApply={(data) => {
            setExtractedData(data);
            setShowPreview(false);
          }}
          onIgnore={handleIgnoreData}
        />
      )}

      <IdentityExtractPreviewDialog
        open={identityImport.showIdentityPreview}
        onOpenChange={(nextOpen) => {
          identityImport.setShowIdentityPreview(nextOpen);
          if (!nextOpen) void terminateOcrWorker();
        }}
        extracted={identityImport.identityExtracted}
        onConfirm={handleApplyIdentity}
        loading={loading}
        contactNom={previewContactNom}
        contactPrenom={previewContactPrenom}
        contactDateNaissance={previewContactDateNaissance}
        contactLieuNaissance={previewContactLieuNaissance}
        rectoPreviewPath={uploadedFile?.path}
        nestedSheet={nestedSheet}
        versoPreviewPath={
          identityImport.identityImportMode === "two_files"
            ? identityImport.uploadedVersoFile?.path
            : undefined
        }
      />

      <Dialog open={open && !identityImport.showIdentityPreview} onOpenChange={handleDialogOpenChange} modal={!nestedSheet}>
        <DialogContent
          hideOverlay={nestedSheet}
          className={nestedStackedDialogClass(
            cn(
              "max-h-[90vh] transition-[max-width] duration-200 ease-out",
              isStelliumWizardMode
                ? "flex h-[90vh] max-w-6xl flex-col overflow-hidden p-6"
                : "flex max-w-2xl flex-col overflow-hidden"
            ),
            nestedSheet
          )}
          onWheel={nestedSheet ? stopWheelPropagation : undefined}
          {...nestedStackedOutsideHandlers(nestedSheet)}
        >
        <PortalLayerProvider layer={nestedStackedPortalLayer(nestedSheet)}>
        {isStelliumWizardMode ? (
          <RioImportWizard
            embedded
            open={open}
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
            contactId={contactId}
            defaultContactId={effectiveContactId}
            defaultTypeDocument={formData.type_document}
            foyerId={foyerId}
            contactNom={contactLocked ? contactNom : linkedContact?.nom}
            contactPrenom={contactLocked ? contactPrenom : linkedContact?.prenom}
            initialFormDate={formData.date_document}
            initialFormNotes={formData.notes}
            onRequestGenericImport={() =>
              setFormData((prev) => ({ ...prev, type_document: "AUTRE" }))
            }
            {...stelliumBootstrap}
          />
        ) : (
          <>
        <DialogHeader>
          <DialogTitle>Importer un document</DialogTitle>
          <DialogDescription>
            {isIdentityMode ? (
              effectiveContactId ? (
                <>
                  Pièce d&apos;identité ou passeport — l&apos;OCR complète uniquement les champs
                  vides de la fiche.
                </>
              ) : (
                <>Sélectionnez d&apos;abord un client pour importer une pièce d&apos;identité.</>
              )
            ) : effectiveContactId ? (
              <>
                Document lié à ce client. Pour un RIO, choisissez le type{" "}
                <strong>RIO / relevé patrimonial</strong>.
              </>
            ) : (
              <>Choisissez le type de document et le client concerné.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
          onWheel={nestedSheet ? stopWheelPropagation : undefined}
        >
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
                const switchingToStellium = value === "PATRIMOINE" || value === "QPI";
                setFormData({ ...formData, type_document: value });
                if (!switchingToStellium) {
                  setExtractedData(null);
                  setShowPreview(false);
                  setExtractedText("");
                }
                if (value !== "IDENTITE") {
                  identityImport.setIdentityImportMode("single");
                  identityImport.setUploadedVersoFile(null);
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
                <SelectItem value="QPI">{getDocumentTypeLabel("QPI")}</SelectItem>
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
                value={identityImport.identityImportMode}
                onValueChange={(value: IdentityImportMode) => {
                  identityImport.setIdentityImportMode(value);
                  identityImport.resetIdentityFiles({
                    clearUploadedFile: () => setUploadedFile(null),
                    clearExtractedText: () => setExtractedText(""),
                  });
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
            <Label>{identityImport.identityImportMode === "two_files" && isIdentityMode ? "Fichiers *" : "Fichier *"}</Label>

            {identityImport.identityImportMode === "two_files" && isIdentityMode ? (
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
                        identityImport.setShowIdentityPreview(false);
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

                {identityImport.uploadedVersoFile ? (
                  <div className="flex items-center gap-2 p-3 border border-border rounded-lg">
                    <File className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">Verso (MRZ)</div>
                      <div className="font-medium truncate">{identityImport.uploadedVersoFile.name}</div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        identityImport.setUploadedVersoFile(null);
                        setExtractedText("");
                        identityImport.setShowIdentityPreview(false);
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
                      identityImport.resetIdentityFiles({
                        clearUploadedFile: () => setUploadedFile(null),
                        clearExtractedText: () => setExtractedText(""),
                      });
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

            {isExtracting && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <FileText className="h-4 w-4 animate-pulse" />
                Lecture OCR en cours (30 s à 2 min selon la qualité du scan)…
              </div>
            )}

            {!isExtracting && canRunIdentityExtract && !identityImport.showIdentityPreview && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() =>
                  void identityImport.runIdentityExtractForCurrentFiles(
                    uploadedFile,
                    identityTextCallbacks
                  )
                }
              >
                <FileText className="h-4 w-4 mr-2" />
                {identityImport.identityImportMode === "two_files"
                  ? "Analyser recto + verso"
                  : "Analyser la pièce d'identité"}
              </Button>
            )}

            {identityImport.identityImportMode === "two_files" &&
              isIdentityMode &&
              uploadedFile &&
              !identityImport.uploadedVersoFile && (
              <p className="text-sm text-muted-foreground">
                Mode 2 fichiers : sélectionnez le verso pour lancer l&apos;analyse
                {autoExtract ? " automatiquement" : ""}.
              </p>
            )}

            {!isExtracting && extractedText && (
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
                {isIdentityMode
                  ? "Extraire automatiquement la pièce d'identité"
                  : "Extraire automatiquement les données (PDF patrimoine, pièce d'identité)"}
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
        </div>
          </>
        )}
        </PortalLayerProvider>
      </DialogContent>
    </Dialog>
    </>
  );
}
