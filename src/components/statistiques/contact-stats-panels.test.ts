import { describe, expect, it } from "vitest";
import { filterAttributionConversionVisibleRows } from "@/components/statistiques/contact-stats-panels";
import type { ContactSourceLeadInvestissementStatRow } from "@/lib/statistiques/contact-source-stats";

function conversionRow(
  partial: Partial<ContactSourceLeadInvestissementStatRow> & Pick<ContactSourceLeadInvestissementStatRow, "key">
): ContactSourceLeadInvestissementStatRow {
  return {
    label: partial.label ?? partial.key,
    contactCount: 2,
    signedContactCount: 0,
    conversionPercent: 0,
    count: 0,
    montantCentimes: 0,
    percent: 0,
    investissementIds: [],
    contactIds: [],
    ...partial,
  };
}

describe("filterAttributionConversionVisibleRows", () => {
  it("masque les lignes sans conversion ni montant côté client", () => {
    const rows = [
      conversionRow({ key: "a", signedContactCount: 1, montantCentimes: 100 }),
      conversionRow({ key: "b" }),
    ];
    expect(filterAttributionConversionVisibleRows(rows, "client")).toHaveLength(1);
    expect(filterAttributionConversionVisibleRows(rows, "client")[0].key).toBe("a");
  });

  it("affiche une ligne filleul dès qu'il y a une inscription", () => {
    const rows = [
      conversionRow({ key: "a", signedContactCount: 1 }),
      conversionRow({ key: "b" }),
    ];
    expect(filterAttributionConversionVisibleRows(rows, "filleul")).toHaveLength(1);
  });
});
