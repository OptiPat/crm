import {
  deleteContact,
  updateContact,
  getAllContacts,
  type Contact,
} from "@/lib/api/tauri-contacts";
import { getInvestissementsByContact } from "@/lib/api/tauri-investissements";
import { getAllDocuments, updateDocument } from "@/lib/api/tauri-documents";
import { invoke } from "@tauri-apps/api/core";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import {
  computeMergedContactFields,
  pickMainContactId,
} from "@/lib/contacts/merge-duplicate-logic";
import {
  beginImportTransaction,
  commitImportTransaction,
  rollbackImportTransaction,
} from "@/lib/api/tauri-import-transaction";
import { notifyContactsChanged, suppressContactsChangedNotify } from "@/lib/contacts/contact-events";

/** Fusionne un groupe de doublons (garde le plus petit id). Retourne le nombre de fiches supprimées. */
export async function mergeDuplicateGroup(duplicates: Contact[]): Promise<number> {
  if (duplicates.length <= 1) return 0;

  const releaseSuppress = suppressContactsChangedNotify();
  let committed = false;
  try {
    await beginImportTransaction();
    const removed = await mergeDuplicateGroupInner(duplicates);
    await commitImportTransaction();
    committed = true;
    return removed;
  } catch (error) {
    try {
      await rollbackImportTransaction();
    } catch (rollbackErr) {
      console.error("Rollback fusion doublons:", rollbackErr);
    }
    throw error;
  } finally {
    releaseSuppress();
    if (committed) notifyContactsChanged();
  }
}

async function mergeDuplicateGroupInner(duplicates: Contact[]): Promise<number> {
  const sorted = [...duplicates].sort((a, b) => a.id! - b.id!);
  const mainId = pickMainContactId(duplicates);
  const mainContact = sorted.find((c) => c.id === mainId)!;
  const otherContacts = sorted.filter((c) => c.id !== mainId);
  const merged = computeMergedContactFields(duplicates);

  await updateContact(
    mainContact.id,
    contactToUpdatePayload(mainContact, {
      date_dernier_contact: merged.date_dernier_contact
        ? new Date(merged.date_dernier_contact * 1000).toISOString()
        : undefined,
      date_dernier_contact_filleul: merged.date_dernier_contact_filleul
        ? new Date(merged.date_dernier_contact_filleul * 1000).toISOString()
        : undefined,
      categorie: merged.categorie,
      filleul_categorie: merged.filleul_categorie,
      email: merged.email,
      telephone: merged.telephone,
      civilite: merged.civilite,
      situation_familiale: merged.situation_familiale,
      notes: merged.notes,
    })
  );

  let removed = 0;
  for (const duplicate of otherContacts) {
    let contacts = await getAllContacts();
    const filleulsLie = contacts.filter((c) => c.parrain_id === duplicate.id);
    for (const f of filleulsLie) {
      await updateContact(
        f.id,
        contactToUpdatePayload(f, { parrain_id: mainContact.id })
      );
    }

    try {
      const investissements = await getInvestissementsByContact(duplicate.id!);
      for (const inv of investissements) {
        await invoke("update_investissement", {
          id: inv.id,
          investissement: { ...inv, contact_id: mainContact.id },
        });
      }
    } catch (error) {
      console.error(`Erreur transfert investissements ${duplicate.id}:`, error);
    }

    try {
      const allDocs = await getAllDocuments();
      for (const doc of allDocs.filter((d) => d.contact_id === duplicate.id)) {
        await updateDocument(doc.id, {
          contact_id: mainContact.id,
          foyer_id: doc.foyer_id,
          type_document: doc.type_document,
          nom_fichier: doc.nom_fichier,
          chemin_fichier: doc.chemin_fichier,
          taille_fichier: doc.taille_fichier,
          mime_type: doc.mime_type,
          date_document: doc.date_document,
          notes: doc.notes,
        });
      }
    } catch (error) {
      console.error(`Erreur transfert documents ${duplicate.id}:`, error);
    }

    await deleteContact(duplicate.id!);
    removed++;
  }

  return removed;
}
