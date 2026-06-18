import { describe, expect, it } from "vitest";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  filterRappelPatrimoineInvestissements,
  resolveRappelImmobilierLine,
  resolveRappelValeursMobilieresLine,
} from "@/lib/souscription-cif/build-rappel-patrimoine-summary";
import type { Foyer } from "@/lib/api/tauri-foyers";

const baseInv = (overrides: Partial<Investissement>): Investissement =>
  ({
    id: 1,
    contact_id: 1,
    type_produit: "SCPI",
    nom_produit: "Comète",
    montant_initial: 50_000_00,
    origine: "EXISTANT_CLIENT",
    versement_programme: false,
    reinvestissement_dividendes: false,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }) as Investissement;

const foyer: Foyer = {
  id: 10,
  nom: "TEST",
  type_foyer: "COUPLE",
  situation_patrimoniale: "RP + locatif (texte foyer)",
  created_at: 0,
  updated_at: 0,
};

describe("build-rappel-patrimoine-summary", () => {
  it("priorise situation_patrimoniale du foyer", () => {
    const text = resolveRappelImmobilierLine(foyer, [
      baseInv({ type_produit: "RP", nom_produit: "Maison", montant_initial: 400_000_00 }),
    ]);
    expect(text).toBe("RP + locatif (texte foyer)");
  });

  it("immobilier : ponctuation type : valeur, loyer, mensualité", () => {
    const text = resolveRappelImmobilierLine(null, [
      baseInv({
        id: 1,
        type_produit: "RESIDENCE_PRINCIPALE",
        nom_produit: "Primo MTP",
        montant_initial: 300_000_00,
        mensualite_credit: 750_00,
      }),
      baseInv({
        id: 2,
        type_produit: "PINEL",
        nom_produit: "Cap Azur - Sete",
        montant_initial: 160_820_00,
        loyer_mensuel: 580_00,
        mensualite_credit: 650_00,
      }),
      baseInv({
        id: 3,
        type_produit: "LMNP",
        nom_produit: "Studio Lyon",
        montant_initial: 145_000_00,
        loyer_mensuel: 875_00,
        mensualite_credit: 585_00,
      }),
    ]);
    expect(text).toMatch(/Résidence Principale : 300.*€, mensualité 750.*€\/mois/);
    expect(text).toMatch(/Pinel : 160.*€, loyer 580.*€\/mois, mensualité 650.*€\/mois/);
    expect(text).toMatch(/LMNP : 145.*€, loyer 875.*€\/mois, mensualité 585.*€\/mois/);
    expect(text).not.toContain("CRD");
    expect(text).not.toContain("Primo");
    expect(text).not.toContain("Cap Azur");
    expect(text).not.toContain("Studio Lyon");
  });

  it("valeurs mobilières : parenthèses SCPI seulement, durée démembrement, liste complète", () => {
    const investissements = [
      baseInv({
        id: 1,
        type_produit: "SCPI_DEMEMBREMENT",
        nom_produit: "Transitions Europe",
        montant_initial: 15_000_00,
        notes: "Durée: viager",
      }),
      baseInv({
        id: 2,
        type_produit: "ASSURANCE_VIE",
        nom_produit: "Assurance-vie",
        montant_initial: 17_083_00,
      }),
      baseInv({
        id: 3,
        type_produit: "SCPI_DEMEMBREMENT",
        nom_produit: "Epargne Pierre Europe",
        montant_initial: 12_672_00,
        notes: "Durée: 8 ans",
      }),
      baseInv({
        id: 4,
        type_produit: "ASSURANCE_VIE",
        nom_produit: "Generali",
        montant_initial: 3_908_00,
      }),
      baseInv({ id: 5, type_produit: "PER", nom_produit: "PER Entreprise", montant_initial: 8_000_00 }),
      baseInv({ id: 6, type_produit: "FIP_FCPI", nom_produit: "Fonds Innov", montant_initial: 5_000_00 }),
      baseInv({ id: 7, type_produit: "FCPR", nom_produit: "Private Equity X", montant_initial: 4_000_00 }),
      baseInv({ id: 8, type_produit: "SCPI", nom_produit: "Alta Convictions", montant_initial: 10_614_00 }),
    ];

    const text = resolveRappelValeursMobilieresLine(investissements);
    expect(text).toContain("SCPI Démembrement (Transitions Europe) viager");
    expect(text).toContain("SCPI Démembrement (Epargne Pierre Europe) temporaire 8 ans");
    expect(text).toContain("SCPI (Alta Convictions)");
    expect(text).toContain("FIP/FCPI (Fonds Innov)");
    expect(text).toContain("FCPR / FPCI (Private Equity X)");
    expect(text).toContain("Assurance Vie 17");
    expect(text).toContain("Assurance Vie 3");
    expect(text).toContain("PER 8");
    expect(text).not.toContain("(Assurance-vie)");
    expect(text).not.toContain("(Generali)");
    expect(text).not.toContain("(PER Entreprise)");
    expect(text).not.toContain("(+");
  });

  it("filtre client + commun, exclut le conjoint", () => {
    const all = [
      baseInv({ id: 1, contact_id: 1, foyer_id: undefined }),
      baseInv({ id: 2, contact_id: 2, foyer_id: undefined, nom_produit: "Conjoint" }),
      baseInv({ id: 3, contact_id: undefined, foyer_id: 10, nom_produit: "Commun" }),
    ];

    const scoped = filterRappelPatrimoineInvestissements(1, all);
    expect(scoped.map((i) => i.id)).toEqual([1, 3]);
  });
});
