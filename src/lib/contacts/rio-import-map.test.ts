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
      situationFamiliale: "MARIÉ",
    });

    expect(contact.nom).toBe("MARTIN");
    expect(contact.prenom).toBe("Paul");
    expect(contact.civilite).toBe("M");
    expect(contact.email).toBe("paul@example.com");
    expect(contact.situation_familiale).toBe("MARIE");
    expect(contact.date_naissance).toBeTruthy();
  });
});
