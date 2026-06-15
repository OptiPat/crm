import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { createDocument, type NewDocument } from "@/lib/api/tauri-documents";
import {
  createInvestissement,
  type NewInvestissement,
} from "@/lib/api/tauri-investissements";
import { getContactById, updateContact } from "@/lib/api/tauri-contacts";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import type { RioCoupleApplyResult } from "@/lib/contacts/rio-couple-apply";
import type { RioSoloApplyResult } from "@/lib/contacts/rio-solo-apply";
import {
  buildRioPatrimoineDocument,
  hasPatrimoineToTri,
} from "@/lib/documents/rio-patrimoine-flow";
import {
  isFoyerPatrimoineRio,
  patrimoineOwnerLabel,
} from "@/lib/documents/rio-patrimoine-target";
import type { ExtractedData } from "@/lib/pdf";

type UploadedFile = { path: string; name: string; size: number };

function resolveFoyerIdFromResult(
  result: RioSoloApplyResult | RioCoupleApplyResult
): number | undefined {
  return "foyerId" in result ? result.foyerId : result.resolvedFoyerId;
}

export function useRioPatrimoineFlow(options: {
  contactId?: number;
  defaultContactId?: number;
  foyerId?: number;
  defaultTypeDocument?: string;
  onSuccess: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [showPatrimoineTri, setShowPatrimoineTri] = useState(false);
  const [triContactId, setTriContactId] = useState<number | null>(null);
  const [triFoyerId, setTriFoyerId] = useState<number | null>(null);
  const [triCoupleMemberIds, setTriCoupleMemberIds] = useState<number[]>([]);
  const [triOwnerLabel, setTriOwnerLabel] = useState("");
  const [triExtractedData, setTriExtractedData] = useState<ExtractedData | null>(null);
  const [showRioUpdate, setShowRioUpdate] = useState(false);
  const [updateContactNom, setUpdateContactNom] = useState("");

  const resetFormData = useCallback(
    (): Partial<NewDocument> => ({
      contact_id: options.contactId ?? options.defaultContactId,
      foyer_id: options.foyerId,
      type_document: options.defaultTypeDocument ?? "AUTRE",
      date_document: "",
      notes: "",
    }),
    [
      options.contactId,
      options.defaultContactId,
      options.foyerId,
      options.defaultTypeDocument,
    ]
  );

  const resetTriState = useCallback(() => {
    setTriContactId(null);
    setTriFoyerId(null);
    setTriCoupleMemberIds([]);
    setTriOwnerLabel("");
    setTriExtractedData(null);
    setUpdateContactNom("");
  }, []);

  const finishImportFlow = useCallback(
    async (params: {
      data: ExtractedData;
      result: RioSoloApplyResult | RioCoupleApplyResult;
      uploadedFile: UploadedFile | null;
      formData: Partial<NewDocument>;
      coupleMemberIds?: [number, number];
      onClosePreview: () => void;
      onClearExtractedData: () => void;
      onResetUpload: () => void;
    }) => {
      const { data, result, uploadedFile, formData, coupleMemberIds, onClosePreview, onClearExtractedData, onResetUpload } =
        params;

      if (uploadedFile && result.finalContactId) {
        await createDocument(
          buildRioPatrimoineDocument({
            data,
            finalContactId: result.finalContactId,
            resolvedFoyerId: resolveFoyerIdFromResult(result),
            uploadedFile,
            formTypeDocument: formData.type_document,
            formDateDocument: formData.date_document,
            formNotes: formData.notes,
          })
        );
      }

      if (hasPatrimoineToTri(data) && result.finalContactId) {
        onClosePreview();
        setTriContactId(result.finalContactId);
        setTriExtractedData(data);
        setTriFoyerId(
          coupleMemberIds?.length ? (resolveFoyerIdFromResult(result) ?? null) : null
        );
        setTriCoupleMemberIds(coupleMemberIds ?? []);
        setTriOwnerLabel(result.displayNom);

        if (result.hasExistingInvestments) {
          setUpdateContactNom(result.displayNom);
          setShowRioUpdate(true);
        } else {
          setShowPatrimoineTri(true);
        }
        return;
      }

      alert(result.successMessage + "\n\n📄 Document enregistré avec succès!");
      onClosePreview();
      onClearExtractedData();
      options.onSuccess();
      options.onOpenChange(false);
      onResetUpload();
    },
    [options]
  );

  const handlePatrimoineTriComplete = useCallback(
    async (
      investissements: NewInvestissement[],
      callbacks: {
        setLoading: (loading: boolean) => void;
        onClearExtractedData: () => void;
        onResetUpload: () => void;
        onResetForm: () => void;
      }
    ) => {
      callbacks.setLoading(true);
      try {
        for (const inv of investissements) {
          await createInvestissement(inv);
        }

        const avecMoi = investissements.filter((i) => i.origine === "MON_CONSEIL").length;
        const aCote = investissements.filter((i) => i.origine === "EXISTANT_CLIENT").length;

        const contactIdsToUpdate =
          triCoupleMemberIds.length > 0
            ? triCoupleMemberIds
            : triContactId
              ? [triContactId]
              : [];
        const newCategorie = avecMoi > 0 ? "CLIENT" : "PROSPECT_CLIENT";

        for (const contactIdToUpdate of contactIdsToUpdate) {
          try {
            const existingContact = await getContactById(contactIdToUpdate);
            if (existingContact.categorie !== newCategorie) {
              await updateContact(
                contactIdToUpdate,
                contactToUpdatePayload(existingContact, { categorie: newCategorie })
              );
            }
          } catch {
            // Ignorer si mise à jour impossible
          }
        }

        alert(`✅ Import terminé!\n\n🎯 Avec moi: ${avecMoi} investissement(s)\n📋 À côté: ${aCote} investissement(s)`);

        setShowPatrimoineTri(false);
        resetTriState();
        callbacks.onClearExtractedData();
        callbacks.onResetUpload();
        callbacks.onResetForm();
        options.onSuccess();
        options.onOpenChange(false);
      } catch (error) {
        console.error("❌ Erreur lors de la création des investissements:", error);
        alert("❌ Erreur lors de la création des investissements:\n\n" + String(error));
      } finally {
        callbacks.setLoading(false);
      }
    },
    [triContactId, triCoupleMemberIds, resetTriState, options]
  );

  const handlePatrimoineTriCancel = useCallback(() => {
    setShowPatrimoineTri(false);
    setTriExtractedData(null);
    if (triContactId || triCoupleMemberIds.length > 0) {
      toast.info("Patrimoine non importé. Les contacts créés restent dans la base.");
    }
    resetTriState();
    options.onSuccess();
    options.onOpenChange(false);
  }, [triContactId, triCoupleMemberIds, resetTriState, options]);

  const handleRioUpdateComplete = useCallback(
    (callbacks: { onResetUpload: () => void; onResetForm: () => void }) => {
      setShowRioUpdate(false);
      resetTriState();
      callbacks.onResetUpload();
      callbacks.onResetForm();
      options.onSuccess();
      options.onOpenChange(false);
    },
    [resetTriState, options]
  );

  const handleRioUpdateCancel = useCallback(() => {
    setShowRioUpdate(false);
    setTriExtractedData(null);
    if (triContactId || triCoupleMemberIds.length > 0) {
      toast.info("Mise à jour RIO annulée. Les contacts restent enregistrés.");
    }
    resetTriState();
    options.onSuccess();
    options.onOpenChange(false);
  }, [triContactId, triCoupleMemberIds, resetTriState, options]);

  const triUseFoyerPatrimoine = useMemo(
    () =>
      isFoyerPatrimoineRio({
        isCouple: triExtractedData?.isCouple,
        foyerId: triFoyerId ?? undefined,
      }),
    [triExtractedData?.isCouple, triFoyerId]
  );

  const triPatrimoineLabel = useMemo(
    () =>
      triOwnerLabel ||
      patrimoineOwnerLabel({
        useFoyer: triUseFoyerPatrimoine,
        contactNom: updateContactNom || undefined,
      }),
    [triOwnerLabel, triUseFoyerPatrimoine, updateContactNom]
  );

  return {
    showPatrimoineTri,
    setShowPatrimoineTri,
    triContactId,
    triFoyerId,
    triCoupleMemberIds,
    triExtractedData,
    showRioUpdate,
    setShowRioUpdate,
    updateContactNom,
    triPatrimoineLabel,
    finishImportFlow,
    handlePatrimoineTriComplete,
    handlePatrimoineTriCancel,
    handleRioUpdateComplete,
    handleRioUpdateCancel,
    resetFormData,
  };
}
