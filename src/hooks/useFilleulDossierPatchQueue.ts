import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Contact } from "@/lib/api/tauri-contacts";
import { updateContact } from "@/lib/api/tauri-contacts";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { upsertFilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import {
  buildUpsertFilleulDossierInput,
  resolveFilleulCategorieAfterDesinscriptionDateChange,
} from "@/lib/organisation/organisation-filleul-dossier";
import {
  describeOrganisationExerciceVisibilityHint,
  validateFilleulDossierDatePatch,
} from "@/lib/organisation/organisation-filleul-dossier-validation";

type DossierPatch = Parameters<typeof buildUpsertFilleulDossierInput>[1];

/**
 * File d'attente séquentielle pour patcher le dossier réseau d'un filleul (dates, notes) — gère
 * aussi le basculement automatique du statut (FILLEUL <-> FILLEUL_DESINSCRIT) quand la date de
 * désinscription change, et un toast d'explication si la modification change la présence du
 * filleul sur l'exercice affiché. Partagé entre le module Organisation (dossier complet) et la
 * fiche contact (dates réseau minimales) pour garder une seule logique de sauvegarde/validation.
 */
export function useFilleulDossierPatchQueue({
  contact,
  dossier,
  canEdit,
  onDossierChange,
  onCategorieChange,
}: {
  contact: Contact;
  dossier: FilleulDossier;
  canEdit: boolean;
  onDossierChange: (dossier: FilleulDossier) => void;
  onCategorieChange?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const dossierRef = useRef(dossier);
  const queueRef = useRef<DossierPatch[]>([]);
  const processingRef = useRef(false);

  useEffect(() => {
    dossierRef.current = dossier;
  }, [dossier]);

  const processSaveQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setSaving(true);
    try {
      while (queueRef.current.length > 0) {
        const patch = queueRef.current.shift()!;
        const dossierBeforePatch = dossierRef.current;
        try {
          if (patch.dateDesinscription !== undefined && contact.id != null) {
            const clearingDesinscription =
              patch.dateDesinscription.trim() === "" &&
              dossierBeforePatch.dateDesinscription != null;
            let nextFilleulCategorie = resolveFilleulCategorieAfterDesinscriptionDateChange(
              contact,
              patch.dateDesinscription
            );
            if (nextFilleulCategorie === undefined && clearingDesinscription) {
              nextFilleulCategorie = "FILLEUL";
            }
            if (nextFilleulCategorie !== undefined) {
              await updateContact(
                contact.id,
                contactToUpdatePayload(contact, { filleul_categorie: nextFilleulCategorie })
              );
              onCategorieChange?.();
            }
          }

          const saved = await upsertFilleulDossier(
            buildUpsertFilleulDossierInput(dossierRef.current, patch),
            { notifyContactsChanged: true }
          );
          dossierRef.current = saved;
          onDossierChange(saved);

          if (patch.dateDesinscription !== undefined || patch.dateInscription !== undefined) {
            const visibilityHint = describeOrganisationExerciceVisibilityHint(
              contact,
              dossierRef.current
            );
            if (visibilityHint) {
              toast.info(visibilityHint, { duration: 8000 });
            }
          }
        } catch (patchError) {
          queueRef.current.unshift(patch);
          throw patchError;
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Impossible d'enregistrer le dossier réseau");
      throw error;
    } finally {
      processingRef.current = false;
      setSaving(false);
      if (queueRef.current.length > 0) {
        void processSaveQueue();
      }
    }
  }, [contact, onDossierChange, onCategorieChange]);

  const saveDossierPatch = useCallback(
    (patch: DossierPatch) => {
      if (!canEdit) return;

      const datePatch = {
        dateInvitation: patch.dateInvitation,
        dateInscription: patch.dateInscription,
        dateDesinscription: patch.dateDesinscription,
      };
      const hasDatePatch = Object.values(datePatch).some((v) => v !== undefined);
      if (hasDatePatch) {
        const validation = validateFilleulDossierDatePatch(dossierRef.current, contact, datePatch);
        if (validation?.blocking) {
          toast.error(validation.blocking);
          return;
        }
        if (validation?.warning) {
          toast.warning(validation.warning);
        }
      }

      queueRef.current.push(patch);
      void processSaveQueue();
    },
    [canEdit, contact, processSaveQueue]
  );

  return { saving, saveDossierPatch };
}
