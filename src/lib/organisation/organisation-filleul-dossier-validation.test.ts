import { describe, expect, it } from "vitest";
import {
  describeOrganisationExerciceVisibilityHint,
  validateFilleulDossierDatePatch,
} from "@/lib/organisation/organisation-filleul-dossier-validation";
import { emptyFilleulDossier } from "@/lib/organisation/organisation-filleul-dossier";

describe("organisation-filleul-dossier-validation", () => {
  const contact = {
    id: 1,
    categorie: "AUCUN",
    filleul_categorie: "FILLEUL_DESINSCRIT",
    date_inscription_filleul: undefined,
  };

  it("bloque désinscription avant inscription", () => {
    const dossier = emptyFilleulDossier(1);
    const result = validateFilleulDossierDatePatch(dossier, contact, {
      dateInscription: "2024-06-18",
      dateDesinscription: "2024-01-06",
    });
    expect(result?.blocking).toContain("désinscription");
  });

  it("explique l'absence sur l'exercice courant si sortie avant 01/08", () => {
    const dossier = {
      ...emptyFilleulDossier(1),
      dateInscription: Math.floor(new Date("2024-06-18").getTime() / 1000),
      dateDesinscription: Math.floor(new Date("2025-01-06").getTime() / 1000),
      updatedAt: 1,
    };
    const hint = describeOrganisationExerciceVisibilityHint(
      contact,
      dossier,
      "2025-2026"
    );
    expect(hint).toContain("2025-2026");
    expect(hint).toContain("recherche");
  });

  it("pas de hint « absent de l'arbre » pour un prospect/suspect filleul (pas encore réseau)", () => {
    const prospect = { ...contact, filleul_categorie: "PROSPECT_FILLEUL" };
    const dossier = emptyFilleulDossier(1);
    const hint = describeOrganisationExerciceVisibilityHint(prospect, dossier, "2025-2026");
    expect(hint).toBeNull();
  });
});
