import { getSetting, setSetting } from "@/lib/api/tauri-settings";

export const PIPE_CHECKLIST_TEMPLATES_SETTING_KEY = "pipe.checklist_templates";
export const PIPE_CHECKLIST_TEMPLATES_CHANGED_EVENT = "crm:pipe-checklist-templates-changed";

/** Étapes pipe avec checklist documents. */
export type PipeChecklistStage = "R1" | "R2" | "R3";

export type PipeChecklistProfileScope = "base" | "salarie" | "chef" | "retraite";

export interface PipeChecklistTemplateItem {
  id: string;
  label: string;
  hint?: string;
  /** Profils pour lesquels la ligne est visible (`base` = toujours). */
  profiles: PipeChecklistProfileScope[];
  /** Affiche l'option « Pas de crédit » (prêts). */
  noCreditOption?: boolean;
}

export type PipeChecklistTemplates = Record<PipeChecklistStage, PipeChecklistTemplateItem[]>;

export const PIPE_CHECKLIST_STAGES: PipeChecklistStage[] = ["R1", "R2", "R3"];

export const PIPE_CHECKLIST_PROFILE_SCOPE_LABELS: Record<PipeChecklistProfileScope, string> = {
  base: "Toujours",
  salarie: "Salarié",
  chef: "Chef d'entreprise",
  retraite: "Retraite",
};

export const DEFAULT_PIPE_CHECKLIST_TEMPLATES: PipeChecklistTemplates = {
  R1: [
    { id: "avis_imposition", label: "Dernier avis d'imposition", profiles: ["base"] },
    {
      id: "releves_situation",
      label: "Derniers relevés de situation",
      hint: "Livrets, assurance-vie, PER, PEE/PERCO, comptes titres…",
      profiles: ["base"],
    },
    {
      id: "amortissement_prets",
      label: "Tableaux d'amortissement des prêts en cours",
      profiles: ["base"],
      noCreditOption: true,
    },
    {
      id: "bulletin_salaire",
      label: "Dernier bulletin de salaire",
      profiles: ["salarie"],
    },
    {
      id: "bulletin_salaire_decembre",
      label: "Bulletin de salaire de décembre (année précédente)",
      profiles: ["salarie"],
    },
    {
      id: "bilans_comptables",
      label: "3 derniers bilans comptables",
      profiles: ["chef"],
    },
    {
      id: "avis_impot_chef_entreprise",
      label: "3 derniers avis d'impôt",
      profiles: ["chef"],
    },
    {
      id: "estimation_retraite",
      label: "Estimation de pension retraite",
      profiles: ["retraite"],
    },
  ],
  R2: [],
  R3: [
    { id: "der", label: "DER (signé)", profiles: ["base"] },
    { id: "rio", label: "RIO (signé)", profiles: ["base"] },
    { id: "qpi_a_signer", label: "QPI (signé)", profiles: ["base"] },
    { id: "cni", label: "CNI", profiles: ["base"] },
    {
      id: "justificatif_domicile",
      label: "Justificatif de domicile (< 3 mois)",
      hint: "Date d'émission récente",
      profiles: ["base"],
    },
    { id: "rib", label: "RIB", profiles: ["base"] },
  ],
};

export interface R1ChecklistProfile {
  salarie: boolean;
  chef_entreprise: boolean;
  retraite: boolean;
}

export function notifyPipeChecklistTemplatesChanged(): void {
  window.dispatchEvent(new CustomEvent(PIPE_CHECKLIST_TEMPLATES_CHANGED_EVENT));
}

export function subscribePipeChecklistTemplatesChanged(listener: () => void): () => void {
  window.addEventListener(PIPE_CHECKLIST_TEMPLATES_CHANGED_EVENT, listener);
  return () => window.removeEventListener(PIPE_CHECKLIST_TEMPLATES_CHANGED_EVENT, listener);
}

export function cloneDefaultPipeChecklistTemplates(): PipeChecklistTemplates {
  return {
    R1: DEFAULT_PIPE_CHECKLIST_TEMPLATES.R1.map((item) => ({ ...item })),
    R2: [],
    R3: DEFAULT_PIPE_CHECKLIST_TEMPLATES.R3.map((item) => ({ ...item })),
  };
}

function normalizeTemplateItem(raw: unknown): PipeChecklistTemplateItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<PipeChecklistTemplateItem>;
  const id = item.id?.trim();
  const label = item.label?.trim();
  if (!id || !label) return null;
  const profiles = (item.profiles ?? ["base"]).filter((p): p is PipeChecklistProfileScope =>
    p === "base" || p === "salarie" || p === "chef" || p === "retraite"
  );
  return {
    id,
    label,
    hint: item.hint?.trim() || undefined,
    profiles: profiles.length > 0 ? profiles : ["base"],
    noCreditOption: item.noCreditOption === true,
  };
}

function parseTemplatesJson(raw: string): PipeChecklistTemplates | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Record<PipeChecklistStage, unknown>>;
    const normalizeStage = (stage: PipeChecklistStage): PipeChecklistTemplateItem[] => {
      const rows = parsed[stage];
      if (!Array.isArray(rows)) return cloneDefaultPipeChecklistTemplates()[stage];
      return rows
        .map(normalizeTemplateItem)
        .filter((item): item is PipeChecklistTemplateItem => item != null);
    };
    return {
      R1: normalizeStage("R1"),
      R2: normalizeStage("R2"),
      R3: normalizeStage("R3"),
    };
  } catch {
    return null;
  }
}

/** Migration depuis l'ancien setting de libellés (override par clé). */
function migrateLegacyLabelOverrides(raw: string): PipeChecklistTemplates | null {
  try {
    const overrides = JSON.parse(raw) as Record<string, string>;
    const templates = cloneDefaultPipeChecklistTemplates();
    templates.R1 = templates.R1.map((item) => {
      const custom = overrides[item.id]?.trim();
      return custom ? { ...item, label: custom } : item;
    });
    return templates;
  } catch {
    return null;
  }
}

function migrateR3SignedLabels(templates: PipeChecklistTemplates): PipeChecklistTemplates {
  const legacyById: Record<string, { from: string; to: string }> = {
    der: { from: "DER", to: "DER (signé)" },
    rio: { from: "RIO", to: "RIO (signé)" },
    qpi_a_signer: { from: "QPI (à signer)", to: "QPI (signé)" },
  };
  return {
    ...templates,
    R3: templates.R3.map((item) => {
      const migration = legacyById[item.id];
      if (migration && item.label === migration.from) {
        return { ...item, label: migration.to };
      }
      return item;
    }),
  };
}

export async function loadPipeChecklistTemplates(): Promise<PipeChecklistTemplates> {
  const raw = await getSetting(PIPE_CHECKLIST_TEMPLATES_SETTING_KEY);
  if (raw?.trim()) {
    const parsed = parseTemplatesJson(raw);
    if (parsed) return migrateR3SignedLabels(parsed);
  }
  const legacy = await getSetting("pipe.r1_checklist_item_labels");
  if (legacy?.trim()) {
    const migrated = migrateLegacyLabelOverrides(legacy);
    if (migrated) return migrated;
  }
  return cloneDefaultPipeChecklistTemplates();
}

export async function savePipeChecklistTemplates(
  templates: PipeChecklistTemplates
): Promise<void> {
  const payload: PipeChecklistTemplates = {
    R1: templates.R1
      .map(normalizeTemplateItem)
      .filter((item): item is PipeChecklistTemplateItem => item != null),
    R2: templates.R2
      .map(normalizeTemplateItem)
      .filter((item): item is PipeChecklistTemplateItem => item != null),
    R3: templates.R3
      .map(normalizeTemplateItem)
      .filter((item): item is PipeChecklistTemplateItem => item != null),
  };
  await setSetting(PIPE_CHECKLIST_TEMPLATES_SETTING_KEY, JSON.stringify(payload));
  notifyPipeChecklistTemplatesChanged();
}

export function templateItemActiveForProfile(
  item: PipeChecklistTemplateItem,
  profile: R1ChecklistProfile
): boolean {
  if (item.profiles.includes("base")) return true;
  if (item.profiles.includes("salarie") && profile.salarie) return true;
  if (item.profiles.includes("chef") && profile.chef_entreprise) return true;
  if (item.profiles.includes("retraite") && profile.retraite) return true;
  return false;
}

export function getActivePipeChecklistTemplateItems(
  stage: PipeChecklistStage,
  templates: PipeChecklistTemplates,
  profile: R1ChecklistProfile
): PipeChecklistTemplateItem[] {
  return templates[stage].filter((item) => templateItemActiveForProfile(item, profile));
}

export function createPipeChecklistTemplateItemId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function mapPipeChecklistKeysToLabels(
  keys: string[],
  stage: PipeChecklistStage,
  templates: PipeChecklistTemplates
): string[] {
  const byId = new Map(templates[stage].map((item) => [item.id, item.label]));
  return keys.map((key) => byId.get(key) ?? key);
}
