import {
  deleteContact,
  updateContact,
  getAllContacts,
  type Contact,
} from "@/lib/api/tauri-contacts";
import { getInvestissementsByContact } from "@/lib/api/tauri-investissements";
import { getAllDocuments, updateDocument } from "@/lib/api/tauri-documents";
import { invoke } from "@tauri-apps/api/core";
import {
  contactToUpdatePayload,
  isFilleulStatut,
} from "@/lib/contacts/contact-form-utils";
import {
  beginImportTransaction,
  commitImportTransaction,
  rollbackImportTransaction,
} from "@/lib/api/tauri-import-transaction";

function effectiveClientCategorie(cat: string): string {
  return isFilleulStatut(cat) ? "AUCUN" : cat;
}

function effectiveFilleulCategorie(c: Contact): string | null | undefined {
  if (c.filleul_categorie) return c.filleul_categorie;
  if (isFilleulStatut(c.categorie)) return c.categorie;
  return null;
}

const CLIENT_CATEGORIE_SCORE: Record<string, number> = {
  CLIENT: 4,
  PROSPECT_CLIENT: 3,
  SUSPECT_CLIENT: 2,
  AUCUN: 0,
  PRESCRIPTEUR: 0,
};

const FILLEUL_CATEGORIE_SCORE: Record<string, number> = {
  FILLEUL: 4,
  PROSPECT_FILLEUL: 3,
  SUSPECT_FILLEUL: 2,
  FILLEUL_DESINSCRIT: 1,
};

function scoreClient(cat?: string): number {
  return CLIENT_CATEGORIE_SCORE[cat || ""] ?? 0;
}

function scoreFilleul(cat?: string | null): number {
  return cat ? (FILLEUL_CATEGORIE_SCORE[cat] ?? 0) : 0;
}

/** Fusionne un groupe de doublons (garde le plus petit id). Retourne le nombre de fiches supprimées. */
export async function mergeDuplicateGroup(duplicates: Contact[]): Promise<number> {
  if (duplicates.length <= 1) return 0;

  await beginImportTransaction();
  try {
    const removed = await mergeDuplicateGroupInner(duplicates);
    await commitImportTransaction();
    return removed;
  } catch (error) {
    try {
      await rollbackImportTransaction();
    } catch (rollbackErr) {
      console.error("Rollback fusion doublons:", rollbackErr);
    }
    throw error;
  }
}

async function mergeDuplicateGroupInner(duplicates: Contact[]): Promise<number> {
  const sorted = [...duplicates].sort((a, b) => a.id! - b.id!);
  const mainContact = sorted[0];
  const otherContacts = sorted.slice(1);

  let mostRecentClient = mainContact.date_dernier_contact;
  let mostRecentFilleul = mainContact.date_dernier_contact_filleul;
  let bestClientCat = effectiveClientCategorie(mainContact.categorie);
  let bestClientScore = scoreClient(bestClientCat);
  let bestFilleulCat = effectiveFilleulCategorie(mainContact);
  let bestFilleulScore = scoreFilleul(bestFilleulCat);

  let email = mainContact.email;
  let telephone = mainContact.telephone;
  let civilite = mainContact.civilite;
  let situation = mainContact.situation_familiale;
  const notesParts: string[] = mainContact.notes ? [mainContact.notes] : [];

  for (const c of sorted) {
    if (
      c.date_dernier_contact &&
      (!mostRecentClient || c.date_dernier_contact > mostRecentClient)
    ) {
      mostRecentClient = c.date_dernier_contact;
    }
    if (
      c.date_dernier_contact_filleul &&
      (!mostRecentFilleul || c.date_dernier_contact_filleul > mostRecentFilleul)
    ) {
      mostRecentFilleul = c.date_dernier_contact_filleul;
    }
    const cs = scoreClient(effectiveClientCategorie(c.categorie));
    if (cs > bestClientScore) {
      bestClientCat = effectiveClientCategorie(c.categorie);
      bestClientScore = cs;
    }
    const fc = effectiveFilleulCategorie(c);
    const fs = scoreFilleul(fc);
    if (fs > bestFilleulScore) {
      bestFilleulCat = fc;
      bestFilleulScore = fs;
    }
    if (!email && c.email) email = c.email;
    if (!telephone && c.telephone) telephone = c.telephone;
    if (!civilite && c.civilite) civilite = c.civilite;
    if (!situation && c.situation_familiale) situation = c.situation_familiale;
    if (c.notes && !notesParts.includes(c.notes)) notesParts.push(c.notes);
  }

  await updateContact(
    mainContact.id,
    contactToUpdatePayload(mainContact, {
      date_dernier_contact: mostRecentClient
        ? new Date(mostRecentClient * 1000).toISOString()
        : undefined,
      date_dernier_contact_filleul: mostRecentFilleul
        ? new Date(mostRecentFilleul * 1000).toISOString()
        : undefined,
      categorie: bestClientCat,
      filleul_categorie: bestFilleulCat || undefined,
      email: email || undefined,
      telephone: telephone || undefined,
      civilite: civilite || undefined,
      situation_familiale: situation || undefined,
      notes: notesParts.length > 0 ? notesParts.join("\n---\n") : undefined,
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
