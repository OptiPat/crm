import {
  buildRuleTree,
  isRuleTreeConfig,
  parseRuleTree,
  stringifyRuleTree,
  type RuleLeaf,
  type RuleOp,
} from "@/lib/etiquettes/rule-ast";
import { findFirstInvalidRuleLeafIndex } from "@/lib/etiquettes/rule-leaf-validation";
import {
  parseTemplateEmailMeta,
  TEMPLATE_CORPS_HTML_KEY,
} from "@/lib/emails/template-email-html";
import { setTemplateEmailRelanceInMeta } from "@/lib/emails/template-email-relance";
import { setTemplateEmailSuiviReponseInMeta } from "@/lib/emails/template-email-suivi-reponse";

export const EPHEMERAL_CAMPAIGN_KEY = "ephemeral_campaign";
export const IS_EPHEMERAL_TEMPLATE_KEY = "is_ephemeral";

export type EphemeralCampaignStatus = "draft" | "prepared" | "archived";

export type EphemeralProduitsMatchMode = "all" | "any";

export type EphemeralReinvestFilter = "any" | "inactive" | "active";

export type EphemeralVersementProgrammeFilter = "any" | "inactive" | "active";

export interface EphemeralCampaignAudience {
  /** Si renseigné, l'audience = contacts du segment (snapshot à la préparation). */
  segment_id: number | null;
  categories: string[];
  types_produit: string[];
  noms_produit: string[];
  produits_match_mode: EphemeralProduitsMatchMode;
  reinvestissement_dividendes: EphemeralReinvestFilter;
  versement_programme: EphemeralVersementProgrammeFilter;
  /** Règle combinée optionnelle (JSON rule_tree v1) — TMI, revenus, type produit… */
  rule_tree: string | null;
}

export interface EphemeralCampaignConfig {
  status: EphemeralCampaignStatus;
  batch_key: string | null;
  audience: EphemeralCampaignAudience;
  excluded_contact_ids: number[];
  /** Timestamp Unix ou null = prêt dès validation */
  send_at: number | null;
  prepared_at: number | null;
  archived_at: number | null;
}

export const DEFAULT_EPHEMERAL_CAMPAIGN_AUDIENCE: EphemeralCampaignAudience = {
  segment_id: null,
  categories: ["CLIENT"],
  types_produit: [],
  noms_produit: [],
  produits_match_mode: "all",
  reinvestissement_dividendes: "any",
  versement_programme: "any",
  rule_tree: null,
};

export const DEFAULT_EPHEMERAL_CAMPAIGN: EphemeralCampaignConfig = {
  status: "draft",
  batch_key: null,
  audience: DEFAULT_EPHEMERAL_CAMPAIGN_AUDIENCE,
  excluded_contact_ids: [],
  send_at: null,
  prepared_at: null,
  archived_at: null,
};

function parseAudience(raw: unknown): EphemeralCampaignAudience {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_EPHEMERAL_CAMPAIGN_AUDIENCE };
  }
  const o = raw as Record<string, unknown>;
  const categories = Array.isArray(o.categories)
    ? o.categories.filter((c): c is string => typeof c === "string")
    : DEFAULT_EPHEMERAL_CAMPAIGN_AUDIENCE.categories;
  const typesRaw = o.types_produit ?? o.typesProduit;
  const types_produit = Array.isArray(typesRaw)
    ? typesRaw.filter((t): t is string => typeof t === "string")
    : [];
  const nomsRaw = o.noms_produit ?? o.nomsProduit;
  const noms_produit = Array.isArray(nomsRaw)
    ? nomsRaw.filter((n): n is string => typeof n === "string")
    : [];
  const matchRaw = o.produits_match_mode ?? o.produitsMatchMode;
  const produits_match_mode: EphemeralProduitsMatchMode = matchRaw === "any" ? "any" : "all";
  const reinvestRaw = o.reinvestissement_dividendes ?? o.reinvestissementDividendes;
  const reinvestissement_dividendes: EphemeralReinvestFilter =
    reinvestRaw === "inactive" || reinvestRaw === "active" ? reinvestRaw : "any";
  const versementRaw = o.versement_programme ?? o.versementProgramme;
  const versement_programme: EphemeralVersementProgrammeFilter =
    versementRaw === "inactive" || versementRaw === "active" ? versementRaw : "any";
  const segmentRaw = o.segment_id ?? o.segmentId;
  const segment_id =
    typeof segmentRaw === "number" && segmentRaw > 0 ? segmentRaw : null;
  const ruleTreeRaw = o.rule_tree ?? o.ruleTree;
  const rule_tree =
    typeof ruleTreeRaw === "string" && ruleTreeRaw.trim() ? ruleTreeRaw.trim() : null;
  return {
    segment_id,
    categories: segment_id != null ? [] : categories.length > 0 ? categories : ["CLIENT"],
    types_produit,
    noms_produit,
    produits_match_mode,
    reinvestissement_dividendes,
    versement_programme,
    rule_tree,
  };
}

export function parseEphemeralCampaignConfig(
  variables: string | null | undefined
): EphemeralCampaignConfig | null {
  const meta = parseTemplateEmailMeta(variables);
  if (meta[IS_EPHEMERAL_TEMPLATE_KEY] !== true) return null;
  const raw = meta[EPHEMERAL_CAMPAIGN_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_EPHEMERAL_CAMPAIGN };
  }
  const o = raw as Record<string, unknown>;
  const status: EphemeralCampaignStatus =
    o.status === "prepared" || o.status === "archived" ? o.status : "draft";
  const excludedRaw = o.excluded_contact_ids ?? o.excludedContactIds;
  const excluded = Array.isArray(excludedRaw)
    ? excludedRaw.filter((id): id is number => typeof id === "number")
    : [];
  return {
    status,
    batch_key: typeof o.batch_key === "string" ? o.batch_key : typeof o.batchKey === "string" ? o.batchKey : null,
    audience: parseAudience(o.audience),
    excluded_contact_ids: excluded,
    send_at: typeof o.send_at === "number" ? o.send_at : typeof o.sendAt === "number" ? o.sendAt : null,
    prepared_at:
      typeof o.prepared_at === "number"
        ? o.prepared_at
        : typeof o.preparedAt === "number"
          ? o.preparedAt
          : null,
    archived_at:
      typeof o.archived_at === "number"
        ? o.archived_at
        : typeof o.archivedAt === "number"
          ? o.archivedAt
          : null,
  };
}

export function isEphemeralTemplate(variables: string | null | undefined): boolean {
  const meta = parseTemplateEmailMeta(variables);
  return meta[IS_EPHEMERAL_TEMPLATE_KEY] === true;
}

export function isArchivedEphemeralTemplate(variables: string | null | undefined): boolean {
  const cfg = parseEphemeralCampaignConfig(variables);
  return cfg?.status === "archived";
}

export function hasEphemeralProductFilter(audience: EphemeralCampaignAudience): boolean {
  return audience.types_produit.length > 0 || audience.noms_produit.length > 0;
}

export function hasEphemeralRuleTree(audience: EphemeralCampaignAudience): boolean {
  return isRuleTreeConfig(audience.rule_tree);
}

export function isEphemeralRuleTreeValid(ruleTree: string | null | undefined): boolean {
  const tree = parseRuleTree(ruleTree);
  if (!tree || tree.children.length === 0) return false;
  return findFirstInvalidRuleLeafIndex(tree.children) == null;
}

export function defaultEphemeralRuleChildren(): RuleLeaf[] {
  return [
    { type: "TMI", config: { tranches: [30] }, categories: ["CLIENT"] },
    {
      type: "REVENUS_ANNUELS",
      config: { operator: "gte", montant: 60_000 },
      categories: ["CLIENT"],
    },
  ];
}

export function ephemeralRuleTreeToJson(op: RuleOp, children: RuleLeaf[]): string {
  return stringifyRuleTree(buildRuleTree(children, op));
}

export function parseEphemeralRuleTree(
  ruleTree: string | null | undefined
): { op: RuleOp; children: RuleLeaf[] } | null {
  const tree = parseRuleTree(ruleTree);
  if (!tree) return null;
  return { op: tree.op, children: tree.children };
}

const EPHEMERAL_CLIENT_SIDE_CATEGORIES = new Set([
  "CLIENT",
  "PROSPECT_CLIENT",
  "SUSPECT_CLIENT",
]);

/** Patrimoine ciblé : uniquement si une catégorie « client » est cochée (seul ou avec filleul). */
export function shouldShowEphemeralPatrimoineFilter(categories: readonly string[]): boolean {
  return categories.some((c) => EPHEMERAL_CLIENT_SIDE_CATEGORIES.has(c));
}

export function isEphemeralSegmentAudience(audience: EphemeralCampaignAudience): boolean {
  return audience.segment_id != null && audience.segment_id > 0;
}

export function isEphemeralAudienceValid(audience: EphemeralCampaignAudience): boolean {
  if (audience.segment_id != null && audience.segment_id > 0) {
    return true;
  }
  if (audience.categories.length === 0) return false;
  if (!shouldShowEphemeralPatrimoineFilter(audience.categories)) {
    return true;
  }
  return hasEphemeralProductFilter(audience) || isEphemeralRuleTreeValid(audience.rule_tree);
}

export function setEphemeralCampaignInMeta(
  variables: string | null | undefined,
  config: EphemeralCampaignConfig,
  options?: { isEphemeral?: boolean }
): string {
  const meta = parseTemplateEmailMeta(variables);
  if (options?.isEphemeral === false) {
    delete meta[IS_EPHEMERAL_TEMPLATE_KEY];
    delete meta[EPHEMERAL_CAMPAIGN_KEY];
  } else {
    meta[IS_EPHEMERAL_TEMPLATE_KEY] = true;
    meta[EPHEMERAL_CAMPAIGN_KEY] = config;
  }
  const keepCorpsHtml = meta[TEMPLATE_CORPS_HTML_KEY];
  if (!keepCorpsHtml && Object.keys(meta).length === 0) return "{}";
  return JSON.stringify(meta);
}

const EPHEMERAL_STATUS_RANK: Record<EphemeralCampaignStatus, number> = {
  draft: 0,
  prepared: 1,
  archived: 2,
};

/** Conserve prepared/archived en base si l'état React n'a pas encore rattrapé la sync. */
export function mergeEphemeralCampaignForSave(
  local: EphemeralCampaignConfig,
  stored: EphemeralCampaignConfig | null
): EphemeralCampaignConfig {
  if (!stored) return local;
  if (EPHEMERAL_STATUS_RANK[stored.status] > EPHEMERAL_STATUS_RANK[local.status]) {
    return {
      ...local,
      status: stored.status,
      batch_key: stored.batch_key,
      prepared_at: stored.prepared_at,
      archived_at: stored.archived_at,
    };
  }
  return local;
}

export function stampNewEphemeralTemplateMeta(variables: string | null | undefined): string {
  let meta = setEphemeralCampaignInMeta(
    variables,
    { ...DEFAULT_EPHEMERAL_CAMPAIGN },
    { isEphemeral: true }
  );
  meta =
    setTemplateEmailRelanceInMeta(meta, {
      enabled: false,
      delai_jours: null,
      envoi_heure: null,
      envoi_jours_semaine: null,
    }) ?? meta;
  meta = setTemplateEmailSuiviReponseInMeta(meta, { attendre_reponse: false }) ?? meta;
  return meta;
}

/** Empreinte des champs qui influencent la file (sync backend). */
export function buildEphemeralSyncFingerprint(input: {
  nom: string;
  sujet: string;
  corpsHtml: string;
  agenda_link_id: string | null;
  campaign: EphemeralCampaignConfig;
}): string {
  return JSON.stringify({
    nom: input.nom.trim(),
    sujet: input.sujet.trim(),
    corpsHtml: input.corpsHtml.trim(),
    agenda_link_id: input.agenda_link_id,
    audience: input.campaign.audience,
    excluded_contact_ids: [...input.campaign.excluded_contact_ids].sort((a, b) => a - b),
    send_at: input.campaign.send_at,
    rule_tree: input.campaign.audience.rule_tree,
    // status / batch_key exclus : gérés par sync, pas par l'empreinte « brouillon »
  });
}

/** Heure par défaut quand une date planifiée est choisie sans heure explicite. */
export const EPHEMERAL_DEFAULT_SEND_TIME = "09:00";

export function unixToEphemeralSendDateLocal(ts: number | null): string {
  if (ts == null) return "";
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function unixToEphemeralSendTimeLocal(ts: number | null): string {
  if (ts == null) return EPHEMERAL_DEFAULT_SEND_TIME;
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ephemeralSendDateTimeToUnix(
  date: string,
  time: string = EPHEMERAL_DEFAULT_SEND_TIME
): number | null {
  if (!date.trim()) return null;
  const normalizedTime = time.trim() || EPHEMERAL_DEFAULT_SEND_TIME;
  const ms = Date.parse(`${date}T${normalizedTime}`);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}
