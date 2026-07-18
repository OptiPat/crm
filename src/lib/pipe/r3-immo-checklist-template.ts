/** Règle d'affichage d'une ligne checklist R3 immo. */
import { getSetting, setSetting } from "@/lib/api/tauri-settings";

export type R3ImmoVisibilityRule =
  | "always"
  | "couple_or_enfants"
  | "marie_or_pacse"
  | "divorce"
  | "separe"
  | "salarie"
  | "salarie_ou_retraite"
  | "chef"
  | "emprunteur_pm"
  | "revenus_fonciers"
  | "revenus_sci"
  | "estimatif_retraite_55"
  | "retraite_profession"
  | "locataire"
  | "heberge_gratuit"
  | "proprietaire"
  | "patrimoine_immo"
  | "proprietaire_ou_patrimoine_immo"
  | "credits_en_cours"
  | "projet_vefa"
  | "projet_ancien"
  | "projet_scpi";

export interface R3ImmoChecklistItemDef {
  id: string;
  section: string;
  label: string;
  hint?: string;
  rule: R3ImmoVisibilityRule;
}

export const R3_IMMO_CHECKLIST_SECTIONS = [
  "Identification — personne physique",
  "Identification — personne morale (S.C.I.)",
  "Revenus — salariés",
  "Revenus — non-salariés",
  "Autres revenus",
  "Divers",
  "Patrimoine immobilier",
  "Crédits en cours",
  "Patrimoine financier",
  "Objet de la demande de prêt",
] as const;

export interface R3ImmoChecklistTemplate {
  sections: string[];
  items: R3ImmoChecklistItemDef[];
}

export const PIPE_R3_IMMO_CHECKLIST_TEMPLATES_SETTING_KEY = "pipe.r3_immo_checklist_templates";
export const PIPE_R3_IMMO_CHECKLIST_TEMPLATES_CHANGED_EVENT =
  "crm:pipe-r3-immo-checklist-templates-changed";

export const R3_IMMO_VISIBILITY_RULE_LABELS: Record<R3ImmoVisibilityRule, string> = {
  always: "Toujours",
  couple_or_enfants: "Couple ou enfants à charge",
  marie_or_pacse: "Marié(e) ou pacsé(e)",
  divorce: "Divorcé(e)",
  separe: "Séparé(e)",
  salarie: "Salarié actif (hors retraité)",
  salarie_ou_retraite: "Salarié ou profession retraité(e)",
  chef: "Chef d'entreprise",
  emprunteur_pm: "Emprunteur personne morale (SCI)",
  revenus_fonciers: "Revenus fonciers hors micro",
  revenus_sci: "Revenus via SCI",
  estimatif_retraite_55: "55 ans ou plus, pas encore retraité",
  retraite_profession: "Profession retraité(e)",
  locataire: "Locataire",
  heberge_gratuit: "Hébergé gratuitement",
  proprietaire: "Propriétaire (résidence)",
  patrimoine_immo: "Patrimoine immobilier en base",
  proprietaire_ou_patrimoine_immo: "Propriétaire ou patrimoine immo",
  credits_en_cours: "Crédits en cours",
  projet_vefa: "Projet VEFA",
  projet_ancien: "Projet ancien",
  projet_scpi: "Projet SCPI",
};

const VALID_R3_IMMO_RULES = new Set<string>(Object.keys(R3_IMMO_VISIBILITY_RULE_LABELS));

export const DEFAULT_R3_IMMO_CHECKLIST_ITEMS: readonly R3ImmoChecklistItemDef[] = [
  {
    id: "cni_emprunteurs",
    section: "Identification — personne physique",
    label: "Carte nationale d'identité du ou des emprunteur(s)",
    rule: "always",
  },
  {
    id: "livret_famille",
    section: "Identification — personne physique",
    label: "Livret de famille complet",
    hint: "Si couple et/ou enfants à charge",
    rule: "couple_or_enfants",
  },
  {
    id: "contrat_mariage_pacs",
    section: "Identification — personne physique",
    label: "Contrat de mariage ou de PACS",
    rule: "marie_or_pacse",
  },
  {
    id: "jugement_divorce_liquidation",
    section: "Identification — personne physique",
    label: "Jugement de divorce et acte de liquidation de communauté",
    rule: "divorce",
  },
  {
    id: "dissolution_pacs",
    section: "Identification — personne physique",
    label: "Dissolution de PACS",
    rule: "separe",
  },
  {
    id: "justificatif_domicile",
    section: "Identification — personne physique",
    label: "Justificatif de domicile de moins de 3 mois",
    rule: "always",
  },
  {
    id: "statuts_sci",
    section: "Identification — personne morale (S.C.I.)",
    label: "Statuts (ou projet de statuts)",
    rule: "emprunteur_pm",
  },
  {
    id: "kbis_sci",
    section: "Identification — personne morale (S.C.I.)",
    label: "KBIS",
    rule: "emprunteur_pm",
  },
  {
    id: "avis_imposition_salarie",
    section: "Revenus — salariés",
    label: "Les 2 derniers avis d'imposition",
    rule: "salarie_ou_retraite",
  },
  {
    id: "bulletins_paie",
    section: "Revenus — salariés",
    label: "Les 3 derniers bulletins de paie + le mois de décembre",
    rule: "salarie",
  },
  {
    id: "contrat_travail",
    section: "Revenus — salariés",
    label: "Contrat de travail",
    hint: "Fonctionnaire ou moins de 1 an d'ancienneté",
    rule: "salarie",
  },
  {
    id: "justificatifs_primes",
    section: "Revenus — salariés",
    label: "Justificatifs des primes et autres",
    rule: "salarie",
  },
  {
    id: "bilans_3",
    section: "Revenus — non-salariés",
    label: "Les 3 derniers bilans",
    rule: "chef",
  },
  {
    id: "avis_imposition_3",
    section: "Revenus — non-salariés",
    label: "Les 3 derniers avis d'imposition ou de non-imposition",
    rule: "chef",
  },
  {
    id: "declarations_fiscales_pro",
    section: "Revenus — non-salariés",
    label: "Les 3 dernières déclarations (2035, 2031, 2139)",
    rule: "chef",
  },
  {
    id: "situation_comptable_cours",
    section: "Revenus — non-salariés",
    label: "Situation comptable de l'année en cours",
    rule: "chef",
  },
  {
    id: "declaration_2044",
    section: "Autres revenus",
    label: "Déclaration 2044 (hors micro-foncier) + bail + dernière quittance",
    rule: "revenus_fonciers",
  },
  {
    id: "estimatif_retraite",
    section: "Autres revenus",
    label: "Estimatif de retraite",
    hint: "Si 55 ans ou plus et pas encore retraité",
    rule: "estimatif_retraite_55",
  },
  {
    id: "pensions_retraites",
    section: "Autres revenus",
    label: "Pensions de retraite",
    hint: "Si profession retraité(e) — pas les bulletins de salaire",
    rule: "retraite_profession",
  },
  {
    id: "sci_2072",
    section: "Autres revenus",
    label: "Dernière déclaration 2072 (SCI)",
    rule: "revenus_sci",
  },
  {
    id: "sci_statuts_revenus",
    section: "Autres revenus",
    label: "Statuts (SCI — revenus)",
    rule: "revenus_sci",
  },
  {
    id: "sci_kbis_revenus",
    section: "Autres revenus",
    label: "KBIS (SCI — revenus)",
    rule: "revenus_sci",
  },
  {
    id: "mandat_recherche_capitaux",
    section: "Divers",
    label: "Mandat de recherche en capitaux",
    rule: "always",
  },
  {
    id: "quittance_loyer",
    section: "Divers",
    label: "Quittance de loyer",
    rule: "locataire",
  },
  {
    id: "bail",
    section: "Divers",
    label: "Bail",
    rule: "locataire",
  },
  {
    id: "attestation_hebergement",
    section: "Divers",
    label: "Attestation d'hébergement",
    rule: "heberge_gratuit",
  },
  {
    id: "titre_propriete",
    section: "Patrimoine immobilier",
    label: "Titre de propriété (+ attestation notaire, prix d'acquisition, taxe foncière)",
    hint: "Résidence principale si propriétaire, ou biens immo en patrimoine",
    rule: "proprietaire_ou_patrimoine_immo",
  },
  {
    id: "declaration_ifi",
    section: "Patrimoine immobilier",
    label: "Déclaration IFI",
    rule: "patrimoine_immo",
  },
  {
    id: "offre_pret",
    section: "Crédits en cours",
    label: "Offre de prêt complète",
    rule: "credits_en_cours",
  },
  {
    id: "tableaux_amortissement",
    section: "Crédits en cours",
    label: "Tableaux d'amortissement des prêts en cours datés",
    rule: "credits_en_cours",
  },
  {
    id: "releves_epargne",
    section: "Patrimoine financier",
    label: "Relevés d'épargne, assurance-vie, livret A, PEA, PERP, Madelin, PEE, PERCO…",
    rule: "always",
  },
  {
    id: "releves_compte_courant",
    section: "Patrimoine financier",
    label: "Les 3 derniers relevés de compte courant (perso, joint)",
    rule: "always",
  },
  {
    id: "justificatifs_apport",
    section: "Patrimoine financier",
    label: "Justificatifs prouvant l'apport personnel",
    rule: "always",
  },
  {
    id: "contrat_reservation_vefa",
    section: "Objet de la demande de prêt",
    label: "Contrat de réservation signé par le client (VEFA)",
    rule: "projet_vefa",
  },
  {
    id: "compromis_ancien",
    section: "Objet de la demande de prêt",
    label: "Compromis de vente signé par le client (ancien)",
    rule: "projet_ancien",
  },
  {
    id: "bulletin_souscription_scpi",
    section: "Objet de la demande de prêt",
    label: "Bulletin de souscription signé par le client (SCPI)",
    rule: "projet_scpi",
  },
] as const;

/** @deprecated Utiliser `DEFAULT_R3_IMMO_CHECKLIST_ITEMS` ou le template chargé depuis les settings. */
export const R3_IMMO_CHECKLIST_ITEMS = DEFAULT_R3_IMMO_CHECKLIST_ITEMS;

export function cloneDefaultR3ImmoChecklistTemplate(): R3ImmoChecklistTemplate {
  return {
    sections: [...R3_IMMO_CHECKLIST_SECTIONS],
    items: DEFAULT_R3_IMMO_CHECKLIST_ITEMS.map((item) => ({ ...item })),
  };
}

export function notifyR3ImmoChecklistTemplatesChanged(): void {
  window.dispatchEvent(new CustomEvent(PIPE_R3_IMMO_CHECKLIST_TEMPLATES_CHANGED_EVENT));
}

export function subscribeR3ImmoChecklistTemplatesChanged(listener: () => void): () => void {
  window.addEventListener(PIPE_R3_IMMO_CHECKLIST_TEMPLATES_CHANGED_EVENT, listener);
  return () => window.removeEventListener(PIPE_R3_IMMO_CHECKLIST_TEMPLATES_CHANGED_EVENT, listener);
}

export function createR3ImmoChecklistItemId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeR3ImmoChecklistItem(raw: unknown): R3ImmoChecklistItemDef | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<R3ImmoChecklistItemDef>;
  const id = item.id?.trim();
  const label = item.label?.trim();
  const section = item.section?.trim();
  const rule = item.rule;
  if (!id || !label || !section || !rule || !VALID_R3_IMMO_RULES.has(rule)) return null;
  return {
    id,
    section,
    label,
    hint: item.hint?.trim() || undefined,
    rule,
  };
}

function orderedSectionsFromItems(
  sections: string[],
  items: readonly R3ImmoChecklistItemDef[]
): string[] {
  const fromItems = [...new Set(items.map((item) => item.section))];
  const ordered = sections.filter((section) => fromItems.includes(section));
  const extras = fromItems.filter((section) => !ordered.includes(section));
  return [...ordered, ...extras];
}

function normalizeR3ImmoChecklistTemplate(raw: unknown): R3ImmoChecklistTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<R3ImmoChecklistTemplate>;
  const items = (parsed.items ?? [])
    .map(normalizeR3ImmoChecklistItem)
    .filter((item): item is R3ImmoChecklistItemDef => item != null);
  if (items.length === 0) return null;
  const defaultSections = [...R3_IMMO_CHECKLIST_SECTIONS];
  const sectionsInput = Array.isArray(parsed.sections)
    ? parsed.sections.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean)
    : defaultSections;
  return {
    sections: orderedSectionsFromItems(
      sectionsInput.length > 0 ? sectionsInput : defaultSections,
      items
    ),
    items,
  };
}

export async function loadR3ImmoChecklistTemplate(): Promise<R3ImmoChecklistTemplate> {
  const raw = await getSetting(PIPE_R3_IMMO_CHECKLIST_TEMPLATES_SETTING_KEY);
  if (raw?.trim()) {
    try {
      const parsed = normalizeR3ImmoChecklistTemplate(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      // fallback default
    }
  }
  return cloneDefaultR3ImmoChecklistTemplate();
}

export async function saveR3ImmoChecklistTemplate(template: R3ImmoChecklistTemplate): Promise<void> {
  const items = template.items
    .map(normalizeR3ImmoChecklistItem)
    .filter((item): item is R3ImmoChecklistItemDef => item != null);
  const payload: R3ImmoChecklistTemplate = {
    sections: orderedSectionsFromItems(template.sections, items),
    items,
  };
  await setSetting(PIPE_R3_IMMO_CHECKLIST_TEMPLATES_SETTING_KEY, JSON.stringify(payload));
  notifyR3ImmoChecklistTemplatesChanged();
}

export function orderedR3ImmoSections(template: R3ImmoChecklistTemplate): string[] {
  return orderedSectionsFromItems(template.sections, template.items);
}

export function groupR3ImmoItemsBySection(
  items: readonly R3ImmoChecklistItemDef[],
  template: R3ImmoChecklistTemplate
): { section: string; items: R3ImmoChecklistItemDef[] }[] {
  const bySection = new Map<string, R3ImmoChecklistItemDef[]>();
  for (const item of items) {
    const list = bySection.get(item.section) ?? [];
    list.push(item);
    bySection.set(item.section, list);
  }
  const ordered = orderedR3ImmoSections(template);
  const extras = [...bySection.keys()].filter((section) => !ordered.includes(section));
  return [...ordered, ...extras]
    .filter((section) => bySection.has(section))
    .map((section) => ({
      section,
      items: bySection.get(section) ?? [],
    }));
}

export function r3ImmoItemLabelById(
  itemId: string,
  template: R3ImmoChecklistTemplate = cloneDefaultR3ImmoChecklistTemplate()
): string | null {
  return template.items.find((item) => item.id === itemId)?.label ?? null;
}
