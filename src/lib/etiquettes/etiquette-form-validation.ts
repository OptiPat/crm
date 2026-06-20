// Validation pure du formulaire d'étiquette (extraite de EtiquetteForm.handleSubmit).
// Retourne le premier message d'erreur, ou null si le formulaire est valide.

import { isExceltisEtiquetteNom } from "@/lib/etiquettes/exceltis";

export type EtiquetteFormTab = "general" | "rule" | "email" | "action";

export type EtiquetteFormFieldId =
  | "nom"
  | "email-template"
  | "email-heure"
  | "email-date"
  | "tache-titre"
  | "rule-categories"
  | "rule-types-produit"
  | "rule-group"
  | "rule-tmi"
  | "rule-ir-net";

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
  useGroupRule: boolean;
  useComboRule: boolean;
  categoriesSelectionnees: string[];
  ruleChildren: Array<{
    categories: string[];
    type?: string;
    config?: Record<string, unknown>;
  }>;
  conditionType: string;
  typesProduitSelectionnes: string[];
  tmiTranchesSelectionnees: number[];
  irNetMontant: number | null;
}

export interface EtiquetteFormValidationError {
  message: string;
  tab: EtiquetteFormTab;
  fieldId?: EtiquetteFormFieldId;
}

export function validateEtiquetteFormDetailed(
  i: EtiquetteFormValidationInput
): EtiquetteFormValidationError | null {
  if (!i.nom.trim()) {
    return { message: "Le nom est obligatoire", tab: "general", fieldId: "nom" };
  }

  if (i.emailActif) {
    if (!i.emailTemplateId) {
      return {
        message: "Sélectionnez un template d'email",
        tab: "email",
        fieldId: "email-template",
      };
    }
    if (i.emailEnvoiMode === "eligibility" && !i.emailEnvoiHeure.trim()) {
      return {
        message: "Indiquez l'heure d'envoi (éligibilité)",
        tab: "email",
        fieldId: "email-heure",
      };
    }
    const exceltisCampaign = isExceltisEtiquetteNom(i.nom);
    if (
      i.emailEnvoiMode === "fixed" &&
      !i.emailEnvoiLocal.trim() &&
      !exceltisCampaign
    ) {
      return {
        message: "Indiquez la date et l'heure de la campagne",
        tab: "email",
        fieldId: "email-date",
      };
    }
  }

  if (i.actif && i.isAuto && i.useGroupRule && !i.segmentId) {
    return {
      message: "Choisissez un groupe de contacts ou repassez sur « Sur cette étiquette »",
      tab: "rule",
      fieldId: "rule-group",
    };
  }

  const autoSansSegmentNiCombo = i.actif && i.isAuto && !i.useGroupRule && !i.useComboRule;

  if (autoSansSegmentNiCombo && i.categoriesSelectionnees.length === 0) {
    return {
      message: "Sélectionnez au moins une catégorie de contact",
      tab: "rule",
      fieldId: "rule-categories",
    };
  }

  if (
    i.actif &&
    i.isAuto &&
    i.useComboRule &&
    i.ruleChildren.some((c) => c.categories.length === 0)
  ) {
    return {
      message: "Chaque condition combinée doit avoir une catégorie",
      tab: "rule",
      fieldId: "rule-categories",
    };
  }

  if (i.actif && i.isAuto && i.useComboRule) {
    for (const child of i.ruleChildren) {
      if (child.type === "TMI") {
        const tranches = (child.config?.tranches as unknown[] | undefined) ?? [];
        if (tranches.length === 0) {
          return {
            message: "Sélectionnez au moins une tranche TMI",
            tab: "rule",
            fieldId: "rule-tmi",
          };
        }
      }
      if (child.type === "IR_NET") {
        const montant = child.config?.montant;
        if (montant == null || montant === "" || !Number.isFinite(Number(montant))) {
          return {
            message: "Indiquez le montant d'IR net à comparer",
            tab: "rule",
            fieldId: "rule-ir-net",
          };
        }
      }
    }
  }

  if (
    autoSansSegmentNiCombo &&
    i.conditionType === "TYPE_PRODUIT" &&
    i.typesProduitSelectionnes.length === 0
  ) {
    return {
      message: "Sélectionnez au moins un type de produit",
      tab: "rule",
      fieldId: "rule-types-produit",
    };
  }

  if (autoSansSegmentNiCombo && i.conditionType === "TMI" && i.tmiTranchesSelectionnees.length === 0) {
    return {
      message: "Sélectionnez au moins une tranche TMI",
      tab: "rule",
      fieldId: "rule-tmi",
    };
  }

  if (
    autoSansSegmentNiCombo &&
    i.conditionType === "IR_NET" &&
    (i.irNetMontant == null || !Number.isFinite(i.irNetMontant))
  ) {
    return {
      message: "Indiquez le montant d'IR net à comparer",
      tab: "rule",
      fieldId: "rule-ir-net",
    };
  }

  return null;
}

export function validateEtiquetteForm(i: EtiquetteFormValidationInput): string | null {
  return validateEtiquetteFormDetailed(i)?.message ?? null;
}

export function validateEtiquetteTacheAction(titre: string, tacheActif: boolean): EtiquetteFormValidationError | null {
  if (tacheActif && !titre.trim()) {
    return {
      message: "Indiquez un titre pour la tâche à créer",
      tab: "action",
      fieldId: "tache-titre",
    };
  }
  return null;
}
