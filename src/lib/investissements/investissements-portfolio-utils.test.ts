import { describe, expect, it } from "vitest";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import {
  compareInvestissementsPortfolio,
  getInvestissementOwnerLabel,
  getPatrimoineLineAmountCentimes,
  groupInvestissementsPortfolio,
  sortInvestissementsPortfolio,
} from "./investissements-portfolio-utils";

const inv = (
  overrides: Partial<InvestissementWithDetails>
): InvestissementWithDetails =>
  ({
    id: 1,
    contact_nom: "DUPONT",
    contact_prenom: "Jean",
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Contrat",
    origine: "MON_CONSEIL",
    montant_initial: 10_000_00,
    versement_programme: false,
    reinvestissement_dividendes: false,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }) as InvestissementWithDetails;

describe("investissements-portfolio-utils", () => {
  it("getPatrimoineLineAmountCentimes privilégie encours pour AV/PER", () => {
    expect(
      getPatrimoineLineAmountCentimes(
        inv({ type_produit: "ASSURANCE_VIE", montant_initial: 10_000_00, encours_actuel: 12_000_00 })
      )
    ).toBe(12_000_00);
    expect(
      getPatrimoineLineAmountCentimes(
        inv({ type_produit: "SCPI", montant_initial: 50_000_00, encours_actuel: 55_000_00 })
      )
    ).toBe(50_000_00);
  });

  it("tri par montant décroissant", () => {
    const sorted = sortInvestissementsPortfolio(
      [
        inv({ id: 1, montant_initial: 1_000_00 }),
        inv({ id: 2, montant_initial: 5_000_00 }),
      ],
      "montant_desc"
    );
    expect(sorted.map((i) => i.id)).toEqual([2, 1]);
  });

  it("groupe par client ou foyer", () => {
    const groups = groupInvestissementsPortfolio(
      [
        inv({ id: 1, contact_prenom: "Jean", contact_nom: "A" }),
        inv({ id: 2, contact_prenom: "Paul", contact_nom: "B" }),
        inv({
          id: 3,
          foyer_id: 9,
          foyer_nom: "Foyer MARTIN",
          contact_prenom: "",
          contact_nom: "",
        }),
      ],
      "client"
    );
    expect(groups).toHaveLength(3);
    expect(groups.some((g) => g.label === "Foyer MARTIN")).toBe(true);
  });

  it("ne fusionne pas deux contacts homonymes", () => {
    const groups = groupInvestissementsPortfolio(
      [
        inv({ id: 1, contact_id: 10, contact_prenom: "Jean", contact_nom: "DUPONT" }),
        inv({ id: 2, contact_id: 20, contact_prenom: "Paul", contact_nom: "DUPONT" }),
      ],
      "client"
    );
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.items.length === 1)).toBe(true);
  });

  it("groupe par catégorie en conservant l'ordre de tri", () => {
    const sorted = sortInvestissementsPortfolio(
      [
        inv({ id: 1, type_produit: "SCPI", date_souscription: 100 }),
        inv({ id: 2, type_produit: "ASSURANCE_VIE", date_souscription: 200 }),
        inv({ id: 3, type_produit: "PINEL", date_souscription: 300 }),
      ],
      "date_desc"
    );
    const groups = groupInvestissementsPortfolio(sorted, "category");
    expect(groups.find((g) => g.key === "immo")?.items.map((i) => i.id)).toEqual([3]);
    expect(groups.find((g) => g.key === "fin")?.items.map((i) => i.id)).toEqual([2, 1]);
  });

  it("getInvestissementOwnerLabel", () => {
    expect(getInvestissementOwnerLabel(inv({ foyer_nom: "Foyer X" }))).toBe("Foyer X");
    expect(
      getInvestissementOwnerLabel(inv({ foyer_nom: undefined, contact_prenom: "Jean", contact_nom: "DUPONT" }))
    ).toBe("Jean DUPONT");
  });

  it("compareInvestissementsPortfolio client asc", () => {
    expect(
      compareInvestissementsPortfolio(
        inv({ contact_nom: "ZED" }),
        inv({ contact_nom: "ALPHA" }),
        "client_asc"
      )
    ).toBeGreaterThan(0);
  });
});
