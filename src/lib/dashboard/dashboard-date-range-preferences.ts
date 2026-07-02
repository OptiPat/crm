import {
  defaultDashboardDateRangeFilter,
  normalizeDateRange,
  type DashboardDateRangeFilter,
} from "./dashboard-period-filter";

const STORAGE_KEY = "crm_dashboard_date_range_v1";

export function loadDashboardDateRange(): DashboardDateRangeFilter {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDashboardDateRangeFilter();
    const parsed = JSON.parse(raw) as Partial<DashboardDateRangeFilter>;
    if (typeof parsed.from === "string" && typeof parsed.to === "string") {
      return normalizeDateRange({ from: parsed.from, to: parsed.to });
    }
  } catch {
    /* ignore */
  }
  return defaultDashboardDateRangeFilter();
}

export function saveDashboardDateRange(filter: DashboardDateRangeFilter): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeDateRange(filter)));
  } catch {
    /* ignore */
  }
}
