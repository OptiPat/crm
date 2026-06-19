import {
  attribuerEtiquette,
  createEtiquette,
  getAllEtiquettes,
  type Etiquette,
} from "@/lib/api/tauri-etiquettes";
import { getAllTemplatesEmail } from "@/lib/api/tauri-templates-email";

const MOIS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

export const EXCELITIS_ETIQUETTE_PREFIX = "Exceltis — ";

/** Types de contrat éligibles à l'étiquette Exceltis à la souscription. */
export const EXCELITIS_ELIGIBLE_PRODUCT_TYPES = ["ASSURANCE_VIE", "PER"] as const;

export function isExceltisEligibleProductType(typeProduit: string): boolean {
  return (EXCELITIS_ELIGIBLE_PRODUCT_TYPES as readonly string[]).includes(typeProduit);
}

/** Modèle email par défaut (Suivi → Envois, campagnes Exceltis). */
export const EXCELITIS_EMAIL_TEMPLATE_NOM = "Exceltis — remboursement et arbitrage";

/** Extrait « Février 2025 » depuis « Exceltis — Février 2025 ». */
export function parseMillesimeLabelFromEtiquetteNom(nom: string): string | null {
  const trimmed = nom.trim();
  if (!trimmed.toLowerCase().startsWith(EXCELITIS_ETIQUETTE_PREFIX.toLowerCase())) {
    return null;
  }
  const label = trimmed.slice(EXCELITIS_ETIQUETTE_PREFIX.length).trim();
  return label || null;
}

export function isExceltisEtiquetteNom(nom: string): boolean {
  return parseMillesimeLabelFromEtiquetteNom(nom) != null;
}

export interface ExceltisMillesimeOption {
  /** Clé stable ex. `2026-08` */
  key: string;
  /** Libellé affiché ex. `Août 2026` */
  label: string;
  month: number;
  year: number;
  offset: 1 | 2 | 3;
}

function normalizeEtiquetteNom(nom: string): string {
  return nom.trim().toLowerCase();
}

/** Nom d'étiquette canonique pour un millésime (mois + année calendaires). */
export function formatExceltisEtiquetteNom(month: number, year: number): string {
  const label = formatMillesimeLabel(month, year);
  return `${EXCELITIS_ETIQUETTE_PREFIX}${label}`;
}

export function formatMillesimeLabel(month: number, year: number): string {
  const name = MOIS_FR[month - 1];
  if (!name) {
    throw new Error(`Mois invalide: ${month}`);
  }
  return `${name} ${year}`;
}

function addCalendarMonths(base: Date, offset: number): { month: number; year: number } {
  const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

/**
 * Trois millésimes proposés à l'ouverture : M+1, M+2, M+3 par rapport au mois courant.
 */
export function getExceltisMillesimeProposals(
  referenceDate: Date = new Date()
): ExceltisMillesimeOption[] {
  return ([1, 2, 3] as const).map((offset) => {
    const { month, year } = addCalendarMonths(referenceDate, offset);
    return {
      key: `${year}-${String(month).padStart(2, "0")}`,
      label: formatMillesimeLabel(month, year),
      month,
      year,
      offset,
    };
  });
}

export async function findExceltisEtiquetteByMillesime(
  month: number,
  year: number,
  etiquettes?: Etiquette[]
): Promise<Etiquette | undefined> {
  const target = normalizeEtiquetteNom(formatExceltisEtiquetteNom(month, year));
  const list = etiquettes ?? (await getAllEtiquettes());
  return list.find((e) => normalizeEtiquetteNom(e.nom) === target);
}

/** Crée l'étiquette si absente, puis l'attribue en MANUEL (sans retirer les autres). */
export async function ensureExceltisEtiquetteAndAssign(
  contactId: number,
  option: ExceltisMillesimeOption
): Promise<string> {
  const nom = formatExceltisEtiquetteNom(option.month, option.year);
  let etiquette = await findExceltisEtiquetteByMillesime(option.month, option.year);

  if (!etiquette) {
    const templates = await getAllTemplatesEmail();
    const emailTemplate = templates.find((t) => t.nom === EXCELITIS_EMAIL_TEMPLATE_NOM);
    etiquette = await createEtiquette({
      nom,
      couleur: "#EAB308",
      description:
        "Clients avec position Exceltis sur ce millésime. Campagne email déclenchée à la réception du mail Stellium « Remboursement Exceltis ».",
      priorite: 50,
      actif: true,
      email_actif: false,
      email_template_id: emailTemplate?.id ?? null,
      auto_condition_type: null,
      auto_condition_config: null,
      auto_categories: null,
    });
  }

  await attribuerEtiquette(contactId, etiquette.id, "MANUEL");
  return nom;
}
