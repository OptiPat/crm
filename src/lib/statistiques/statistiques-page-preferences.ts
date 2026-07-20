export type StatistiquesSectionId = "contacts" | "prescripteurs" | "attrition";

export type StatistiquesPanelId =
  | "source_client"
  | "source_filleul"
  | "conversion_client"
  | "conversion_filleul"
  | "prescripteur_client"
  | "prescripteur_filleul"
  | "prescripteur_conversion_client"
  | "prescripteur_conversion_filleul"
  | "attrition_client"
  | "attrition_filleul";

type StatistiquesCollapsibleId = StatistiquesSectionId | StatistiquesPanelId;

const STORAGE_KEY = "crm_statistiques_sections_v1";

type StatistiquesSectionsState = Partial<Record<StatistiquesCollapsibleId, boolean>>;

function readState(): StatistiquesSectionsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StatistiquesSectionsState;
  } catch {
    return {};
  }
}

function writeState(state: StatistiquesSectionsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function loadStatistiquesSectionOpen(
  sectionId: StatistiquesCollapsibleId,
  defaultOpen = true
): boolean {
  const stored = readState()[sectionId];
  return stored ?? defaultOpen;
}

export function saveStatistiquesSectionOpen(
  sectionId: StatistiquesCollapsibleId,
  open: boolean
): void {
  writeState({ ...readState(), [sectionId]: open });
}
