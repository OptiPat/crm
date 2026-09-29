import type { NewDocument } from "@/lib/api/tauri-documents";
import type { NewInvestissement } from "@/lib/api/tauri-investissements";
import type { ExtractedData } from "@/lib/pdf";
import { getMimeType } from "@/lib/documents/file-mime";
import { extractPatrimoineItemsFromRio } from "./extract-patrimoine-items";
import {
  buildPatrimoineMontantInitial,
} from "./rio-investissement-extras";
import {
  attachRioPatrimoineOwner,
  buildRioPatrimoineOwner,
  type RioPatrimoineOwner,
} from "./rio-patrimoine-target";
import {
  ownerHintToKey,
  resolveCouplePatrimoineOwner,
} from "./rio-couple-patrimoine-owner";

const EPARGNE_BANCAIRE_IMPORT_TYPES = [
  "EPARGNE_BANCAIRE",
  "LIVRET_A",
  "LDDS",
  "PEL",
  "CEL",
  "CSL",
];

export function hasPatrimoineToTri(data: ExtractedData): boolean {
  const items = extractPatrimoineItemsFromRio(data);
  return items.some((item) => {
    if (EPARGNE_BANCAIRE_IMPORT_TYPES.includes(item.type)) {
      return false;
    }
    return item.montant > 0;
  });
}

function autoEpargneItems(data: ExtractedData) {
  return extractPatrimoineItemsFromRio(data).filter(
    (item) => EPARGNE_BANCAIRE_IMPORT_TYPES.includes(item.type) && item.montant > 0
  );
}

/**
 * Ouvre l'étape patrimoine s'il reste un actif à classer, ou si l'épargne
 * bancaire doit être rapprochée d'investissements déjà en base.
 */
export function shouldOpenRioPatrimoineStep(
  data: ExtractedData,
  hasExistingInvestments: boolean
): boolean {
  if (hasPatrimoineToTri(data)) return true;
  return hasExistingInvestments && autoEpargneItems(data).length > 0;
}

/** Épargne bancaire « à côté » à créer quand l'étape patrimoine est sautée. */
export function buildSkippedEpargneInvestissements(
  data: ExtractedData,
  owner: {
    contactId: number;
    foyerId?: number;
    coupleMemberIds?: [number, number];
  }
): NewInvestissement[] {
  if (hasPatrimoineToTri(data)) return [];

  return autoEpargneItems(data).map((item) => {
    let target: RioPatrimoineOwner;
    if (data.isCouple && owner.foyerId && owner.coupleMemberIds) {
      const key = ownerHintToKey(item.rioOwnerHint, owner.coupleMemberIds);
      target = resolveCouplePatrimoineOwner(key, owner.coupleMemberIds, owner.foyerId);
    } else {
      target = buildRioPatrimoineOwner({
        contactId: owner.contactId,
        foyerId: owner.foyerId,
        useFoyer: Boolean(owner.foyerId) && !data.isCouple,
      });
    }
    return attachRioPatrimoineOwner(
      {
        type_produit: item.type,
        nom_produit: item.label,
        montant_initial: buildPatrimoineMontantInitial(item.type, item.montant),
        origine: "EXISTANT_CLIENT",
      },
      target
    );
  });
}

export function convertRioDateToISO(dateStr: string): string {
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return dateStr;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export function buildRioPatrimoineDocument(options: {
  data: ExtractedData;
  finalContactId: number;
  resolvedFoyerId?: number;
  uploadedFile: { path: string; name: string; size: number };
  formTypeDocument?: string;
  formDateDocument?: string;
  formNotes?: string;
}): NewDocument {
  const { data, finalContactId, resolvedFoyerId, uploadedFile, formTypeDocument, formDateDocument, formNotes } =
    options;

  return {
    contact_id: finalContactId,
    foyer_id: resolvedFoyerId,
    type_document: data.typeDocument === "RIO" ? "PATRIMOINE" : formTypeDocument || "AUTRE",
    nom_fichier: uploadedFile.name,
    chemin_fichier: uploadedFile.path,
    taille_fichier: uploadedFile.size,
    mime_type: getMimeType(uploadedFile.name),
    date_document: data.dateSignature
      ? convertRioDateToISO(data.dateSignature)
      : data.dateDocument
        ? convertRioDateToISO(data.dateDocument)
        : formDateDocument || undefined,
    notes: formNotes,
  };
}
