import type { Contact, NewContact } from "@/lib/api/tauri-contacts";
import type { IdentityExtractResult } from "@/lib/identity/parse-identity-document";
import { identityDateFrToFormField } from "@/lib/identity/parse-identity-document";

export type IdentityMergePreview = {
  patch: Partial<NewContact>;
  filledFields: string[];
  skippedFields: string[];
};

const FIELD_LABELS: Record<string, string> = {
  date_naissance: "Date de naissance",
  lieu_naissance: "Lieu de naissance",
  nom: "Nom",
  prenom: "Prénom",
  civilite: "Civilité",
};

export function contactHasStoredTimestamp(value?: number | null): boolean {
  return value != null && value > 0;
}

export function contactHasStoredBirthPlace(value?: string | null): boolean {
  return Boolean(value?.trim());
}

/** Date fin de validité → champ `date_document` du fichier IDENTITE importé (yyyy-mm-dd). */
export function identityExpirationToDocumentDate(dateExpirationFr?: string): string | undefined {
  if (!dateExpirationFr?.trim()) return undefined;
  return identityDateFrToFormField(dateExpirationFr);
}

/** Complète uniquement les champs vides de la fiche contact. */
export function buildIdentityMergePatch(
  contact: Contact | null,
  extracted: IdentityExtractResult
): IdentityMergePreview {
  const patch: Partial<NewContact> = {};
  const filledFields: string[] = [];
  const skippedFields: string[] = [];

  const trySet = (key: keyof NewContact, label: string, value: unknown) => {
    if (value == null || value === "") return;
    const existing =
      key === "date_naissance"
        ? contact?.date_naissance
        : key === "lieu_naissance"
          ? contact?.lieu_naissance
          : key === "nom"
            ? contact?.nom
            : key === "prenom"
              ? contact?.prenom
              : key === "civilite"
                ? contact?.civilite
                : undefined;
    const hasValue =
      existing != null &&
      existing !== "" &&
      !(typeof existing === "number" && key === "date_naissance" && existing === 0);
    if (hasValue) {
      skippedFields.push(label);
      return;
    }
    (patch as Record<string, unknown>)[key as string] = value;
    filledFields.push(label);
  };

  trySet(
    "date_naissance",
    FIELD_LABELS.date_naissance,
    extracted.dateNaissanceFr
      ? identityDateFrToFormField(extracted.dateNaissanceFr)
      : extracted.dateNaissance?.slice(0, 10)
  );
  trySet("lieu_naissance", FIELD_LABELS.lieu_naissance, extracted.lieuNaissance?.trim());
  trySet("nom", FIELD_LABELS.nom, extracted.nom?.trim().toUpperCase());
  trySet("prenom", FIELD_LABELS.prenom, extracted.prenom?.trim());
  if (extracted.sex === "M") trySet("civilite", FIELD_LABELS.civilite, "M");
  if (extracted.sex === "F") trySet("civilite", FIELD_LABELS.civilite, "MME");

  return { patch, filledFields, skippedFields };
}
