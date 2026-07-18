import type { EmailTemplateCategory } from "@/lib/emails/template-email-meta";
import {
  EMAIL_TEMPLATE_VARIABLES,
  PIPE_RDV_TEMPLATE_VARIABLES,
  PLACEMENT_CONFORME_TEMPLATE_VARIABLES,
  getAgendaVariableTokens,
} from "@/lib/emails/template-email-meta";
import { STELLIUM_PERF_TEMPLATE_VARIABLES } from "@/lib/emails/stellium-template-meta";
import { isStelliumPerfTemplateNom } from "@/lib/emails/stellium-template-meta";
import { templateUsesScpiBulletinVariables } from "@/lib/emails/scpi-bulletin-preview-vars";
import { templateUsesStelliumPerfVariables } from "@/lib/emails/stellium-perf-preview-vars";
import { templateUsesPipeRdvVariables } from "@/lib/pipe/pipe-rdv-preview-vars";
import { templateTextUsesPlacementConformeVariables } from "@/lib/placement/placement-conforme-preview-vars";
import type { AgendaLink } from "@/lib/emails/agenda-links";

export type EmailVariableFormat = "text" | "html" | "both";

export type EmailVariableGroupId =
  | "contact"
  | "cgp"
  | "agenda"
  | "campagne"
  | "scpi"
  | "stellium"
  | "pipe"
  | "placement";

export type EmailVariableDef = {
  token: string;
  key: string;
  label: string;
  hint: string;
  group: EmailVariableGroupId;
  format: EmailVariableFormat;
};

export type EmailVariableGroupMeta = {
  id: EmailVariableGroupId;
  label: string;
  description?: string;
};

export const EMAIL_VARIABLE_GROUPS: EmailVariableGroupMeta[] = [
  { id: "contact", label: "Contact" },
  { id: "cgp", label: "Conseiller & cabinet" },
  {
    id: "agenda",
    label: "Liens agenda",
    description: "Liens Google Agenda configurés dans Paramètres",
  },
  {
    id: "campagne",
    label: "Campagne & étiquette",
    description: "Millésime Exceltis, nom d'étiquette, rendement",
  },
  {
    id: "scpi",
    label: "Bulletins SCPI",
    description: "Injectées à la préparation trimestrielle",
  },
  {
    id: "stellium",
    label: "Performance AV/PER Stellium",
    description: "Chiffres et blocs HTML issus de la préparation Stellium",
  },
  {
    id: "pipe",
    label: "Rendez-vous Pipe",
    description: "Date, lieu, visio, co-participant, checklist R1",
  },
  {
    id: "placement",
    label: "Box Placement",
    description: "Opération conforme (arbitrage, réinvestissement…)",
  },
];

const CONTACT_KEYS = new Set(["prenom", "nom", "email", "telephone"]);
const CGP_KEYS = new Set(["cgp_prenom", "cgp_nom", "cgp_email", "cgp_telephone", "cabinet"]);
const CAMPAGNE_KEYS = new Set(["millesime", "etiquette_nom", "rendement_exceltis"]);
const SCPI_KEYS = new Set([
  "periode",
  "scpi_intro_tu",
  "scpi_intro_vous",
  "bulletin_resume",
  "bulletin_resume_html",
]);

const HTML_KEY_SUFFIX = /_html$/;

function inferFormat(key: string, group: EmailVariableGroupId): EmailVariableFormat {
  if (HTML_KEY_SUFFIX.test(key)) return "html";
  if (group === "stellium" && /^perf_detail(_tu)?$/.test(key)) return "text";
  if (group === "stellium" && /^perf_intro_/.test(key)) return "text";
  if (key === "bulletin_resume") return "text";
  return "both";
}

function groupForMetaKey(key: string): EmailVariableGroupId {
  if (CONTACT_KEYS.has(key)) return "contact";
  if (CGP_KEYS.has(key)) return "cgp";
  if (CAMPAGNE_KEYS.has(key)) return "campagne";
  if (SCPI_KEYS.has(key)) return "scpi";
  return "campagne";
}

function toDef(
  v: { token: string; key?: string; label: string; hint: string },
  group: EmailVariableGroupId
): EmailVariableDef {
  const key = v.key ?? v.token.replace(/^\{\{|\}\}$/g, "");
  return {
    token: v.token,
    key,
    label: v.label,
    hint: v.hint,
    group,
    format: inferFormat(key, group),
  };
}

function dedupeByToken(vars: EmailVariableDef[]): EmailVariableDef[] {
  const seen = new Map<string, EmailVariableDef>();
  for (const v of vars) {
    if (!seen.has(v.token)) seen.set(v.token, v);
  }
  return [...seen.values()];
}

/** Catalogue statique (hors liens agenda dynamiques). */
export function getStaticEmailVariables(): EmailVariableDef[] {
  const fromMeta = EMAIL_TEMPLATE_VARIABLES.map((v) => toDef(v, groupForMetaKey(v.key)));
  const fromPipe = PIPE_RDV_TEMPLATE_VARIABLES.map((v) => toDef(v, "pipe"));
  const fromPlacement = PLACEMENT_CONFORME_TEMPLATE_VARIABLES.map((v) => toDef(v, "placement"));
  const fromStellium = STELLIUM_PERF_TEMPLATE_VARIABLES.map((v) => toDef(v, "stellium"));

  const cabinet: EmailVariableDef = {
    token: "{{cabinet}}",
    key: "cabinet",
    label: "Nom du cabinet",
    hint: "Profil CGP — utile newsletter et signature",
    group: "cgp",
    format: "both",
  };

  return dedupeByToken([...fromMeta, cabinet, ...fromPipe, ...fromPlacement, ...fromStellium]);
}

export function getAgendaEmailVariables(links: AgendaLink[]): EmailVariableDef[] {
  return getAgendaVariableTokens(links).map((v) => ({
    token: v.token,
    key: v.token.replace(/^\{\{|\}\}$/g, ""),
    label: v.label,
    hint: v.hint,
    group: "agenda" as const,
    format: "both" as const,
  }));
}

export function getAllEmailVariables(agendaLinks: AgendaLink[] = []): EmailVariableDef[] {
  return dedupeByToken([...getStaticEmailVariables(), ...getAgendaEmailVariables(agendaLinks)]);
}

const ALWAYS_VISIBLE_GROUPS: EmailVariableGroupId[] = ["contact", "cgp", "agenda"];

const CATEGORY_DEFAULT_GROUPS: Partial<Record<EmailTemplateCategory, EmailVariableGroupId[]>> = {
  RENDEZ_VOUS: ["pipe"],
  BULLETINS: ["scpi", "campagne"],
  ARBITRAGE: ["placement", "campagne"],
  SUIVI_ANNUEL: ["campagne"],
  RELANCE: ["campagne"],
  FISCALITE: ["campagne"],
  BIENVENUE: ["campagne"],
  EPHEMERE: ["campagne"],
  NEWSLETTER: ["campagne"],
};

export type EmailVariablePickerContext = {
  categorie: EmailTemplateCategory;
  sujet: string;
  corps: string;
  corpsHtml: string;
  templateNom: string;
  placementConformeTriggerEnabled?: boolean;
};

function contentTriggeredGroups(ctx: EmailVariablePickerContext): Set<EmailVariableGroupId> {
  const triggered = new Set<EmailVariableGroupId>();
  const { sujet, corps, corpsHtml } = ctx;

  if (templateUsesScpiBulletinVariables(sujet, corps, corpsHtml)) triggered.add("scpi");
  if (templateUsesPipeRdvVariables(sujet, corps, corpsHtml)) triggered.add("pipe");
  if (
    ctx.placementConformeTriggerEnabled ||
    templateTextUsesPlacementConformeVariables(sujet, corps, corpsHtml)
  ) {
    triggered.add("placement");
  }
  if (isStelliumPerfTemplateNom(ctx.templateNom) || templateUsesStelliumPerfVariables(sujet, corps, corpsHtml)) {
    triggered.add("stellium");
  }
  return triggered;
}

export function resolveRelevantVariableGroups(
  ctx: EmailVariablePickerContext
): EmailVariableGroupId[] {
  const groups = new Set<EmailVariableGroupId>(ALWAYS_VISIBLE_GROUPS);
  for (const g of CATEGORY_DEFAULT_GROUPS[ctx.categorie] ?? []) {
    groups.add(g);
  }
  for (const g of contentTriggeredGroups(ctx)) {
    groups.add(g);
  }
  return EMAIL_VARIABLE_GROUPS.filter((meta) => groups.has(meta.id)).map((meta) => meta.id);
}

export type EmailVariablePickerSection = {
  meta: EmailVariableGroupMeta;
  variables: EmailVariableDef[];
};

function groupVariables(
  variables: EmailVariableDef[],
  groupIds: EmailVariableGroupId[]
): EmailVariablePickerSection[] {
  const byGroup = new Map<EmailVariableGroupId, EmailVariableDef[]>();
  for (const id of groupIds) {
    byGroup.set(id, []);
  }
  for (const v of variables) {
    const list = byGroup.get(v.group);
    if (list) list.push(v);
  }
  return EMAIL_VARIABLE_GROUPS.filter((meta) => groupIds.includes(meta.id))
    .map((meta) => ({ meta, variables: byGroup.get(meta.id) ?? [] }))
    .filter((section) => section.variables.length > 0);
}

export function filterVariablesByQuery(
  variables: EmailVariableDef[],
  query: string
): EmailVariableDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return variables;
  return variables.filter((v) => {
    const hay = `${v.label} ${v.hint} ${v.token} ${v.key}`.toLowerCase();
    return hay.includes(q);
  });
}

export type ResolvedEmailVariablePicker = {
  primarySections: EmailVariablePickerSection[];
  otherSections: EmailVariablePickerSection[];
  hiddenCount: number;
  allVariables: EmailVariableDef[];
};

export function resolveEmailVariablePicker(
  ctx: EmailVariablePickerContext,
  agendaLinks: AgendaLink[] = []
): ResolvedEmailVariablePicker {
  const allVariables = getAllEmailVariables(agendaLinks);
  const relevantGroupIds = resolveRelevantVariableGroups(ctx);
  const allGroupIds = EMAIL_VARIABLE_GROUPS.map((g) => g.id);
  const otherGroupIds = allGroupIds.filter((id) => !relevantGroupIds.includes(id));

  const primarySections = groupVariables(allVariables, relevantGroupIds);
  const otherSections = groupVariables(allVariables, otherGroupIds);
  const hiddenCount = otherSections.reduce((n, s) => n + s.variables.length, 0);

  return { primarySections, otherSections, hiddenCount, allVariables };
}
