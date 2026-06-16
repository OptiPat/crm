import { describe, expect, it } from "vitest";
import { mapExtractedDataToContact } from "./rio-import-map";

describe("rio-import-map", () => {
  it("mappe un RIO solo vers NewContact", () => {
    const contact = mapExtractedDataToContact({
      typeDocument: "RIO",
      nom: "MARTIN",
      prenom: "Paul",
      civilite: "M.",
      email: "paul@example.com",
      telephone: "0600000000",
      dateNaissance: "19/07/1995",
      lieuNaissance: "Montpellier",
      situationFamiliale: "MARIÉ",
      revenusTotal: 50000,
      chargesEmprunts: 1200,
      objectifsPrincipaux: ["Préparer votre retraite"],
    });

    expect(contact.nom).toBe("MARTIN");
    expect(contact.prenom).toBe("Paul");
    expect(contact.civilite).toBe("M");
    expect(contact.email).toBe("paul@example.com");
    expect(contact.situation_familiale).toBe("MARIE");
    expect(contact.lieu_naissance).toBe("Montpellier");
    expect(contact.revenus_annuels).toBe(50000);
    expect(contact.charges_emprunts).toBe(1200);
    expect(contact.objectifs_patrimoniaux).toContain("Préparer votre retraite");
    expect(contact.date_naissance).toBeTruthy();
  });
});
