import { describe, expect, it } from "vitest";
import {
  activityBucketGranularity,
  activityChartDrillHint,
  formatActivityBucketLabel,
  formatDashboardPeriodLabel,
  localDayEndUnix,
  localDayStartUnix,
  normalizeDateRange,
  resolveDashboardDateRange,
} from "./dashboard-period-filter";

describe("resolveDashboardDateRange", () => {
  it("borne une plage du → au", () => {
    const range = resolveDashboardDateRange({
      from: "2020-07-05",
      to: "2026-07-05",
    });
    expect(range.start).toBe(localDayStartUnix(2020, 7, 5));
    expect(range.end).toBe(localDayEndUnix(2026, 7, 5));
    expect(range.label).toBe("Vue du 05/07/2020 au 05/07/2026");
  });

  it("inverse si la date de début est après la fin", () => {
    const range = resolveDashboardDateRange({
      from: "2026-01-01",
      to: "2025-01-01",
    });
    expect(range.start).toBe(localDayStartUnix(2025, 1, 1));
    expect(range.end).toBe(localDayEndUnix(2026, 1, 1));
  });
});

describe("normalizeDateRange", () => {
  it("corrige une plage inversée", () => {
    expect(
      normalizeDateRange({ from: "2026-03-01", to: "2026-01-01" })
    ).toEqual({ from: "2026-01-01", to: "2026-03-01" });
  });

  it("conserve l'autre date si un champ est vidé", () => {
    expect(normalizeDateRange({ from: "", to: "2026-03-15" })).toEqual({
      from: "2026-03-15",
      to: "2026-03-15",
    });
    expect(normalizeDateRange({ from: "2026-01-01", to: "" })).toEqual({
      from: "2026-01-01",
      to: "2026-01-01",
    });
  });
});

describe("formatDashboardPeriodLabel", () => {
  it("affiche le libellé Vue du … au …", () => {
    expect(formatDashboardPeriodLabel("2020-07-05", "2026-07-05")).toBe(
      "Vue du 05/07/2020 au 05/07/2026"
    );
  });
});

describe("formatActivityBucketLabel", () => {
  it("inclut l'année pour les buckets mensuels", () => {
    expect(formatActivityBucketLabel("2024-01", "month")).toBe("janvier 2024");
    expect(formatActivityBucketLabel("2025-01", "month")).toBe("janvier 2025");
  });

  it("inclut l'année pour les buckets journaliers", () => {
    expect(formatActivityBucketLabel("2026-03-15", "day")).toBe("15 mars 2026");
  });
});

describe("activityBucketGranularity", () => {
  it("6 ans → buckets annuels", () => {
    expect(activityBucketGranularity("2020-07-05", "2026-07-05")).toBe("year");
  });

  it("1 mois → buckets journaliers", () => {
    expect(activityBucketGranularity("2026-03-01", "2026-03-31")).toBe("day");
  });

  it("6 mois → buckets mensuels", () => {
    expect(activityBucketGranularity("2026-01-01", "2026-06-30")).toBe("month");
  });

  it("seuil 45 jours → jour, 46 → mois", () => {
    expect(activityBucketGranularity("2026-01-01", "2026-02-14")).toBe("day");
    expect(activityBucketGranularity("2026-01-01", "2026-02-15")).toBe("month");
  });
});

describe("activityChartDrillHint", () => {
  it("adapte le libellé au bucket", () => {
    expect(activityChartDrillHint("year")).toBe("une barre (année)");
    expect(activityChartDrillHint("month")).toBe("un mois");
    expect(activityChartDrillHint("day")).toBe("un jour");
  });
});
