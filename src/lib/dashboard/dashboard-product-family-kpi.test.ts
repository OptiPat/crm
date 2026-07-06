import { describe, expect, it } from "vitest";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import { filterDashboardProductFamilyEncoursAvecMoi } from "./dashboard-product-family-kpi";
import { resolveDashboardProductFamily } from "./dashboard-product-families";

function inv(partial: Partial<InvestissementWithDetails> & Pick<InvestissementWithDetails, "id">) {
  return {
    contact_nom: "DUPONT",
    contact_prenom: "Jean",
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Contrat",
    origine: "MON_CONSEIL" as const,
    versement_programme: false,
    reinvestissement_dividendes: false,
    statut: "ACTIF" as const,
    encours_actuel: 10_000,
    created_at: 1,
    updated_at: 1,
    ...partial,
  } satisfies InvestissementWithDetails;
}

describe("dashboard-product-family-kpi", () => {
  it("filtre encours avec moi par famille", () => {
    const rows = filterDashboardProductFamilyEncoursAvecMoi(
      [
        inv({ id: 1, type_produit: "EPARGNE_SALARIALE", contact_id: 1 }),
        inv({ id: 2, type_produit: "PEE", contact_id: 2 }),
        inv({ id: 3, type_produit: "ASSURANCE_VIE", contact_id: 3 }),
        inv({ id: 4, type_produit: "EPARGNE_SALARIALE", origine: "EXISTANT_CLIENT", contact_id: 4 }),
        inv({ id: 5, type_produit: "PERCO", encours_actuel: 0, montant_initial: 0, contact_id: 5 }),
      ],
      "EPARGNE_SALARIALE"
    );
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe("resolveDashboardProductFamily — épargne salariale", () => {
  it("regroupe PEE et PERCO / PERCOL", () => {
    expect(resolveDashboardProductFamily("EPARGNE_SALARIALE")).toBe("EPARGNE_SALARIALE");
    expect(resolveDashboardProductFamily("PEE")).toBe("EPARGNE_SALARIALE");
    expect(resolveDashboardProductFamily("PERCO")).toBe("EPARGNE_SALARIALE");
    expect(resolveDashboardProductFamily("PERCOL")).toBe("EPARGNE_SALARIALE");
  });
});
