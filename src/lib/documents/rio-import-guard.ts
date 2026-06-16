import type { ExtractedData } from "@/lib/pdf";
import { countStelliumColumnLines } from "@/lib/pdf/pdf-layout";
import { detectStelliumDocument } from "@/lib/pdf/stellium";
import { isGuidedStelliumPreview } from "./rio-import-preview";

/** Seuil minimal de confiance Stellium avant l'étape preview. */
export const STELLIUM_IMPORT_MIN_CONFIDENCE = 45;

export interface RioImportAssessment {
  canProceed: boolean;
  detectedType: string;
  formatLabel: string;
  issues: string[];
  warnings: string[];
  missingConfidenceFields: string[];
}

function isStelliumExtract(data: ExtractedData): boolean {
  if (!isGuidedStelliumPreview(data.typeDocument)) return false;
  if (data.typeDocument === "QPI") return true;
  if (data.raw) return detectStelliumDocument(data.raw) === "RIO";
  return true;
}

function hasMinimalIdentity(data: ExtractedData): boolean {
  return Boolean(
    (data.nom?.trim() && data.prenom?.trim()) ||
      data.email?.trim() ||
      data.patrimoineTotal ||
      data.profilRisque
  );
}

/** Champs manquants pour la confiance (affichage utilisateur). */
export function listMissingConfidenceFields(
  data: ExtractedData,
  kind: "RIO" | "QPI"
): string[] {
  const missing: string[] = [];
  const has = (v: unknown) =>
    v !== undefined && v !== null && v !== "" && (!Array.isArray(v) || v.length > 0);

  if (!has(data.nom)) missing.push("nom");
  if (!has(data.prenom)) missing.push("prénom");

  if (kind === "QPI") {
    if (!has(data.profilRisque)) missing.push("profil SRI");
    if (!has(data.dateDocument)) missing.push("date du document");
    return missing;
  }

  if (!has(data.email)) missing.push("email");
  if (!has(data.telephone)) missing.push("téléphone");
  if (!has(data.revenusTotal)) missing.push("revenus");
  if (!has(data.patrimoineTotal)) missing.push("patrimoine");
  if ((data.biensImmobiliers?.length ?? 0) === 0 && !has(data.assuranceVie)) {
    missing.push("détail patrimoine");
  }
  return missing;
}

export function assessRioImport(
  data: ExtractedData,
  options?: { requestedType?: string }
): RioImportAssessment {
  const detectedType = data.typeDocument ?? "INCONNU";
  const stellium = isStelliumExtract(data);
  const legacyRio = data.typeDocument === "RIO" && !stellium;
  const issues: string[] = [];
  const warnings: string[] = [];

  let formatLabel = "Document générique — pas un RIO/QPI Stellium";
  if (data.typeDocument === "QPI") {
    formatLabel = "Profil investisseur Stellium (QPI)";
  } else if (stellium) {
    formatLabel = "Recueil Stellium (RIO)";
  } else if (legacyRio) {
    formatLabel = "RIO (format legacy)";
  }

  if (!stellium && data.typeDocument !== "RIO") {
    issues.push(
      "Ce PDF ne correspond pas à un RIO ou QPI Stellium reconnu. Vérifiez le fichier ou choisissez un autre type de document."
    );
  }

  if (stellium && !hasMinimalIdentity(data)) {
    issues.push(
      "Peu de données extraites (PDF scanné ou texte illisible). Corrigez le fichier ou saisissez manuellement."
    );
  }

  const confidence = data.confidence ?? 0;
  const kind = data.typeDocument === "QPI" ? "QPI" : "RIO";
  const missingConfidenceFields = stellium ? listMissingConfidenceFields(data, kind) : [];

  if (stellium && confidence < STELLIUM_IMPORT_MIN_CONFIDENCE) {
    issues.push(
      `Confiance d'extraction insuffisante (${confidence} %, minimum ${STELLIUM_IMPORT_MIN_CONFIDENCE} %). Vérifiez le PDF avant de continuer.`
    );
  } else if (stellium && confidence < 70 && missingConfidenceFields.length > 0) {
    warnings.push(
      `Confiance modérée (${confidence} %). Champs non détectés : ${missingConfidenceFields.join(", ")}.`
    );
  }

  if (legacyRio) {
    warnings.push(
      "Format RIO ancien (non Stellium 2026) — vérifiez soigneusement les données extraites."
    );
  }

  const requested = options?.requestedType;
  if (requested === "QPI" && data.typeDocument === "RIO") {
    warnings.push("Type sélectionné QPI, document détecté RIO — le flux RIO sera utilisé.");
  } else if (requested === "PATRIMOINE" && data.typeDocument === "QPI") {
    warnings.push("Type sélectionné RIO, document détecté QPI — le flux QPI sera utilisé.");
  }

  if (data.typeDocument === "RIO" && data.profilRisque == null) {
    warnings.push(
      "Le profil investisseur (SRI) n'est pas dans le RIO — importez le QPI séparément pour le SRI."
    );
  }

  if (data.isCouple && stellium && data.raw?.includes("\t")) {
    const columnLines = countStelliumColumnLines(data.raw);
    if (columnLines < 3) {
      warnings.push(
        "Peu de lignes à colonnes détectées dans le PDF couple — vérifiez les montants de chaque investisseur."
      );
    }
  }

  return {
    canProceed: issues.length === 0,
    detectedType,
    formatLabel,
    issues,
    warnings,
    missingConfidenceFields,
  };
}
