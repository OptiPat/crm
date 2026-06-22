export type DashboardSectionId = "repartition" | "activite" | "campagnes_email";

const STORAGE_KEY = "crm_dashboard_sections_v1";

type DashboardSectionsState = Partial<Record<DashboardSectionId, boolean>>;

function readState(): DashboardSectionsState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DashboardSectionsState;
  } catch {
    return {};
  }
}

function writeState(state: DashboardSectionsState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function loadDashboardSectionOpen(
  sectionId: DashboardSectionId,
  defaultOpen = true
): boolean {
  const stored = readState()[sectionId];
  return stored ?? defaultOpen;
}

export function saveDashboardSectionOpen(sectionId: DashboardSectionId, open: boolean): void {
  writeState({ ...readState(), [sectionId]: open });
}
