import type { ExtractedData, RioCoupleOwnerHint } from "@/lib/pdf/types";
import type { RioPatrimoineOwner } from "./rio-patrimoine-target";

export interface CouplePatrimoineMemberOption {
  key: string;
  contactId?: number;
  label: string;
}

function formatMemberLabel(
  prenom: string | undefined,
  nom: string | undefined,
  fallback: string
): string {
  const label = [prenom, nom].filter(Boolean).join(" ").trim();
  return label || fallback;
}

export function buildCouplePatrimoineMemberOptions(
  extractedData: ExtractedData,
  memberContactIds: [number, number]
): CouplePatrimoineMemberOption[] {
  const [id1, id2] = memberContactIds;
  return [
    {
      key: String(id1),
      contactId: id1,
      label: formatMemberLabel(extractedData.prenom, extractedData.nom, "Investisseur 1"),
    },
    {
      key: String(id2),
      contactId: id2,
      label: formatMemberLabel(
        extractedData.conjoint?.prenom,
        extractedData.conjoint?.nom,
        "Investisseur 2"
      ),
    },
    {
      key: "foyer",
      label: "Commun (foyer)",
    },
  ];
}

export function ownerHintToKey(
  hint: RioCoupleOwnerHint | undefined,
  memberContactIds: [number, number]
): string {
  if (hint === "person1") return String(memberContactIds[0]);
  if (hint === "person2") return String(memberContactIds[1]);
  return "foyer";
}

export function isCouplePatrimoineOwnerKey(
  ownerKey: string,
  memberContactIds: [number, number]
): boolean {
  if (ownerKey === "foyer") return true;
  const contactId = Number.parseInt(ownerKey, 10);
  return Number.isFinite(contactId) && memberContactIds.includes(contactId);
}

export function resolveCouplePatrimoineOwner(
  ownerKey: string,
  memberContactIds: [number, number],
  foyerId: number
): RioPatrimoineOwner {
  if (ownerKey === "foyer") {
    return { foyer_id: foyerId };
  }
  const contactId = Number.parseInt(ownerKey, 10);
  if (!Number.isFinite(contactId) || !memberContactIds.includes(contactId)) {
    throw new Error(`Clé détenteur RIO couple invalide : ${ownerKey}`);
  }
  return { contact_id: contactId };
}

export function isCouplePatrimoineTri(options: {
  coupleMemberIds?: number[];
  foyerId?: number;
  isCouple?: boolean;
}): boolean {
  return Boolean(
    options.isCouple &&
      options.foyerId &&
      options.coupleMemberIds?.length === 2
  );
}
