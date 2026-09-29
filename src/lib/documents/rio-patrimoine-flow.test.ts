import { describe, expect, it } from "vitest";
import type { ExtractedData } from "@/lib/pdf";
import {
  buildSkippedEpargneInvestissements,
  hasPatrimoineToTri,
  shouldOpenRioPatrimoineStep,
} from "./rio-patrimoine-flow";

function bankOnly(): ExtractedData {
  return {
    typeDocument: "RIO",
    raw: "",
    contratsFinanciers: [
      {
        id: "cc",
        type: "EPARGNE_BANCAIRE",
        nom: "Compte courant",
        montant: 30000,
        autoOrigine: "EXISTANT_CLIENT",
      },
      {
        id: "la",
        type: "LIVRET_A",
        nom: "Livret A",
        montant: 4000,
        autoOrigine: "EXISTANT_CLIENT",
      },
    ],
  };
}

describe("rio-patrimoine-flow — épargne bancaire seule", () => {
  it("n'ouvre pas l'étape patrimoine pour un nouveau contact", () => {
    const data = bankOnly();
    expect(hasPatrimoineToTri(data)).toBe(false);
    expect(shouldOpenRioPatrimoineStep(data, false)).toBe(false);
  });

  it("crée les lignes « à côté » quand l'étape est sautée", () => {
    const created = buildSkippedEpargneInvestissements(bankOnly(), { contactId: 7 });
    expect(created).toEqual([
      expect.objectContaining({
        contact_id: 7,
        type_produit: "EPARGNE_BANCAIRE",
        nom_produit: "Compte courant",
        montant_initial: 3_000_000,
        origine: "EXISTANT_CLIENT",
      }),
      expect.objectContaining({
        contact_id: 7,
        type_produit: "LIVRET_A",
        nom_produit: "Livret A",
        montant_initial: 400_000,
        origine: "EXISTANT_CLIENT",
      }),
    ]);
  });

  it("ouvre le rapprochement si le contact a déjà des investissements", () => {
    expect(shouldOpenRioPatrimoineStep(bankOnly(), true)).toBe(true);
    expect(buildSkippedEpargneInvestissements(bankOnly(), { contactId: 7 })).toEqual([
      expect.objectContaining({ type_produit: "EPARGNE_BANCAIRE" }),
      expect.objectContaining({ type_produit: "LIVRET_A" }),
    ]);
  });
});
