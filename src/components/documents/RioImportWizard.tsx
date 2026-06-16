import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { File, FileText, Loader2, Upload, X } from "lucide-react";
import { uploadDocument, type NewDocument } from "@/lib/api/tauri-documents";
import { extractTextFromPDFPath, parseAuto, isNativeTextPDF, type ExtractedData } from "@/lib/pdf";
import { getContactById, getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import type { NewInvestissement } from "@/lib/api/tauri-investissements";
import { toast } from "sonner";
import { useRioCoupleImport } from "@/hooks/useRioCoupleImport";
import { useRioSoloImport } from "@/hooks/useRioSoloImport";
import { useRioPatrimoineFlow } from "@/hooks/useRioPatrimoineFlow";
import { hasPatrimoineToTri } from "@/lib/documents/rio-patrimoine-flow";
import { applyQpiImport } from "@/lib/contacts/apply-qpi-import";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import { buildRioPreviewSummary } from "@/lib/documents/rio-import-preview";
import type { RioImportStep } from "@/lib/documents/rio-import-preview";
import { RioWizardContextBar } from "./RioWizardContextBar";
import { RioPdfPreviewPanel } from "./RioPdfPreviewPanel";
import { ExtractedDataPreviewAdvanced } from "./ExtractedDataPreviewAdvanced";
import { RioPatrimoineReviewStep } from "./RioPatrimoineReviewStep";

type PickedFile = { path: string; name: string; size: number };

type PatrimoineWizardState = {
  contactId: number;
  foyerId: number | null;
  coupleMemberIds: number[];
  ownerLabel: string;
  hasExistingInvestments: boolean;
  data: ExtractedData;
};

export interface RioImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  contactId?: number;
  defaultContactId?: number;
  defaultTypeDocument?: string;
  foyerId?: number;
  contactNom?: string;
  contactPrenom?: string;
  /** Reprise depuis DocumentUpload (type basculé ou fichier déjà analysé). */
  initialUploadedFile?: PickedFile;
  initialExtractedData?: ExtractedData;
  initialStep?: RioImportStep;
  initialFormDate?: string;
  initialFormNotes?: string;
}

export function RioImportWizard({
  open,
  onOpenChange,
  onSuccess,
  contactId,
  defaultContactId,
  defaultTypeDocument,
  foyerId,
  contactNom,
  contactPrenom,
  initialUploadedFile,
  initialExtractedData,
  initialStep,
  initialFormDate,
  initialFormNotes,
}: RioImportWizardProps) {
  const [step, setStep] = useState<RioImportStep>(1);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [autoExtract, setAutoExtract] = useState(true);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [uploadedFile, setUploadedFile] = useState<PickedFile | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<number | undefined>(
    contactId ?? defaultContactId
  );
  const [importContacts, setImportContacts] = useState<Contact[]>([]);
  const [linkedContact, setLinkedContact] = useState<Contact | null>(null);
  const [patrimoineState, setPatrimoineState] = useState<PatrimoineWizardState | null>(null);
  const bootstrapAppliedRef = useRef(false);

  const contactLocked = contactId != null;
  const effectiveContactId = contactId ?? selectedContactId;
  const initialTypeDocument = defaultTypeDocument ?? "PATRIMOINE";

  const [formData, setFormData] = useState<Partial<NewDocument>>({
    contact_id: contactId ?? defaultContactId,
    foyer_id: foyerId,
    type_document: initialTypeDocument,
    date_document: "",
    notes: "",
  });

  const patrimoineFlow = useRioPatrimoineFlow({
    contactId,
    defaultContactId,
    foyerId,
    defaultTypeDocument: initialTypeDocument,
    onSuccess,
    onOpenChange,
  });

  const { applyCoupleRioData } = useRioCoupleImport({
    effectiveContactId,
    foyerId,
    formFoyerId: formData.foyer_id,
    importContacts,
  });

  const { applySoloRioData } = useRioSoloImport({
    effectiveContactId,
    foyerId: foyerId ?? formData.foyer_id,
  });

  const resetWizard = useCallback(() => {
    setStep(1);
    setExtractedData(null);
    setUploadedFile(null);
    setPatrimoineState(null);
    setFormData(patrimoineFlow.resetFormData());
  }, [patrimoineFlow]);

  useEffect(() => {
    if (!open) {
      bootstrapAppliedRef.current = false;
      resetWizard();
      return;
    }
    setSelectedContactId(contactId ?? defaultContactId);
    setFormData((prev) => ({
      ...prev,
      contact_id: contactId ?? defaultContactId,
      foyer_id: foyerId,
      type_document: defaultTypeDocument ?? "PATRIMOINE",
      date_document: initialFormDate ?? prev.date_document,
      notes: initialFormNotes ?? prev.notes,
    }));

    if (bootstrapAppliedRef.current) return;
    if (!initialUploadedFile && !initialExtractedData) return;

    bootstrapAppliedRef.current = true;
    if (initialUploadedFile) {
      setUploadedFile(initialUploadedFile);
      setFormData((prev) => ({
        ...prev,
        nom_fichier: initialUploadedFile.name,
      }));
    }
    if (initialExtractedData) {
      setExtractedData(initialExtractedData);
      setStep(initialStep ?? 2);
    }
  }, [
    open,
    contactId,
    defaultContactId,
    foyerId,
    defaultTypeDocument,
    initialUploadedFile,
    initialExtractedData,
    initialStep,
    initialFormDate,
    initialFormNotes,
    resetWizard,
  ]);

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
      .catch(() => setLinkedContact(null));
  }, [effectiveContactId, contactLocked]);

  useEffect(() => {
    setFormData((prev) => ({ ...prev, contact_id: effectiveContactId }));
  }, [effectiveContactId]);

  const clientLabel = useMemo(() => {
    if (contactLocked && contactPrenom && contactNom) {
      return `${contactPrenom} ${contactNom}`;
    }
    if (linkedContact) {
      return `${linkedContact.prenom} ${linkedContact.nom}`;
    }
    if (patrimoineState?.ownerLabel) return patrimoineState.ownerLabel;
    if (extractedData?.prenom || extractedData?.nom) {
      return [extractedData.prenom, extractedData.nom].filter(Boolean).join(" ");
    }
    return "Client non sélectionné";
  }, [contactLocked, contactPrenom, contactNom, linkedContact, patrimoineState, extractedData]);

  const previewSummary = extractedData ? buildRioPreviewSummary(extractedData) : null;
  const showPatrimoineStep = previewSummary?.hasPatrimoineStep ?? true;

  const handleExtractText = async (filePath: string) => {
    setExtracting(true);
    try {
      const result = await extractTextFromPDFPath(filePath);
      if (!isNativeTextPDF(result.text)) {
        toast.warning(
          "Peu de texte extrait : PDF probablement scanné. Vérifiez les données avant d'appliquer."
        );
      }
      const parsedData = parseAuto(result.text);
      setExtractedData(parsedData);
      setStep(2);
    } catch (error) {
      console.error("Erreur extraction RIO:", error);
      toast.error("Erreur lors de l'extraction : " + String(error));
    } finally {
      setExtracting(false);
    }
  };

  const handleFileSelect = async () => {
    try {
      const file = await uploadDocument();
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Sélectionnez un fichier PDF Stellium (RIO ou QPI).");
        return;
      }
      setUploadedFile(file);
      setFormData((prev) => ({ ...prev, nom_fichier: file.name }));
      if (autoExtract) {
        await handleExtractText(file.path);
      }
    } catch (error) {
      toast.error("Erreur sélection fichier : " + String(error));
    }
  };

  const finishRioImport = async (
    data: ExtractedData,
    result: NonNullable<Awaited<ReturnType<typeof applySoloRioData>>>,
    coupleMemberIds?: [number, number]
  ) => {
    await patrimoineFlow.finishImportFlow({
      data,
      result,
      uploadedFile,
      formData,
      coupleMemberIds,
      onClosePreview: () => {},
      onClearExtractedData: () => {},
      onResetUpload: () => {},
      onWizardPatrimoineStep: (state) => {
        setPatrimoineState(state);
        setExtractedData(state.data);
        setStep(3);
      },
    });
  };

  const handleApplyData = async (data: ExtractedData) => {
    if (!effectiveContactId) {
      toast.error("Sélectionnez un client avant d'appliquer.");
      return;
    }

    setLoading(true);
    try {
      if (data.typeDocument === "QPI") {
        const qpiResult = await applyQpiImport(data, {
          effectiveContactId,
          uploadedFile: uploadedFile ?? undefined,
          formNotes: formData.notes,
        });
        if (qpiResult) {
          toast.success(qpiResult.successMessage);
          resetWizard();
          onSuccess();
          onOpenChange(false);
        } else {
          toast.error(
            "Impossible d'enregistrer le profil : SRI manquant (1–7) ou identité insuffisante."
          );
        }
        return;
      }

      const deferFinancial = hasPatrimoineToTri(data);
      const importOpts = { deferFinancialFields: deferFinancial };

      if (data.isCouple && data.conjoint) {
        const result = await applyCoupleRioData(data, importOpts);
        if (result) {
          await finishRioImport(data, result, result.memberContactIds);
        }
        return;
      }

      const result = await applySoloRioData(data, importOpts);
      if (result) {
        if (!hasPatrimoineToTri(data)) {
          await patrimoineFlow.finishImportFlow({
            data,
            result,
            uploadedFile,
            formData,
            onClosePreview: () => {},
            onClearExtractedData: () => {},
            onResetUpload: resetWizard,
          });
          resetWizard();
        } else {
          await finishRioImport(data, result);
        }
      }
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement : " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const handlePatrimoineComplete = async (investissements?: NewInvestissement[]) => {
    if (patrimoineState?.hasExistingInvestments) {
      await patrimoineFlow.handleRioUpdateComplete({
        onResetUpload: resetWizard,
        onResetForm: () => setFormData(patrimoineFlow.resetFormData()),
      });
      resetWizard();
      return;
    }

    if (investissements) {
      await patrimoineFlow.handlePatrimoineTriComplete(investissements, {
        setLoading,
        onClearExtractedData: () => setExtractedData(null),
        onResetUpload: resetWizard,
        onResetForm: () => setFormData(patrimoineFlow.resetFormData()),
      });
      resetWizard();
    }
  };

  const handlePatrimoineCancel = async () => {
    if (patrimoineState?.hasExistingInvestments) {
      await patrimoineFlow.handleRioUpdateCancel();
    } else {
      await patrimoineFlow.handlePatrimoineTriCancel();
    }
    resetWizard();
  };

  const handleWizardClose = (nextOpen: boolean) => {
    if (!nextOpen && step === 3) {
      void handlePatrimoineCancel();
    }
    if (!nextOpen) resetWizard();
    onOpenChange(nextOpen);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  return (
    <Dialog open={open} onOpenChange={handleWizardClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col overflow-hidden p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle>Import Stellium — RIO / QPI</DialogTitle>
          <DialogDescription className="sr-only">
            Assistant d&apos;import de documents patrimoniaux Stellium
          </DialogDescription>
        </DialogHeader>

        <RioWizardContextBar
          step={step}
          clientLabel={clientLabel}
          fileName={uploadedFile?.name}
          detectedType={extractedData?.typeDocument}
          showPatrimoineStep={showPatrimoineStep}
        />

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col mt-2">
          {step === 1 && (
            <div className="space-y-4 overflow-y-auto pr-1">
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

              <div className="space-y-2">
                <Label htmlFor="wizard-type">Type de document</Label>
                <Select
                  value={formData.type_document}
                  onValueChange={(value) => {
                    setFormData({ ...formData, type_document: value });
                    setExtractedData(null);
                    setStep(1);
                  }}
                >
                  <SelectTrigger id="wizard-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PATRIMOINE">{getDocumentTypeLabel("PATRIMOINE")}</SelectItem>
                    <SelectItem value="QPI">{getDocumentTypeLabel("QPI")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Fichier PDF Stellium *</Label>
                {uploadedFile ? (
                  <div className="flex items-center gap-2 p-3 border rounded-lg">
                    <File className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{uploadedFile.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(uploadedFile.size)}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setUploadedFile(null);
                        setExtractedData(null);
                        setStep(1);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="w-full gap-2" onClick={handleFileSelect}>
                    <Upload className="h-4 w-4" />
                    Choisir un PDF
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="wizard-auto-extract"
                  checked={autoExtract}
                  onChange={(e) => setAutoExtract(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="wizard-auto-extract" className="text-sm font-normal cursor-pointer">
                  Extraire automatiquement à la sélection
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard-date">Date du document</Label>
                <Input
                  id="wizard-date"
                  type="date"
                  value={formData.date_document || ""}
                  onChange={(e) => setFormData({ ...formData, date_document: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard-notes">Notes</Label>
                <Textarea
                  id="wizard-notes"
                  value={formData.notes || ""}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Annuler
                </Button>
                {uploadedFile && !extractedData && (
                  <Button
                    type="button"
                    onClick={() => handleExtractText(uploadedFile.path)}
                    disabled={extracting}
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Extraction…
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Analyser le PDF
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {step === 2 && extractedData && uploadedFile && (
            <div className="grid lg:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
              <RioPdfPreviewPanel pdfPath={uploadedFile.path} active={open && step === 2} />
              <ExtractedDataPreviewAdvanced
                variant="panel"
                hideStepper
                open
                onOpenChange={() => setStep(1)}
                extractedData={extractedData}
                onApply={handleApplyData}
                onIgnore={() => setStep(1)}
              />
            </div>
          )}

          {step === 3 && patrimoineState && (
            <RioPatrimoineReviewStep
              extractedData={patrimoineState.data}
              contactId={patrimoineState.contactId}
              contactNom={patrimoineState.ownerLabel}
              foyerId={patrimoineState.foyerId ?? undefined}
              coupleMemberIds={
                patrimoineState.coupleMemberIds.length
                  ? patrimoineState.coupleMemberIds
                  : undefined
              }
              hasExistingInvestments={patrimoineState.hasExistingInvestments}
              onComplete={handlePatrimoineComplete}
              onCancel={() => setStep(2)}
            />
          )}
        </div>

        {loading && step === 2 && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-50 rounded-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
