import type { TemplateActivationStatFilter } from "@/lib/emails/template-email-activation";
import { EMAIL_TEMPLATE_CATEGORIES } from "@/lib/emails/template-email-meta";

const STORAGE_KEY = "crm_templates_email_page_v1";

export type TemplatesEmailPagePreferences = {
  searchQuery: string;
  categoryFilter: string;
  activationFilter: TemplateActivationStatFilter | null;
};

const DEFAULTS: TemplatesEmailPagePreferences = {
  searchQuery: "",
  categoryFilter: "all",
  activationFilter: null,
};

const VALID_CATEGORIES = new Set<string>([
  "all",
  ...EMAIL_TEMPLATE_CATEGORIES.map((c) => c.id),
]);

const VALID_ACTIVATION = new Set<string>([
  "trigger",
  "etiquette",
  "relance",
  "no_channel",
]);

function sanitizePreferences(
  raw: Partial<TemplatesEmailPagePreferences>
): TemplatesEmailPagePreferences {
  return {
    searchQuery: typeof raw.searchQuery === "string" ? raw.searchQuery : DEFAULTS.searchQuery,
    categoryFilter: VALID_CATEGORIES.has(raw.categoryFilter ?? "")
      ? (raw.categoryFilter as string)
      : DEFAULTS.categoryFilter,
    activationFilter:
      raw.activationFilter != null && VALID_ACTIVATION.has(raw.activationFilter)
        ? raw.activationFilter
        : null,
  };
}

export function loadTemplatesEmailPagePreferences(): TemplatesEmailPagePreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitizePreferences(JSON.parse(raw) as Partial<TemplatesEmailPagePreferences>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveTemplatesEmailPagePreferences(prefs: TemplatesEmailPagePreferences): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
