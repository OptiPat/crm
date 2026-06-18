import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { IdentityPreviewValues } from "@/components/documents/IdentityExtractPreviewDialog";
import { getContactById } from "@/lib/api/tauri-contacts";
import {
  applyIdentityDocumentImport,
  type IdentityImportMode,
  type IdentityPickedFile,
} from "@/lib/documents/identity-document-apply";
import {
  extractIdentityFromFilePath,
  extractIdentityFromRectoVersoFiles,
  isIdentityFilePath,
  isLikelyIdentityFileName,
  parseIdentityFromText,
  resolveIdentityToastMessage,
  type IdentityExtractResult,
} from "@/lib/identity";

const IDENTITY_REQUIRED_MSG =
  "Sélectionnez un client pour importer une pièce d'identité.";

function formatIdentityExtractError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "échec de l'OCR (vérifiez la console pour le détail)";
}

export function isImageFile(name: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(name);
}

export function useIdentityDocumentImport(options: {
  effectiveContactId?: number;
  foyerId?: number;
  formNotes?: string;
  formDateDocument?: string;
  onSuccess: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    effectiveContactId,
    foyerId,
    formNotes,
    formDateDocument,
    onSuccess,
    onOpenChange,
  } = options;

  const [showIdentityPreview, setShowIdentityPreview] = useState(false);
  const [identityExtracted, setIdentityExtracted] = useState<IdentityExtractResult | null>(null);
  const [identityImportMode, setIdentityImportMode] = useState<IdentityImportMode>("single");
  const [uploadedVersoFile, setUploadedVersoFile] = useState<IdentityPickedFile | null>(null);
  const [extracting, setExtracting] = useState(false);

  const requireContactForIdentity = useCallback((): boolean => {
    if (effectiveContactId) return true;
    toast.error(IDENTITY_REQUIRED_MSG);
    return false;
  }, [effectiveContactId]);

  const resetIdentityFiles = useCallback(
    (callbacks: { clearUploadedFile: () => void; clearExtractedText: () => void }) => {
      callbacks.clearUploadedFile();
      setUploadedVersoFile(null);
      callbacks.clearExtractedText();
      setIdentityExtracted(null);
    },
    []
  );

  const openIdentityPreviewFromText = useCallback(
    (
      text: string,
      callbacks: {
        setExtractedText: (text: string) => void;
        clearExtractedData: () => void;
        closeRioPreview: () => void;
      }
    ) => {
      const parsed = parseIdentityFromText(text);
      setIdentityExtracted(parsed);
      callbacks.setExtractedText(text);
      callbacks.clearExtractedData();
      callbacks.closeRioPreview();
      setShowIdentityPreview(true);
      if (parsed.confidence < 50) {
        const toastMsg = resolveIdentityToastMessage(parsed);
        if (toastMsg) toast.warning(toastMsg);
      }
    },
    []
  );

  const runDualIdentityExtract = useCallback(
    async (
      recto: IdentityPickedFile,
      verso: IdentityPickedFile,
      callbacks: { setExtractedText: (text: string) => void; clearExtractedData: () => void }
    ) => {
      if (!requireContactForIdentity()) return;

      setExtracting(true);
      setIdentityExtracted(null);
      callbacks.clearExtractedData();
      callbacks.setExtractedText("");

      try {
        const result = await extractIdentityFromRectoVersoFiles(recto.path, verso.path);
        setIdentityExtracted(result);
        callbacks.setExtractedText(result.rawText);
        setShowIdentityPreview(true);
        toast.info("Extraction terminée — vérifiez les champs avant d'appliquer.");
        const toastMsg = resolveIdentityToastMessage(result);
        if (toastMsg) toast.warning(toastMsg);
      } catch (error) {
        console.error("Erreur extraction identité (2 fichiers):", error);
        toast.error("Erreur lors de la lecture recto/verso : " + formatIdentityExtractError(error));
      } finally {
        setExtracting(false);
      }
    },
    [requireContactForIdentity]
  );

  const extractIdentity = useCallback(
    async (
      filePath: string,
      callbacks: { setExtractedText: (text: string) => void; clearExtractedData: () => void }
    ) => {
      if (!requireContactForIdentity()) return;

      setExtracting(true);
      setIdentityExtracted(null);
      callbacks.clearExtractedData();
      callbacks.setExtractedText("");

      try {
        const result = await extractIdentityFromFilePath(filePath);
        setIdentityExtracted(result);
        callbacks.setExtractedText(result.rawText);
        setShowIdentityPreview(true);
        toast.info("Extraction terminée — vérifiez les champs avant d'appliquer.");
        const toastMsg = resolveIdentityToastMessage(result);
        if (toastMsg) toast.warning(toastMsg);
      } catch (error) {
        console.error("Erreur extraction identité:", error);
        toast.error(
          "Erreur lors de la lecture de la pièce d'identité : " + formatIdentityExtractError(error)
        );
      } finally {
        setExtracting(false);
      }
    },
    [requireContactForIdentity]
  );

  const runIdentityExtractForCurrentFiles = useCallback(
    async (
      uploadedFile: IdentityPickedFile | null,
      callbacks: { setExtractedText: (text: string) => void; clearExtractedData: () => void }
    ) => {
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
        await runDualIdentityExtract(uploadedFile, uploadedVersoFile, callbacks);
        return;
      }
      await extractIdentity(uploadedFile.path, callbacks);
    },
    [
      requireContactForIdentity,
      identityImportMode,
      uploadedVersoFile,
      runDualIdentityExtract,
      extractIdentity,
    ]
  );

  const shouldUseIdentityPipeline = useCallback(
    (fileName: string, typeDoc?: string) =>
      isImageFile(fileName) || typeDoc === "IDENTITE" || isLikelyIdentityFileName(fileName),
    []
  );

  const canRunIdentityExtract = useCallback(
    (uploadedFile: IdentityPickedFile | null, isIdentityMode: boolean) =>
      Boolean(effectiveContactId) &&
      isIdentityMode &&
      Boolean(uploadedFile) &&
      Boolean(uploadedFile && isIdentityFilePath(uploadedFile.path)) &&
      (identityImportMode === "single" || Boolean(uploadedVersoFile)),
    [effectiveContactId, identityImportMode, uploadedVersoFile]
  );

  const handleApplyIdentity = useCallback(
    async (
      values: IdentityPreviewValues,
      uploadedFile: IdentityPickedFile | null,
      setLoading: (loading: boolean) => void
    ) => {
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
        const { filledFields, skippedFields } = await applyIdentityDocumentImport({
          contact,
          contactId: effectiveContactId,
          foyerId,
          values,
          identityExtracted,
          uploadedFile,
          uploadedVersoFile,
          identityImportMode,
          formNotes,
          formDateDocument,
        });

        if (filledFields.length === 0) {
          toast.info("Aucun champ vide à compléter sur cette fiche.");
        } else {
          toast.success(`Fiche complétée : ${filledFields.join(", ")}`);
        }
        if (skippedFields.length > 0) {
          toast.message(`Conservé (déjà renseigné) : ${skippedFields.join(", ")}`);
        }

        setShowIdentityPreview(false);
        setIdentityExtracted(null);
        onSuccess();
        onOpenChange(false);
        return true;
      } catch (error) {
        console.error("Erreur application identité:", error);
        alert("Erreur lors de la mise à jour: " + String(error));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [
      effectiveContactId,
      foyerId,
      formNotes,
      formDateDocument,
      onSuccess,
      onOpenChange,
      identityImportMode,
      uploadedVersoFile,
      identityExtracted,
    ]
  );

  return {
    showIdentityPreview,
    setShowIdentityPreview,
    identityExtracted,
    identityImportMode,
    setIdentityImportMode,
    uploadedVersoFile,
    setUploadedVersoFile,
    extracting,
    setExtracting,
    requireContactForIdentity,
    resetIdentityFiles,
    openIdentityPreviewFromText,
    runDualIdentityExtract,
    extractIdentity,
    runIdentityExtractForCurrentFiles,
    shouldUseIdentityPipeline,
    canRunIdentityExtract,
    handleApplyIdentity,
    identityRequiredMsg: IDENTITY_REQUIRED_MSG,
  };
}
