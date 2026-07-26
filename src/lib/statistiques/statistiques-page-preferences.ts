export type StatistiquesSectionId =
  | "contacts"
  | "prescripteurs"
  | "clients"
  | "filleuls_organisation";

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
  | "attrition_filleul"
  | "geography_client"
  | "geography_filleul"
  | "age_client"
  | "age_filleul"
  | "client_encours_placements"
  | "client_versements_programmes"
  | "client_panier_moyen"
  | "client_assurance_vie"
  | "client_scpi"
  | "client_per"
  | "client_immobilier"
  | "client_above_panier_moyen"
  | "client_scpi_reinvest"
  | "client_vp_coverage"
  | "filleul_org_manager"
  | "filleul_org_volume"
  | "filleul_org_parraineur"
  | "filleul_org_parrainage_per_parraineur"
  | "filleul_org_parrainage_duration"
  | "filleul_org_vaa_duration"
  | "filleul_org_habilitation_duration"
  | "filleul_org_manager_duration"
  | "filleul_org_bridge"
  | "filleul_org_net_growth";

type StatistiquesCollapsibleId = StatistiquesSectionId | StatistiquesPanelId;

const STORAGE_KEY = "crm_statistiques_sections_v1";

type StatistiquesSectionsState = Partial<Record<StatistiquesCollapsibleId, boolean>>;

function migrateSectionsState(state: StatistiquesSectionsState): StatistiquesSectionsState {
  const raw = state as StatistiquesSectionsState & { attrition?: boolean };
  const migrated: StatistiquesSectionsState = { ...raw };
  if (raw.attrition !== undefined && migrated.clients === undefined) {
    migrated.clients = raw.attrition;
  }
  delete (migrated as { attrition?: boolean }).attrition;
  return migrated;
}

function readState(): StatistiquesSectionsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return migrateSectionsState(JSON.parse(raw) as StatistiquesSectionsState);
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

/** Panneaux KPI par section — source canonique pour les compteurs et « Tout ouvrir / replier ». */
export const STATISTIQUES_PANELS_BY_SECTION: Record<
  StatistiquesSectionId,
  readonly StatistiquesPanelId[]
> = {
  contacts: [
    "source_client",
    "source_filleul",
    "conversion_client",
    "conversion_filleul",
  ],
  prescripteurs: [
    "prescripteur_client",
    "prescripteur_filleul",
    "prescripteur_conversion_client",
    "prescripteur_conversion_filleul",
  ],
  filleuls_organisation: [
    "geography_filleul",
    "age_filleul",
    "filleul_org_manager",
    "filleul_org_volume",
    "filleul_org_parraineur",
    "filleul_org_parrainage_per_parraineur",
    "filleul_org_parrainage_duration",
    "filleul_org_vaa_duration",
    "filleul_org_habilitation_duration",
    "filleul_org_manager_duration",
    "filleul_org_bridge",
    "filleul_org_net_growth",
    "attrition_filleul",
  ],
  clients: [
    "geography_client",
    "age_client",
    "client_encours_placements",
    "client_versements_programmes",
    "client_panier_moyen",
    "client_assurance_vie",
    "client_scpi",
    "client_per",
    "client_immobilier",
    "client_above_panier_moyen",
    "client_scpi_reinvest",
    "client_vp_coverage",
    "attrition_client",
  ],
};

export const ALL_STATISTIQUES_PANEL_IDS: StatistiquesPanelId[] = Object.values(
  STATISTIQUES_PANELS_BY_SECTION
).flat();

export function statistiquesPanelCountForSection(sectionId: StatistiquesSectionId): number {
  return STATISTIQUES_PANELS_BY_SECTION[sectionId].length;
}

export function setAllStatistiquesPanelsOpen(open: boolean): void {
  const next = { ...readState() };
  for (const panelId of ALL_STATISTIQUES_PANEL_IDS) {
    next[panelId] = open;
  }
  writeState(next);
}

export function expandAllStatistiquesPanels(): void {
  setAllStatistiquesPanelsOpen(true);
}

export function collapseAllStatistiquesPanels(): void {
  setAllStatistiquesPanelsOpen(false);
}
