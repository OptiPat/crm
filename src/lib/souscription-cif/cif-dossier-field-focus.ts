import type { SouscriptionCifDocumentId } from "@/lib/souscription-cif/souscription-cif-storage";

export type CifDossierFieldFocus = {
  fieldId: string;
  document: SouscriptionCifDocumentId;
};

/** Variable template → champ formulaire dossier + onglet document associé. */
export const CIF_DOSSIER_VARIABLE_FIELD: Readonly<Record<string, CifDossierFieldFocus>> = {
  date_document: { fieldId: "cif-date-doc", document: "lettre-mission" },
  date_der: { fieldId: "cif-date-der", document: "lettre-mission" },
  date_rio: { fieldId: "cif-date-rio", document: "lettre-mission" },
  date_qpi: { fieldId: "cif-date-qpi", document: "lettre-mission" },
  client_lieu_naissance: { fieldId: "cif-lieu-naissance", document: "lettre-mission" },
  objectifs_client: { fieldId: "cif-objectifs", document: "lettre-mission" },
  rappel_demande: { fieldId: "cif-rappel-demande", document: "rapport-mission" },
  rappel_situation_client: { fieldId: "cif-rappel-situation", document: "rapport-mission" },
  analyse_situation_client: { fieldId: "cif-analyse-situation", document: "rapport-mission" },
  conseil: { fieldId: "cif-conseil", document: "annexes-rapport" },
  mes_preconisations: { fieldId: "cif-mes-preconisations", document: "annexes-rapport" },
  descriptions_scpi: { fieldId: "cif-scpi-souscriptions", document: "annexes-rapport" },
  descriptions_capital_invest: {
    fieldId: "cif-descriptions-capital-invest",
    document: "annexes-rapport",
  },
  produits_capital_invest_cibles: {
    fieldId: "cif-capital-invest-souscriptions",
    document: "annexes-rapport",
  },
  provenance_fonds: { fieldId: "cif-provenance-fonds", document: "annexes-rapport" },
  origine_fonds: { fieldId: "cif-origine-fonds", document: "annexes-rapport" },
};

const CGP_VARIABLE_PREFIX = "cgp_";
const CLIENT_VARIABLE_PREFIX = "client_";

export type CifVariableFocusKind = "dossier-field" | "client-profile" | "cgp-profile" | "unknown";

export function classifyCifVariableFocus(key: string): CifVariableFocusKind {
  if (CIF_DOSSIER_VARIABLE_FIELD[key]) return "dossier-field";
  if (key.startsWith(CGP_VARIABLE_PREFIX)) return "cgp-profile";
  if (key.startsWith(CLIENT_VARIABLE_PREFIX)) return "client-profile";
  return "unknown";
}

export function getCifDossierFieldFocus(key: string): CifDossierFieldFocus | null {
  return CIF_DOSSIER_VARIABLE_FIELD[key] ?? null;
}

/** Scroll + focus sur un champ du panneau dossier (input, textarea ou bloc SCPI). */
export function focusCifDossierFieldElement(fieldId: string): void {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus({ preventScroll: true });
  } else if (el instanceof HTMLElement && !el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }
}
