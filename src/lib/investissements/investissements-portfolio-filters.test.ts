import { describe, expect, it } from "vitest";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  filterSansEncoursRenseigne,
  filterSansEncoursRenseigneAvecMoi,
  isSansEncoursAvecMoi,
  isSansEncoursRenseigne,
  resolvePortfolioGroupModeWhenFiltered,
} from "./investissements-portfolio-filters";

describe("investissements-portfolio-filters", () => {
  it("isSansEncoursRenseigne — AV sans encours_actuel", () => {
    expect(
      isSansEncoursRenseigne({ type_produit: "ASSURANCE_VIE", encours_actuel: undefined })
    ).toBe(true);
    expect(
      isSansEncoursRenseigne({ type_produit: "ASSURANCE_VIE", encours_actuel: 50000 })
    ).toBe(false);
    expect(
      isSansEncoursRenseigne({ type_produit: "SCPI", encours_actuel: undefined })
    ).toBe(false);
  });

  it("isSansEncoursAvecMoi — exclut à côté", () => {
    expect(
      isSansEncoursAvecMoi({
        type_produit: "ASSURANCE_VIE",
        encours_actuel: undefined,
        origine: "MON_CONSEIL",
      })
    ).toBe(true);
    expect(
      isSansEncoursAvecMoi({
        type_produit: "ASSURANCE_VIE",
        encours_actuel: undefined,
        origine: "EXISTANT_CLIENT",
      })
    ).toBe(false);
  });

  it("resolvePortfolioGroupModeWhenFiltered", () => {
    expect(resolvePortfolioGroupModeWhenFiltered("category", true)).toBe("flat");
    expect(resolvePortfolioGroupModeWhenFiltered("category", false)).toBe("category");
    expect(resolvePortfolioGroupModeWhenFiltered("client", true)).toBe("client");
  });

  it("filterSansEncoursRenseigneAvecMoi", () => {
    const items: Investissement[] = [
      {
        id: 1,
        type_produit: "ASSURANCE_VIE",
        encours_actuel: undefined,
        origine: "MON_CONSEIL",
        versement_programme: false,
        reinvestissement_dividendes: false,
        nom_produit: "AV",
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 2,
        type_produit: "ASSURANCE_VIE",
        encours_actuel: undefined,
        origine: "EXISTANT_CLIENT",
        versement_programme: false,
        reinvestissement_dividendes: false,
        nom_produit: "AV à côté",
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 3,
        type_produit: "ASSURANCE_VIE",
        encours_actuel: 100,
        origine: "MON_CONSEIL",
        versement_programme: false,
        reinvestissement_dividendes: false,
        nom_produit: "AV2",
        created_at: 0,
        updated_at: 0,
      },
    ];
    expect(filterSansEncoursRenseigne(items)).toHaveLength(2);
    expect(filterSansEncoursRenseigneAvecMoi(items)).toHaveLength(1);
  });
});
