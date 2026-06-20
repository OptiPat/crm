// Validation pure du formulaire d'étiquette (extraite de EtiquetteForm.handleSubmit).
// Retourne le premier message d'erreur, ou null si le formulaire est valide.

import { isExceltisEtiquetteNom } from "@/lib/etiquettes/exceltis";

export interface EtiquetteFormValidationInput {
  nom: string;
  emailActif: boolean;
  emailTemplateId: number | null;
  emailEnvoiMode: "eligibility" | "fixed";
  emailEnvoiHeure: string;
  emailEnvoiLocal: string;
  actif: boolean;
  isAuto: boolean;
  segmentId: number | null;
  useComboRule: boolean;
  categoriesSelectionnees: string[];
  ruleChildren: Array<{ categories: string[] }>;
  conditionType: string;
  typesProduitSelectionnes: string[];
}

export function validateEtiquetteForm(i: EtiquetteFormValidationInput): string | null {
  if (!i.nom.trim()) {
    return "Le nom est obligatoire";
  }

  if (i.emailActif) {
    if (!i.emailTemplateId) {
      return "Sélectionnez un template d'email";
    }
    if (i.emailEnvoiMode === "eligibility" && !i.emailEnvoiHeure.trim()) {
      return "Indiquez l'heure d'envoi (éligibilité)";
    }
    const exceltisCampaign = isExceltisEtiquetteNom(i.nom);
    if (
      i.emailEnvoiMode === "fixed" &&
      !i.emailEnvoiLocal.trim() &&
      !exceltisCampaign
    ) {
      return "Indiquez la date et l'heure de la campagne";
    }
  }

  const autoSansSegmentNiCombo = i.actif && i.isAuto && !i.segmentId && !i.useComboRule;

  if (autoSansSegmentNiCombo && i.categoriesSelectionnees.length === 0) {
    return "Sélectionnez au moins une catégorie de contact";
  }

  if (
    i.actif &&
    i.isAuto &&
    i.useComboRule &&
    i.ruleChildren.some((c) => c.categories.length === 0)
  ) {
    return "Chaque condition combinée doit avoir une catégorie";
  }

  if (
    autoSansSegmentNiCombo &&
    i.conditionType === "TYPE_PRODUIT" &&
    i.typesProduitSelectionnes.length === 0
  ) {
    return "Sélectionnez au moins un type de produit";
  }

  return null;
}
