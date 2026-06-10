export interface NewsletterStructurePreset {
  id: string;
  label: string;
  /** Injecté dans les instructions Mistral à la génération. */
  instructions: string;
}

export const NEWSLETTER_STRUCTURE_PRESETS: NewsletterStructurePreset[] = [
  {
    id: "libre",
    label: "Libre (2–3 sections)",
    instructions: "",
  },
  {
    id: "actu-echeance",
    label: "1 actu + 1 échéance",
    instructions:
      "STRUCTURE OBLIGATOIRE : exactement 2 sections — (1) une actualité patrimoniale concrète pour l'épargnant ; (2) une échéance ou date limite avec actions à mener, highlight:true sur cette 2e section.",
  },
  {
    id: "trois-breves",
    label: "3 brèves courtes",
    instructions:
      "STRUCTURE OBLIGATOIRE : exactement 3 sections courtes (80–120 mots chacune), titres percutants, ton magazine. Pas de section highlight.",
  },
  {
    id: "dossier",
    label: "Dossier thématique",
    instructions:
      "STRUCTURE OBLIGATOIRE : 1 intro contextualisante + 2 sections approfondies sur le thème du numéro (ex. SCPI, assurance-vie, fiscalité). La 2e section peut avoir highlight:true si point d'action urgent.",
  },
];

export function structureInstructionsForPreset(presetId: string): string {
  return NEWSLETTER_STRUCTURE_PRESETS.find((p) => p.id === presetId)?.instructions ?? "";
}
