import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  buildCoupleMemberRioFields,
  buildSoloRioContactFields,
  formatRioObjectifs,
  mergeRioFieldsOntoContact,
  normalizeRegimeMatrimonial,
  parseRioObjectifsText,
  resolveChargesEmprunts,
} from "./rio-contact-fields";

const baseContact: Contact = {
  id: 1,
  nom: "DUPONT",
  prenom: "Jean",
  categorie: "CLIENT",
  statut_suivi: "ACTIF",
  date_naissance: 1_000_000_000,
  lieu_naissance: "Paris",
  revenus_annuels: 50_000,
  charges_emprunts: 1_000,
  objectifs_patrimoniaux: "Transmettre",
  created_at: 0,
  updated_at: 0,
};

describe("rio-contact-fields", () => {
  it("mappe identité, revenus, charges, régime et objectifs", () => {
    const fields = buildSoloRioContactFields({
      typeDocument: "RIO",
      nom: "LEGRAND",
      prenom: "Paul",
      civilite: "Monsieur",
      lieuNaissance: "Saint flour",
      dateNaissance: "25/10/1975",
      situationFamiliale: "CELIBATAIRE",
      regimeMatrimonial: "Communauté réduite aux acquêts",
      revenusTotal: 80923,
      chargesEmprunts: 2400,
      chargesEmpruntsPassifs: 0,
      objectifsPrincipaux: ["Accompagner vos enfants", "Préparer votre retraite"],
    });

    expect(fields.civilite).toBe("M");
    expect(fields.lieu_naissance).toBe("Saint flour");
    expect(fields.regime_matrimonial).toBe("Communauté réduite aux acquêts");
    expect(fields.revenus_annuels).toBe(80923);
    expect(fields.charges_emprunts).toBe(2400);
    expect(fields.objectifs_patrimoniaux).toContain("Accompagner vos enfants");
  });

  it("mappe le statut d'occupation du logement", () => {
    const fields = buildSoloRioContactFields({
      typeDocument: "RIO",
      nom: "LEGRAND",
      prenom: "Paul",
      statutOccupationLogement: "LOCATAIRE",
    });
    expect(fields.statut_occupation_logement).toBe("LOCATAIRE");
  });

  it("ignore le régime vide ou tiret", () => {
    const fields = buildSoloRioContactFields({
      typeDocument: "RIO",
      nom: "X",
      prenom: "Y",
      regimeMatrimonial: "-",
    });
    expect(fields.regime_matrimonial).toBeUndefined();
  });

  it("retire la puce Word (U+F0B7) du régime matrimonial", () => {
    expect(normalizeRegimeMatrimonial("Séparation de biens\uF0B7")).toBe(
      "Séparation de biens"
    );
    const fields = buildSoloRioContactFields({
      typeDocument: "RIO",
      nom: "X",
      prenom: "Y",
      regimeMatrimonial: "Séparation de biens\uF0B7",
    });
    expect(fields.regime_matrimonial).toBe("Séparation de biens");
  });

  it("formatRioObjectifs et parseRioObjectifsText sont réversibles", () => {
    const objectifs = ["Préparer votre retraite", "Transmettre votre patrimoine"];
    const text = formatRioObjectifs(objectifs)!;
    expect(parseRioObjectifsText(text)).toEqual(objectifs);
  });

  it("parseRioObjectifsText accepte une ligne par objectif", () => {
    const text =
      "Optimiser la rentabilité de vos placements financiers\nPréparer votre retraite";
    expect(parseRioObjectifsText(text)).toEqual([
      "Optimiser la rentabilité de vos placements financiers",
      "Préparer votre retraite",
    ]);
  });

  it("additionne charges conso et passifs", () => {
    expect(
      resolveChargesEmprunts({
        typeDocument: "RIO",
        chargesEmprunts: 2400,
        chargesEmpruntsPassifs: 30516,
      })
    ).toBe(32916);
  });

  it("utilise chargesTotal si détail emprunts absent (saisie manuelle)", () => {
    expect(
      resolveChargesEmprunts({
        typeDocument: "RIO",
        chargesTotal: 12_000,
      })
    ).toBe(12_000);
  });

  it("mergeRioFieldsOntoContact préserve date_naissance si RIO sans date", () => {
    const merged = mergeRioFieldsOntoContact(baseContact, {
      nom: "DUPONT",
      prenom: "Jean",
      profession: "Directeur",
    });
    expect(merged.date_naissance).toBeUndefined();
    expect(merged.profession).toBe("Directeur");
    expect(merged.lieu_naissance).toBe("Paris");
    expect(merged.revenus_annuels).toBe(50_000);
  });

  it("mergeRioFieldsOntoContact applique date_naissance du RIO", () => {
    const merged = mergeRioFieldsOntoContact(baseContact, {
      date_naissance: "1975-10-25T00:00:00.000Z",
    });
    expect(merged.date_naissance).toBe("1975-10-25T00:00:00.000Z");
  });

  it("mappe employeur vers profession si profession absente", () => {
    const fields = buildSoloRioContactFields({
      typeDocument: "RIO",
      nom: "X",
      prenom: "Y",
      employeur: "Acme Corp",
    });
    expect(fields.profession).toBe("Acme Corp");
  });

  it("conserve profession explicite plutôt que employeur", () => {
    const fields = buildSoloRioContactFields({
      typeDocument: "RIO",
      nom: "X",
      prenom: "Y",
      profession: "Directeur",
      employeur: "Acme Corp",
    });
    expect(fields.profession).toBe("Directeur");
  });

  it("mappe profilRisque vers profil_risque_sri", () => {
    const fields = buildSoloRioContactFields({
      typeDocument: "RIO",
      nom: "X",
      prenom: "Y",
      profilRisque: 4,
    });
    expect(fields.profil_risque_sri).toBe(4);
  });

  it("mergeRioFieldsOntoContact propage profil_risque_sri", () => {
    const merged = mergeRioFieldsOntoContact(baseContact, {
      profil_risque_sri: 5,
    });
    expect(merged.profil_risque_sri).toBe(5);
  });

  it("mergeRioFieldsOntoContact identityFillEmptyOnly préserve email existant", () => {
    const merged = mergeRioFieldsOntoContact(
      { ...baseContact, email: "existant@mail.fr" },
      { email: "parse@mail.fr", profession: "Directeur" },
      { identityFillEmptyOnly: true }
    );
    expect(merged.email).toBe("existant@mail.fr");
    expect(merged.profession).toBe("Directeur");
  });

  it("mergeRioFieldsOntoContact identityFillEmptyOnly remplit email vide", () => {
    const merged = mergeRioFieldsOntoContact(
      { ...baseContact, email: undefined },
      { email: "nouveau@mail.fr" },
      { identityFillEmptyOnly: true }
    );
    expect(merged.email).toBe("nouveau@mail.fr");
  });

  it("includeFinancial false exclut revenus/charges/objectifs/SRI", () => {
    const fields = buildSoloRioContactFields(
      {
        typeDocument: "RIO",
        nom: "X",
        prenom: "Y",
        revenusTotal: 50_000,
        chargesEmprunts: 1000,
        objectifsPrincipaux: ["Retraite"],
        profilRisque: 3,
      },
      { includeFinancial: false }
    );
    expect(fields.revenus_annuels).toBeUndefined();
    expect(fields.charges_emprunts).toBeUndefined();
    expect(fields.objectifs_patrimoniaux).toBeUndefined();
    expect(fields.profil_risque_sri).toBeUndefined();
  });

  it("buildCoupleMemberRioFields répartit charges et objectifs sur P1 seulement", () => {
    const data = {
      typeDocument: "RIO" as const,
      nom: "MOREAU",
      prenom: "Guillaume",
      lieuNaissance: "Lyon",
      chargesEmprunts: 100,
      chargesEmpruntsPassifs: 9672,
      objectifsPrincipaux: ["Préparer votre retraite"],
      conjoint: {
        nom: "DURAND",
        prenom: "Claire",
        lieuNaissance: "Paris",
        chargesEmprunts: 200,
        chargesEmpruntsPassifs: 9672,
      },
    };

    const p1 = buildCoupleMemberRioFields(data, "person1");
    const p2 = buildCoupleMemberRioFields(data, "person2");

    expect(p1.lieu_naissance).toBe("Lyon");
    expect(p1.charges_emprunts).toBe(9772);
    expect(p1.objectifs_patrimoniaux).toContain("Préparer votre retraite");

    expect(p2.lieu_naissance).toBe("Paris");
    expect(p2.charges_emprunts).toBe(9872);
    expect(p2.objectifs_patrimoniaux).toBeUndefined();
  });
});
