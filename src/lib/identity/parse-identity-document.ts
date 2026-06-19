import { parseMrzFromText, isMrzFullyVerified, type ParsedMrz } from "@/lib/identity/mrz-parser";
import type {
  IdentityDocumentKind,
  IdentityDocumentLayout,
} from "@/lib/documents/extraction/types";
import {
  extractVisualIdentityFields,
  isPlausibleExpiryDate,
  normalizeIdentityDate,
} from "@/lib/identity/visual-identity-parser";
import {
  sanitizeBirthPlace,
  sanitizePersonName,
} from "@/lib/identity/identity-field-validation";

export type IdentityUserMessageCode =
  | "import_recto_verso"
  | "mrz_detected_unverified"
  | "partial_visual";

/**
 * Détecte une ancienne CNI française dont la validité a pu être prolongée de
 * 5 ans (cartes délivrées 2004–2013 à des majeurs) : la date d'expiration
 * imprimée (validité 10 ans) tombe alors entre 2014 et 2023.
 */
function expiryMayBeFrenchCniExtended(
  format: string | undefined,
  dateExpirationFr?: string
): boolean {
  if (format !== "FRA_LEGACY" || !dateExpirationFr) return false;
  const year = parseInt(dateExpirationFr.slice(6, 10), 10);
  return Number.isInteger(year) && year >= 2014 && year <= 2023;
}

export function looksLikeIdentityDocument(text: string): boolean {
  if (parseMrzFromText(text)) return true;
  const visual = extractVisualIdentityFields(text);
  return Boolean(visual.dateNaissance || visual.lieuNaissance);
}

export function isLikelyIdentityFileName(fileName: string): boolean {
  return /cni|passeport|passport|identit[eé]|carte.?nationale/i.test(fileName);
}

export type FieldProvenance =
  | "mrz_verified"
  | "mrz_unverified"
  | "visual_suggestion"
  | "none";

export type IdentityExtractResult = {
  nom?: string;
  prenom?: string;
  dateNaissance?: string;
  /** jj/mm/aaaa */
  dateNaissanceFr?: string;
  dateExpiration?: string;
  /** jj/mm/aaaa */
  dateExpirationFr?: string;
  /**
   * Ancienne CNI française (2004–2013) : validité prolongée automatiquement
   * de 5 ans sans que la date imprimée ne change. La date d'expiration lue
   * peut donc être périmée à tort — à confirmer auprès du titulaire.
   */
  expiryMayBeExtended?: boolean;
  lieuNaissance?: string;
  sex?: "M" | "F";
  documentNumber?: string;
  mrz?: ParsedMrz;
  mrzVerified: boolean;
  provenance: {
    dateNaissance: FieldProvenance;
    dateExpiration: FieldProvenance;
    lieuNaissance: FieldProvenance;
    nom: FieldProvenance;
    prenom: FieldProvenance;
  };
  source: "mrz" | "visual" | "mixed" | "none";
  confidence: number;
  userMessage?: IdentityUserMessageCode;
  layout?: IdentityDocumentLayout;
  documentKind?: IdentityDocumentKind;
  /** Texte brut — usage interne, non persisté en base. */
  rawText: string;
};

export function identityDateFrToIso(dateFr: string): string | undefined {
  const normalized = normalizeIdentityDate(dateFr);
  if (!normalized) return undefined;
  const [dd, mm, yyyy] = normalized.split("/");
  const d = new Date(Date.UTC(parseInt(yyyy!, 10), parseInt(mm!, 10) - 1, parseInt(dd!, 10), 12));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** Format attendu par le formulaire contact (`yyyy-mm-dd`). */
export function identityDateFrToFormField(dateFr: string): string | undefined {
  const normalized = normalizeIdentityDate(dateFr);
  if (!normalized) return undefined;
  const [dd, mm, yyyy] = normalized.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseIdentityFromText(text: string): IdentityExtractResult {
  return parseIdentityFromRegions({ rectoText: text, versoText: text });
}

function mergeVisualFields(
  recto: ReturnType<typeof extractVisualIdentityFields>,
  fallback: ReturnType<typeof extractVisualIdentityFields>
) {
  return {
    nom: recto.nom ?? fallback.nom,
    prenom: recto.prenom ?? fallback.prenom,
    dateNaissance: recto.dateNaissance ?? fallback.dateNaissance,
    dateExpiration: recto.dateExpiration ?? fallback.dateExpiration,
    lieuNaissance: recto.lieuNaissance ?? fallback.lieuNaissance,
  };
}

/** Recto = champs visuels ; verso = MRZ (prioritaire). */
export function parseIdentityFromRegions(input: {
  rectoText: string;
  versoText: string;
}): IdentityExtractResult {
  const rectoText = input.rectoText.trim();
  const versoText = input.versoText.trim();
  const rawText = [rectoText, versoText].filter(Boolean).join("\n\n");

  const visual = mergeVisualFields(
    extractVisualIdentityFields(rectoText),
    extractVisualIdentityFields(rectoText + "\n" + versoText)
  );

  const mrz =
    parseMrzFromText(versoText) ??
    parseMrzFromText(rawText);
  const mrzVerified = mrz != null && isMrzFullyVerified(mrz);

  const provenance: IdentityExtractResult["provenance"] = {
    dateNaissance: "none",
    dateExpiration: "none",
    lieuNaissance: "none",
    nom: "none",
    prenom: "none",
  };

  let dateNaissanceFr: string | undefined;
  let dateExpirationFr: string | undefined;
  let lieuNaissance: string | undefined;
  let nom: string | undefined;
  let prenom: string | undefined;

  if (mrzVerified && mrz) {
    dateNaissanceFr = mrz.dateNaissance;
    provenance.dateNaissance = "mrz_verified";

    const mrzNom = sanitizePersonName(mrz.surname?.replace(/\s+/g, " ").trim().toUpperCase());
    const mrzPrenomRaw = sanitizePersonName(mrz.givenNames?.replace(/\s+/g, " ").trim());
    if (mrzNom) {
      nom = mrzNom;
      provenance.nom = "mrz_verified";
    }
    if (mrzPrenomRaw) {
      prenom = mrzPrenomRaw.split(/\s+/)[0];
      prenom = prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase();
      provenance.prenom = "mrz_verified";
    }
  }

  if (!dateNaissanceFr && visual.dateNaissance) {
    dateNaissanceFr = visual.dateNaissance;
    provenance.dateNaissance = "visual_suggestion";
  }

  // Expiration, par ordre de confiance :
  //  1. MRZ avec checksum ICAO valide → fiable.
  //  2. Suggestion visuelle plausible (libellé lu sur la pièce).
  //  3. MRZ au checksum d'expiration invalide MAIS dont la ligne porteuse est
  //     fiable (checksum naissance OK = même ligne bien lue) et dont la date
  //     reste plausible. Un seul caractère mal lu (souvent le chiffre de
  //     contrôle) ne doit plus vider le champ : on remplit en marquant
  //     « mrz_unverified » pour que l'UI invite à vérifier.
  if (mrz?.dateExpiration && mrz.checksVerified.expiryDate) {
    dateExpirationFr = mrz.dateExpiration;
    provenance.dateExpiration = "mrz_verified";
  } else if (visual.dateExpiration) {
    dateExpirationFr = visual.dateExpiration;
    provenance.dateExpiration = "visual_suggestion";
  } else if (
    mrz?.dateExpiration &&
    mrz.checksVerified.birthDate &&
    isPlausibleExpiryDate(mrz.dateExpiration, dateNaissanceFr)
  ) {
    dateExpirationFr = mrz.dateExpiration;
    provenance.dateExpiration = "mrz_unverified";
  }

  if (visual.lieuNaissance) {
    lieuNaissance = sanitizeBirthPlace(visual.lieuNaissance);
    if (lieuNaissance) provenance.lieuNaissance = "visual_suggestion";
  }

  if (!nom && visual.nom) {
    nom = visual.nom;
    provenance.nom = "visual_suggestion";
  }

  if (!prenom && visual.prenom) {
    prenom = visual.prenom;
    provenance.prenom = "visual_suggestion";
  }

  let confidence = 0;
  if (mrzVerified) confidence = 90;
  else if (mrz) confidence = 35;
  if (provenance.dateNaissance === "visual_suggestion") confidence = Math.max(confidence, 30);
  if (provenance.dateExpiration === "visual_suggestion") confidence = Math.max(confidence, 20);
  if (provenance.dateExpiration === "mrz_unverified") confidence = Math.max(confidence, 25);
  if (provenance.lieuNaissance === "visual_suggestion") confidence = Math.max(confidence, 25);

  const source: IdentityExtractResult["source"] = mrzVerified
    ? provenance.lieuNaissance === "visual_suggestion"
      ? "mixed"
      : "mrz"
    : mrz
      ? "mixed"
      : provenance.dateNaissance === "visual_suggestion" ||
          provenance.lieuNaissance === "visual_suggestion"
        ? "visual"
        : "none";

  let userMessage: IdentityUserMessageCode | undefined;
  if (!mrzVerified && mrz) {
    userMessage = "mrz_detected_unverified";
  } else if (!mrzVerified && !dateNaissanceFr && !lieuNaissance) {
    userMessage = "import_recto_verso";
  } else if (!mrzVerified && (dateNaissanceFr || lieuNaissance)) {
    userMessage = "partial_visual";
  }

  return {
    nom,
    prenom,
    dateNaissance: dateNaissanceFr ? identityDateFrToIso(dateNaissanceFr) : undefined,
    dateNaissanceFr,
    dateExpiration: dateExpirationFr ? identityDateFrToIso(dateExpirationFr) : undefined,
    dateExpirationFr,
    expiryMayBeExtended: expiryMayBeFrenchCniExtended(mrz?.format, dateExpirationFr),
    lieuNaissance,
    sex: mrzVerified ? mrz?.sex : undefined,
    documentNumber: mrzVerified ? mrz?.documentNumber : undefined,
    mrz: mrz ?? undefined,
    mrzVerified,
    provenance,
    source,
    confidence: Math.min(100, confidence),
    userMessage,
    rawText,
  };
}
