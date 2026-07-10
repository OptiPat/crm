/**
 * Infère `type_produit` depuis le libellé produit d'un import Excel contacts
 * (colonne « produit » / placement — pas le dispositif fiscal immo Finzzle).
 */
export function inferTypeProduitFromImportProduitLabel(produitRaw: string): string {
  const produitUpper = produitRaw.trim().toUpperCase();
  if (!produitUpper) return "AUTRE";

  if (produitUpper.includes("SCPI") && produitUpper.includes("DEMEMBR")) {
    return "SCPI_DEMEMBREMENT";
  }
  if (produitUpper.includes("SCPI")) return "SCPI";
  if (
    produitUpper.includes("AV") ||
    produitUpper.includes("ASSURANCE") ||
    produitUpper.includes("VIE")
  ) {
    return "ASSURANCE_VIE";
  }
  if (produitUpper.includes("PER")) return "PER";
  if (produitUpper.includes("FCPR") || produitUpper.includes("FPCI")) return "FCPR";
  if (produitUpper.includes("FIP") || produitUpper.includes("FCPI")) return "FIP_FCPI";
  if (produitUpper.includes("G3F")) return "G3F";
  if (produitUpper.includes("LMNP")) return "LMNP";
  if (produitUpper.includes("LMP")) return "LMP";
  if (produitUpper.includes("PINEL")) return "PINEL";
  if (produitUpper.includes("MALRAUX")) return "MALRAUX";
  if (produitUpper.includes("DENORMANDIE")) return "DENORMANDIE";
  if (produitUpper.includes("JEANBRUN")) return "JEANBRUN";
  if (produitUpper.includes("BESSON")) return "BESSON";
  if (produitUpper.includes("SCELLIER")) return "SCELLIER";
  if (produitUpper.includes("ROBIEN")) return "ROBIEN";
  if (produitUpper.includes("MEHAIGNERIE")) return "MEHAIGNERIE";
  if (produitUpper.includes("PERISSOL")) return "PERISSOL";
  if (produitUpper.includes("DUFLOT")) return "DUFLOT";
  if (produitUpper.includes("BORLOO")) return "BORLOO";
  if (produitUpper === "RP" || produitUpper.includes("RESIDENCE PRINCIPALE")) return "RP";
  if (produitUpper === "RS" || produitUpper.includes("RESIDENCE SECONDAIRE")) return "RS";
  if (produitUpper === "DF" || produitUpper.includes("DEFICIT FONCIER")) {
    return "DEFICIT_FONCIER";
  }
  if (produitUpper === "MH" || produitUpper.includes("MONUMENT HISTORIQUE")) {
    return "MONUMENT_HISTORIQUE";
  }
  if (produitUpper.includes("LOCATIF")) return "LOCATIF";
  if (produitUpper.includes("COLOCATION")) return "COLOCATION";
  if (produitUpper.includes("MONOLOCATION")) return "MONOLOCATION";
  if (produitUpper.includes("SCI")) return "SCI";
  if (
    produitUpper.includes("IMMOBILIER") ||
    produitUpper.includes("VILLA") ||
    produitUpper.includes("APPARTEMENT") ||
    produitUpper.includes("MAISON") ||
    produitUpper.includes("IMMEUBLE")
  ) {
    return "IMMOBILIER";
  }
  return "AUTRE";
}
