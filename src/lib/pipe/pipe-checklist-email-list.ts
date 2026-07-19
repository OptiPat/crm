import type { Contact } from "@/lib/api/tauri-contacts";
import { isRetiredProfession } from "@/lib/contacts/contact-occupation";
import {
  PIPE_CHECKLIST_PROFILE_SCOPE_LABELS,
  R1_ESTIMATION_RETRAITE_STEPS,
  formatR1EstimationRetraiteStepsText,
  type PipeChecklistProfileScope,
  type PipeChecklistTemplateItem,
  type R1ChecklistProfile,
} from "@/lib/pipe/pipe-checklist-template";
import { groupR1ItemsBySection } from "@/lib/pipe/r1-document-checklist";
import {
  groupR3ImmoItemsBySection,
  type R3ImmoChecklistItemDef,
  type R3ImmoChecklistTemplate,
} from "@/lib/pipe/r3-immo-checklist-template";

const SECTION_LABEL_TO_SCOPE: Record<string, PipeChecklistProfileScope> = Object.fromEntries(
  (Object.entries(PIPE_CHECKLIST_PROFILE_SCOPE_LABELS) as [PipeChecklistProfileScope, string][]).map(
    ([scope, label]) => [label, scope]
  )
);

function formatItemLabel(item: PipeChecklistTemplateItem, lowercaseFirst = false): string {
  let label = item.label.trim();
  if (!label) return "";
  if (lowercaseFirst) {
    label = label.charAt(0).toLowerCase() + label.slice(1);
  }
  const hint = item.hint?.trim();
  if (hint && item.id !== "estimation_retraite") {
    if (item.id === "releves_situation" || !itemHasLongHint(item)) {
      return `${label} (${hint})`;
    }
  }
  return label;
}

function itemHasLongHint(item: PipeChecklistTemplateItem): boolean {
  if (item.id === "estimation_retraite") return true;
  const hint = item.hint?.trim() ?? "";
  return hint.length > 40 || hint.includes("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const R1_EMAIL_UL_STYLE =
  "margin:0.5em 0;padding-left:1.35em;list-style-type:disc;";
const R1_EMAIL_OL_STYLE =
  "margin:0.35em 0 0.5em;padding-left:1.5em;list-style-type:decimal;";

function appendBulletSection(
  sectionItems: PipeChecklistTemplateItem[],
  textLines: string[],
  htmlParts: string[]
): void {
  const labels = sectionItems.map((item) => formatItemLabel(item)).filter(Boolean);
  if (labels.length === 0) return;

  textLines.push(...labels.map((label) => `${label}.`));
  htmlParts.push(
    `<ul style="${R1_EMAIL_UL_STYLE}">${labels
      .map((label) => `<li>${escapeHtml(label)}</li>`)
      .join("")}</ul>`
  );
}

function parseNumberedRetraiteSteps(hint: string | undefined): string[] {
  const lines = hint
    ?.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+\.\s*/, ""))
    .filter(Boolean);
  if (lines && lines.length > 0) return lines;
  return [...R1_ESTIMATION_RETRAITE_STEPS];
}

function appendRetraiteSteps(
  steps: string[],
  textLines: string[],
  htmlParts: string[]
): void {
  const numbered = formatR1EstimationRetraiteStepsText(steps).split("\n");
  textLines.push(...numbered);
  htmlParts.push(
    `<ol style="${R1_EMAIL_OL_STYLE}">${steps
      .map((step) => `<li>${escapeHtml(step)}</li>`)
      .join("")}</ol>`
  );
}

export function formatR1ChecklistEmailList(items: PipeChecklistTemplateItem[]): {
  text: string;
  html: string;
} {
  if (items.length === 0) {
    return { text: "", html: "" };
  }

  const sections = groupR1ItemsBySection(items);
  const textLines: string[] = [];
  const htmlParts: string[] = [];
  const mergedBulletItems: PipeChecklistTemplateItem[] = [];
  let retraiteSectionItems: PipeChecklistTemplateItem[] = [];

  for (const { section, items: sectionItems } of sections) {
    const scope = SECTION_LABEL_TO_SCOPE[section] ?? "base";

    if (scope === "base" || scope === "salarie" || scope === "chef") {
      mergedBulletItems.push(...sectionItems);
      continue;
    }

    if (scope === "retraite") {
      mergedBulletItems.push(...sectionItems);
      retraiteSectionItems = sectionItems;
    }
  }

  appendBulletSection(mergedBulletItems, textLines, htmlParts);

  for (const item of retraiteSectionItems) {
    if (item.id === "estimation_retraite") {
      appendRetraiteSteps(parseNumberedRetraiteSteps(item.hint), textLines, htmlParts);
    }
  }

  return {
    text: textLines.join("\n"),
    html: htmlParts.join(""),
  };
}

export function formatR3ChecklistEmailList(items: PipeChecklistTemplateItem[]): {
  text: string;
  html: string;
} {
  if (items.length === 0) {
    return { text: "", html: "" };
  }

  const emailItems = items.filter((item) => !R3_EMAIL_EXCLUDED_ITEM_IDS.has(item.id));
  const labels = emailItems.map((item) => formatR3EmailItemLabel(item)).filter(Boolean);
  if (labels.length === 0) {
    return { text: "", html: "" };
  }

  return {
    text: labels.map((label) => `${label}.`).join("\n"),
    html: `<ul style="${R1_EMAIL_UL_STYLE}">${labels
      .map((label) => `<li>${escapeHtml(label)}</li>`)
      .join("")}</ul>`,
  };
}

const R3_EMAIL_EXCLUDED_ITEM_IDS = new Set(["der", "rio", "qpi_a_signer"]);

const R3_IMMO_EMAIL_SIMPLIFY_PROJET_LABEL_ITEM_IDS = new Set([
  "contrat_reservation_vefa",
  "compromis_ancien",
  "bulletin_souscription_scpi",
]);

function formatR3ImmoEmailItemLabel(item: R3ImmoChecklistItemDef): string {
  let label = item.label.trim();
  if (!label) return "";
  if (R3_IMMO_EMAIL_SIMPLIFY_PROJET_LABEL_ITEM_IDS.has(item.id)) {
    label = label.replace(/\s*\([^)]+\)\s*$/, "").trim();
    label = label.replace(/\s+signé par le client$/i, "").trim();
  }
  return label;
}

const R3_IMMO_EMAIL_SECTION_STYLE = "margin:0.85em 0 0.25em;font-weight:600;font-size:1em;";

export function formatR3ImmoChecklistEmailList(
  items: readonly R3ImmoChecklistItemDef[],
  template: R3ImmoChecklistTemplate
): { text: string; html: string } {
  if (items.length === 0) {
    return { text: "", html: "" };
  }

  const textLines: string[] = [];
  const htmlParts: string[] = [];

  for (const { section, items: sectionItems } of groupR3ImmoItemsBySection(items, template)) {
    const labels = sectionItems.map((item) => formatR3ImmoEmailItemLabel(item)).filter(Boolean);
    if (labels.length === 0) continue;

    textLines.push(`${section} :`);
    textLines.push(...labels.map((label) => `  - ${label}`));
    htmlParts.push(
      `<p style="${R3_IMMO_EMAIL_SECTION_STYLE}"><strong>${escapeHtml(section)} :</strong></p>`
    );
    htmlParts.push(
      `<ul style="${R1_EMAIL_UL_STYLE}">${labels
        .map((label) => `<li>${escapeHtml(label)}</li>`)
        .join("")}</ul>`
    );
  }

  return {
    text: textLines.join("\n"),
    html: htmlParts.join(""),
  };
}

function formatR3EmailItemLabel(item: PipeChecklistTemplateItem): string {
  if (item.id === "cni") {
    return "Carte d'identité ou passeport en cours de validité";
  }
  const label = item.label.trim();
  if (!label) return "";
  if (item.id === "justificatif_domicile") {
    return label;
  }
  return formatItemLabel(item);
}

/** Document HTML minimal pour l'aperçu iframe (hors reset Tailwind de l'app). */
export function buildR1ChecklistEmailPreviewDocument(html: string): string {
  const body = html.trim();
  if (!body) return "";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
body{margin:0;padding:0;font:12px/1.5 system-ui,-apple-system,sans-serif;color:#111}
ul{margin:.5em 0;padding-left:1.35em;list-style-type:disc}
ol{margin:.35em 0 .5em;padding-left:1.5em;list-style-type:decimal}
li{margin:.15em 0}
</style></head><body>${body}</body></html>`;
}

/** Suggestions pour pré-remplir le profil R1 à la planification (le CGP valide). */
export function suggestR1ChecklistProfileFromContact(
  contact: Pick<Contact, "profession" | "date_naissance">
): R1ChecklistProfile {
  const profession = contact.profession?.trim().toLowerCase() ?? "";
  const chef =
    /\b(chef|dirigeant|gérant|gerant|président|president|entrepreneur|indépendant|independant|libéral|liberal|gérante|gerante)\b/.test(
      profession
    );
  const salarie =
    !chef &&
    /\b(salari|employé|employe|cadre|fonctionnaire|technicien|ingénieur|ingenieur)\b/.test(
      profession
    );
  const retraite = isRetiredProfession(contact.profession);

  return {
    salarie,
    chef_entreprise: chef,
    retraite,
  };
}
