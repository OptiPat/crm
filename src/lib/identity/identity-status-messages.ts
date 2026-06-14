export type { IdentityUserMessageCode } from "@/lib/identity/parse-identity-document";

import type { IdentityDocumentKind, IdentityDocumentLayout } from "@/lib/documents/extraction/types";
import type { IdentityExtractResult } from "@/lib/identity/parse-identity-document";
import { isMrzFullyVerified } from "@/lib/identity/mrz-parser";

function layoutHint(
  layout?: IdentityDocumentLayout,
  documentKind?: IdentityDocumentKind
): string {
  if (layout === "passport" || layout === "passport_multi_page") {
    return "Passeport — page données avec bande MRZ en bas. ";
  }
  if (layout === "two_files") {
    return documentKind === "passport"
      ? "Passeport — recto et verso (ou page données) en 2 fichiers. "
      : "CNI — recto et verso importés en 2 fichiers. ";
  }
  if (documentKind === "passport") {
    return "Passeport détecté. ";
  }
  if (layout === "cni_side_by_side") {
    return "CNI — scan paysage recto à gauche, verso à droite. ";
  }
  if (layout === "single_page_both_sides" || layout === "image") {
    return "CNI — recto en haut, verso (MRZ) en bas. ";
  }
  return "";
}

export function resolveIdentityUserMessage(
  extracted: Pick<
    IdentityExtractResult,
    "mrzVerified" | "mrz" | "dateNaissanceFr" | "lieuNaissance" | "userMessage" | "layout" | "documentKind"
  > | null
): string {
  if (!extracted) {
    return "Aucune donnée extraite — saisissez date et lieu depuis la pièce.";
  }

  const prefix = layoutHint(extracted.layout, extracted.documentKind);

  if (extracted.mrzVerified) {
    if (extracted.documentKind === "passport") {
      return `${prefix}Date lue depuis la MRZ (contrôles ICAO). Vérifiez le lieu de naissance sur la page données du passeport.`;
    }
    return `${prefix}Date lue depuis la MRZ (contrôles ICAO). Vérifiez le lieu de naissance sur le recto de la CNI.`;
  }

  if (extracted.userMessage === "mrz_detected_unverified" || (extracted.mrz && !extracted.mrzVerified)) {
    return `${prefix}MRZ détectée mais illisible (flou, reflets, mauvais cadrage). Reprenez la photo ou saisissez manuellement.`;
  }

  if (extracted.userMessage === "import_recto_verso") {
    return `${prefix}Verso ou bande MRZ non lue — importez recto + verso (PDF 2 pages ou scan une page avec les deux faces).`;
  }

  if (extracted.dateNaissanceFr || extracted.lieuNaissance) {
    return `${prefix}Lecture partielle — vérifiez chaque champ avant d'appliquer.`;
  }

  return `${prefix}Saisissez date et lieu depuis la pièce d'identité.`;
}

export function resolveIdentityToastMessage(extracted: IdentityExtractResult | null): string | undefined {
  if (!extracted) return undefined;
  if (extracted.mrzVerified) return "MRZ vérifiée — contrôlez le lieu de naissance.";
  if (extracted.mrz && !extracted.mrzVerified) {
    return "MRZ illisible — reprenez la photo ou complétez manuellement.";
  }
  if (extracted.confidence < 50) {
    return "Extraction partielle — complétez les champs avant d'appliquer.";
  }
  return undefined;
}

export function summarizeMrzTrust(extracted: IdentityExtractResult | null): string {
  if (!extracted?.mrz) return "MRZ absente";
  if (isMrzFullyVerified(extracted.mrz)) return "MRZ vérifiée (checksums ICAO)";
  return "MRZ détectée — non vérifiable";
}
