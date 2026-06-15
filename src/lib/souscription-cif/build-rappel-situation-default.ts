import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import { computeAgeAtDate, formatAgeLabel } from "@/lib/contacts/contact-birthday";
import { formatSituationLabel } from "@/lib/contacts/contact-form-utils";
import { formatFoyerCurrencyEur } from "@/lib/foyers/foyer-display";
import { formatSriWithDefinition } from "@/lib/contacts/investisseur-sri";
import {
  RM_LEGACY_PANEL_TO_RAPPORT_BULLET_LABELS,
  RM_PANEL_BULLET_LABELS_EMPTY_WITH_COLON,
  RM_PANEL_ENDETTEMENT_BULLET_LABEL,
  RM_PANEL_EPARGNE_BULLET_LABEL,
  RM_PANEL_IMMOBILIER_BULLET_LABEL,
  RM_PANEL_MONTANT_INVESTISSEMENT_BULLET_LABEL,
  RM_PANEL_REVENUS_BULLET_LABEL,
  RM_PANEL_TO_RAPPORT_BULLET_LABELS,
  RM_PANEL_VALEURS_MOBILIERES_BULLET_LABEL,
  RM_RECAP_SITUATION_BULLET_LABELS,
  RM_RECAP_SITUATION_SRI_BULLET_LABEL,
} from "@/lib/souscription-cif/rapport-mission-recap-table";

const BULLET_LABELS_EMPTY_WITH_COLON = new Set<string>(RM_PANEL_BULLET_LABELS_EMPTY_WITH_COLON);

function bulletLine(label: string, value?: string | null): string {
  const v = value?.trim();
  if (v) return `➞ ${label} : ${v}`;
  if (BULLET_LABELS_EMPTY_WITH_COLON.has(label)) return `➞ ${label} :`;
  return `➞ ${label}`;
}

function formatFiscalLine(foyer: Foyer | null): string | null {
  if (!foyer) return null;
  const parts: string[] = [];
  if (foyer.revenu_fiscal_reference != null) {
    parts.push(`RFR ${formatFoyerCurrencyEur(foyer.revenu_fiscal_reference)}`);
  }
  if (foyer.tranche_imposition?.trim()) {
    parts.push(foyer.tranche_imposition.trim());
  }
  if (foyer.nombre_parts_fiscales != null) {
    parts.push(`${foyer.nombre_parts_fiscales} part${foyer.nombre_parts_fiscales > 1 ? "s" : ""}`);
  }
  return parts.length > 0 ? parts.join(" ; ") : null;
}

function replaceBulletLabel(text: string, panelLabel: string, rapportLabel: string): string {
  return text.replace(
    new RegExp(`^➞ ${escapeRegExp(panelLabel)}(?= :|$)`, "gm"),
    `➞ ${rapportLabel}`
  );
}

/** Adaptations pour le rendu rapport (libellés document ≠ panneau dossier). */
export function normalizeRappelSituationClient(text: string): string {
  let result = text
    .replace(/➞ Classification non professionnel/g, "➞ Classification")
    .replace(/^➞ Age(?= :|$)/gm, "➞ Âge")
    .replace(/^➞ Nombre d'enfants$/gm, "➞ Nombre d'enfants :")
    .replace(/^➞ Appétences ESG$/gm, "➞ Appétences ESG :");

  for (const [panel, rapport] of [
    ...RM_PANEL_TO_RAPPORT_BULLET_LABELS,
    ...RM_LEGACY_PANEL_TO_RAPPORT_BULLET_LABELS,
  ]) {
    result = replaceBulletLabel(result, panel, rapport);
  }

  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Puces recalculées depuis le contact / le foyer (pas les saisies libres type épargne). */
const CONTACT_SYNC_RAPPEL_LABELS = [
  "Classification",
  "Âge",
  "Résidence fiscale",
  "Situation matrimoniale",
  RM_PANEL_REVENUS_BULLET_LABEL,
  RM_PANEL_IMMOBILIER_BULLET_LABEL,
  RM_RECAP_SITUATION_SRI_BULLET_LABEL,
] as const;

function bulletLinePattern(label: string): string {
  if (label === "Âge") return "(?:Âge|Age)";
  return escapeRegExp(label);
}

function replaceOrInsertBulletLine(text: string, label: string, line: string): string {
  const pattern = new RegExp(`^➞ ${bulletLinePattern(label)}(?= :|$).*$`, "m");
  if (pattern.test(text)) {
    return text.replace(pattern, line);
  }

  const labelIndex = RM_RECAP_SITUATION_BULLET_LABELS.indexOf(
    label as (typeof RM_RECAP_SITUATION_BULLET_LABELS)[number]
  );
  if (labelIndex <= 0) {
    return text.trim() ? `${line}\n${text}` : line;
  }

  for (let i = labelIndex - 1; i >= 0; i--) {
    const prev = RM_RECAP_SITUATION_BULLET_LABELS[i]!;
    const prevPattern = new RegExp(`^➞ ${bulletLinePattern(prev)}.*$`, "m");
    const match = text.match(prevPattern);
    if (match?.index != null) {
      const insertAt = match.index + match[0].length;
      return `${text.slice(0, insertAt)}\n${line}${text.slice(insertAt)}`;
    }
  }

  return text.trim() ? `${text}\n${line}` : line;
}

/**
 * Met à jour les puces dérivées du contact (âge, situation, SRI, foyer…) sans effacer le reste.
 * Si le bloc est vide, retourne le brouillon complet.
 */
export function syncRappelSituationFromContact(
  existing: string,
  contact: Contact | null,
  foyer: Foyer | null
): string {
  const fresh = buildDefaultRappelSituation(contact, foyer);
  if (!existing.trim()) return fresh;

  const freshByLabel = new Map<string, string>();
  for (const line of fresh.split("\n")) {
    const match = line.match(/^➞ (.+?)(?: :|$)/);
    if (match?.[1]) freshByLabel.set(match[1], line);
  }

  let result = existing;
  for (const label of CONTACT_SYNC_RAPPEL_LABELS) {
    const line = freshByLabel.get(label);
    if (line) result = replaceOrInsertBulletLine(result, label, line);
  }
  return result;
}

/** Rappel de situation — brouillon depuis contact + foyer (Recueil / QPI à compléter). */
export function buildDefaultRappelSituation(
  contact: Contact | null,
  foyer: Foyer | null
): string {
  const age =
    contact?.date_naissance != null
      ? formatAgeLabel(computeAgeAtDate(contact.date_naissance))
      : null;

  const sriLine = formatSriWithDefinition(contact?.profil_risque_sri);

  const immobilier = foyer?.situation_patrimoniale?.trim() || null;

  const values: Record<(typeof RM_RECAP_SITUATION_BULLET_LABELS)[number], string | null> = {
    Classification: "Client non professionnel",
    Âge: age,
    "Résidence fiscale": "France",
    "Situation matrimoniale": formatSituationLabel(contact?.situation_familiale),
    "Nombre d'enfants": null,
    [RM_PANEL_REVENUS_BULLET_LABEL]: formatFiscalLine(foyer),
    [RM_PANEL_IMMOBILIER_BULLET_LABEL]: immobilier,
    [RM_PANEL_VALEURS_MOBILIERES_BULLET_LABEL]: null,
    [RM_PANEL_EPARGNE_BULLET_LABEL]: null,
    [RM_PANEL_ENDETTEMENT_BULLET_LABEL]: null,
    [RM_PANEL_MONTANT_INVESTISSEMENT_BULLET_LABEL]: null,
    [RM_RECAP_SITUATION_SRI_BULLET_LABEL]: sriLine,
    "Appétences ESG": null,
  };

  return RM_RECAP_SITUATION_BULLET_LABELS.map((label) => bulletLine(label, values[label])).join(
    "\n"
  );
}
