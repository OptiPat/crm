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
import { resolveExistingContactForRio } from "@/lib/contacts/rio-solo-apply";
import { PROFIL_RISQUE_SRI_FIELD_LABEL } from "@/lib/contacts/investisseur-sri";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import { buildRioPreviewSummary } from "@/lib/documents/rio-import-preview";
import type { RioImportStep } from "@/lib/documents/rio-import-preview";
import { assessRioImport, type RioImportAssessment } from "@/lib/documents/rio-import-guard";
import { RioWizardContextBar } from "./RioWizardContextBar";
import { RioImportGuardBanner } from "./RioImportGuardBanner";
import { RioIdentityMergeDialog } from "./RioIdentityMergeDialog";
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
  /** Chemin du PDF après enregistrement document (staging déplacé). */
  documentFilePath?: string;
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
  /** Relance depuis la bibliothèque : ne pas recréer l'entrée document. */
  existingDocumentId?: number;
  initialStep?: RioImportStep;
  initialFormDate?: string;
  initialFormNotes?: string;
  /** Sans Dialog externe (intégré dans DocumentUpload). */
  embedded?: boolean;
  /** Retour vers les autres types de document (mode embedded). */
  onRequestGenericImport?: () => void;
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
  existingDocumentId,
  initialStep,
  initialFormDate,
  initialFormNotes,
  embedded = false,
  onRequestGenericImport,
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
  const [importAssessment, setImportAssessment] = useState<RioImportAssessment | null>(null);
  const [mergePrompt, setMergePrompt] = useState<string | null>(null);
  const mergeResolverRef = useRef<((value: boolean) => void) | null>(null);
  const bootstrapAppliedRef = useRef(false);

  const confirmIdentityMerge = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      // Retirer le spinner pendant la confirmation (sinon overlay opaque +
      // ancien Dialog imbriqué = chargement infini sans bouton cliquable).
      setLoading(false);
      mergeResolverRef.current = (accepted: boolean) => {
        setLoading(true);
        resolve(accepted);
      };
      setMergePrompt(message);
    });
  }, []);

  const resolveIdentityMerge = useCallback((accepted: boolean) => {
    const resolver = mergeResolverRef.current;
    mergeResolverRef.current = null;
    setMergePrompt(null);
    resolver?.(accepted);
  }, []);

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

  const {
    resetFormData: resetPatrimoineFormData,
    finishImportFlow,
    handlePatrimoineTriComplete,
    handlePatrimoineTriCancel,
    handleRioUpdateComplete,
    handleRioUpdateCancel,
  } = useRioPatrimoineFlow({
    contactId,
    defaultContactId,
    foyerId,
    defaultTypeDocument: initialTypeDocument,
    existingDocumentId,
    onSuccess,
    onOpenChange,
  });

  const { applyCoupleRioData } = useRioCoupleImport({
    effectiveContactId,
    foyerId,
    formFoyerId: formData.foyer_id,
    importContacts,
    confirmIdentityMerge,
  });

  const { applySoloRioData } = useRioSoloImport({
    effectiveContactId,
    foyerId: foyerId ?? formData.foyer_id,
    confirmIdentityMerge,
  });

  const resetWizard = useCallback(() => {
    setStep(1);
    setExtractedData(null);
    setUploadedFile(null);
    setPatrimoineState(null);
    setImportAssessment(null);
    setFormData(resetPatrimoineFormData());
  }, [resetPatrimoineFormData]);

  useEffect(() => {
    if (!open) {
      bootstrapAppliedRef.current = false;
      resetWizard();
      return;
    }

    if (bootstrapAppliedRef.current) return;
    bootstrapAppliedRef.current = true;

    setSelectedContactId(contactId ?? defaultContactId);
    setFormData({
      contact_id: contactId ?? defaultContactId,
      foyer_id: foyerId,
      type_document: defaultTypeDocument ?? "PATRIMOINE",
      date_document: initialFormDate ?? "",
      notes: initialFormNotes ?? "",
      nom_fichier: initialUploadedFile?.name,
    });

    if (initialUploadedFile) {
      setUploadedFile(initialUploadedFile);
    }
    if (initialExtractedData) {
      const assessment = assessRioImport(initialExtractedData, {
        requestedType: defaultTypeDocument ?? "PATRIMOINE",
      });
      setExtractedData(initialExtractedData);
      setImportAssessment(assessment);
      setStep(assessment.canProceed ? (initialStep ?? 2) : 1);
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
      const detected = [extractedData.prenom, extractedData.nom].filter(Boolean).join(" ");
      if (effectiveContactId) return detected;
      return `${detected} (PDF — choisir le client en base si besoin)`;
    }
    return "Client non sélectionné";
  }, [contactLocked, contactPrenom, contactNom, linkedContact, patrimoineState, extractedData, effectiveContactId]);

  const previewSummary = extractedData ? buildRioPreviewSummary(extractedData) : null;
  const showPatrimoineStep = previewSummary?.hasPatrimoineStep ?? true;

  const syncContactLinkFromExtractedData = useCallback(
    async (data: ExtractedData) => {
      if (contactLocked || contactId != null || selectedContactId != null) return;
      const found = await resolveExistingContactForRio(data, undefined);
      if (found?.id) {
        setSelectedContactId(found.id);
        toast.info(`Client détecté en base : ${found.prenom} ${found.nom}`);
      }
    },
    [contactLocked, contactId, selectedContactId]
  );

  const initialExtractTriggeredRef = useRef(false);

  const handleExtractText = useCallback(async (filePath: string) => {
    setExtracting(true);
    try {
      const result = await extractTextFromPDFPath(filePath);
      if (!isNativeTextPDF(result.text)) {
        toast.warning(
          "Peu de texte extrait : PDF probablement scanné. Vérifiez les données avant d'appliquer."
        );
      }
      const parsedData = parseAuto(result.text);
      const assessment = assessRioImport(parsedData, {
        requestedType: formData.type_document,
      });
      setImportAssessment(assessment);

      if (parsedData.typeDocument === "QPI") {
        setFormData((prev) => ({ ...prev, type_document: "QPI" }));
      } else if (parsedData.typeDocument === "RIO") {
        setFormData((prev) => ({ ...prev, type_document: "PATRIMOINE" }));
      }

      if (!assessment.canProceed) {
        setExtractedData(parsedData);
        toast.error(assessment.issues[0] ?? "Import impossible — vérifiez le PDF.");
        return;
      }

      setExtractedData(parsedData);
      setStep(2);
      void syncContactLinkFromExtractedData(parsedData);
    } catch (error) {
      console.error("Erreur extraction RIO:", error);
      toast.error("Erreur lors de l'extraction : " + String(error));
    } finally {
      setExtracting(false);
    }
  }, [formData.type_document, syncContactLinkFromExtractedData]);

  useEffect(() => {
    if (!open || !extractedData || contactLocked || contactId != null) return;
    void syncContactLinkFromExtractedData(extractedData);
  }, [open, extractedData, contactLocked, contactId, syncContactLinkFromExtractedData]);

  useEffect(() => {
    if (!open) {
      initialExtractTriggeredRef.current = false;
      return;
    }
    if (
      initialExtractTriggeredRef.current ||
      !initialUploadedFile ||
      initialExtractedData ||
      !uploadedFile ||
      extractedData
    ) {
      return;
    }
    initialExtractTriggeredRef.current = true;
    void handleExtractText(uploadedFile.path);
  }, [
    open,
    initialUploadedFile,
    initialExtractedData,
    uploadedFile,
    extractedData,
    handleExtractText,
  ]);

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
    await finishImportFlow({
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
        if (state.documentFilePath) {
          setUploadedFile((prev) =>
            prev ? { ...prev, path: state.documentFilePath! } : prev
          );
        }
        setStep(3);
      },
    });
  };

  const handleApplyData = async (data: ExtractedData) => {
    const assessment = assessRioImport(data, { requestedType: formData.type_document });
    setImportAssessment(assessment);
    if (!assessment.canProceed) {
      toast.error(
        assessment.issues[0] ?? "Import impossible — corrigez les données ou le PDF."
      );
      return;
    }

    setLoading(true);
    try {
      if (data.typeDocument === "QPI") {
        const qpiResult = await applyQpiImport(data, {
          effectiveContactId,
          uploadedFile: uploadedFile ?? undefined,
          formNotes: formData.notes,
          skipDocumentCreation: existingDocumentId != null,
        });
        if (qpiResult) {
          toast.success(qpiResult.successMessage);
          resetWizard();
          onSuccess();
          onOpenChange(false);
        } else {
          toast.error(
            `Impossible d'enregistrer le profil : ${PROFIL_RISQUE_SRI_FIELD_LABEL.toLowerCase()} manquant ou identité insuffisante.`
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
          await finishImportFlow({
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
      await handleRioUpdateComplete({
        onResetUpload: resetWizard,
        onResetForm: () => setFormData(resetPatrimoineFormData()),
      });
      resetWizard();
      return;
    }

    if (investissements) {
      await handlePatrimoineTriComplete(investissements, {
        setLoading,
        onClearExtractedData: () => setExtractedData(null),
        onResetUpload: resetWizard,
        onResetForm: () => setFormData(resetPatrimoineFormData()),
      });
      resetWizard();
    }
  };

  const handlePatrimoineCancel = async () => {
    if (patrimoineState?.hasExistingInvestments) {
      await handleRioUpdateCancel();
    } else {
      await handlePatrimoineTriCancel();
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

  const wizardBody = (
    <>
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

      {importAssessment && step === 1 && (
        <RioImportGuardBanner assessment={importAssessment} className="mt-3 shrink-0" />
      )}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden mt-2">
          {step === 1 && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
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
                    setImportAssessment(null);
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

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                {embedded && onRequestGenericImport ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-muted-foreground"
                    onClick={onRequestGenericImport}
                  >
                    ← Autre type de document
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2 ml-auto">
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
            </div>
          )}

          {step === 2 && extractedData && uploadedFile && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              {!contactLocked && (
                <ContactPersonSearch
                  label="Client en base"
                  hint={
                    effectiveContactId
                      ? "Client associé — modifiable avant d'appliquer"
                      : "Recherche par nom ou sélection manuelle si la détection auto a échoué"
                  }
                  placeholder="Rechercher un client…"
                  contacts={importContacts}
                  value={selectedContactId}
                  onChange={(id) => setSelectedContactId(id)}
                />
              )}
            <div className="grid lg:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
              <RioPdfPreviewPanel pdfPath={uploadedFile.path} active={open && step === 2} />
              <div className="min-w-0 flex flex-col min-h-0 overflow-hidden">
              <ExtractedDataPreviewAdvanced
                variant="panel"
                hideStepper
                open
                onOpenChange={() => setStep(1)}
                extractedData={extractedData}
                onApply={(data) => {
                  setExtractedData(data);
                  void handleApplyData(data);
                }}
                onIgnore={() => setStep(1)}
              />
              </div>
            </div>
            </div>
          )}

          {step === 3 && patrimoineState && uploadedFile && (
            <div className="grid lg:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
              <RioPdfPreviewPanel
                pdfPath={patrimoineState.documentFilePath ?? uploadedFile.path}
                active={open && step === 3}
              />
              <div className="min-w-0 flex flex-col min-h-0 overflow-hidden">
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
              </div>
            </div>
          )}

        {loading && step === 2 && mergePrompt == null && (
          <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-background/60">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        </div>
    </>
  );

  return (
    <>
      <RioIdentityMergeDialog
        open={mergePrompt != null}
        message={mergePrompt}
        onConfirm={() => resolveIdentityMerge(true)}
        onCancel={() => resolveIdentityMerge(false)}
      />
      {embedded ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{wizardBody}</div>
      ) : (
        <Dialog open={open} onOpenChange={handleWizardClose}>
          <DialogContent className="flex h-[90vh] max-h-[90vh] max-w-6xl flex-col overflow-hidden p-6">
            {wizardBody}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
