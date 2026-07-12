import { describe, expect, it } from "vitest";
import {
  formatContactAddressForCalendar,
  validatePresentielAddress,
} from "@/lib/calendar/rdv-contact-address";
import { rdvVisioToApiPayload } from "@/lib/calendar/rdv-visio";

describe("rdv-contact-address", () => {
  it("formate une adresse pour Google Agenda", () => {
    expect(
      formatContactAddressForCalendar({
        adresse: "12 rue des Acacias",
        code_postal: "34000",
        ville: "Montpellier",
        pays: "France",
      })
    ).toBe("12 rue des Acacias, 34000 Montpellier");
  });

  it("exige adresse et ville en présentiel", () => {
    expect(
      validatePresentielAddress({
        adresse: "",
        code_postal: "34000",
        ville: "Montpellier",
        pays: "",
      })
    ).toMatch(/adresse/i);
    expect(
      validatePresentielAddress({
        adresse: "12 rue des Acacias",
        code_postal: "",
        ville: "",
        pays: "",
      })
    ).toMatch(/ville/i);
  });
});

describe("rdvVisioToApiPayload location", () => {
  it("envoie l'adresse physique en présentiel", () => {
    expect(
      rdvVisioToApiPayload({ mode: "none" }, "12 rue X, 34000 Montpellier")
    ).toEqual({
      addGoogleMeet: false,
      visioLink: null,
      eventLocation: "12 rue X, 34000 Montpellier",
    });
  });

  it("envoie le lien custom comme lieu", () => {
    expect(
      rdvVisioToApiPayload({ mode: "custom", customLink: "https://zoom.us/j/1" }, null)
    ).toEqual({
      addGoogleMeet: false,
      visioLink: "https://zoom.us/j/1",
      eventLocation: "https://zoom.us/j/1",
    });
  });
});
