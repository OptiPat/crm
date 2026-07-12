import { describe, expect, it } from "vitest";
import {
  buildPipeRdvEmailExtraVariables,
  coContactLabelForRecipient,
  formatPipeRdvParticipantNomPrenom,
  pipeRdvRegistreForContact,
} from "@/lib/pipe/pipe-rdv-email-vars";

describe("pipe-rdv-email-vars", () => {
  it("formate nom prénom du co-contact pour le principal", () => {
    expect(
      coContactLabelForRecipient(
        {
          contact_id: 1,
          contact_prenom: "Jean",
          contact_nom: "DUPONT",
          secondary_contact_id: 2,
          secondary_contact_prenom: "Marie",
          secondary_contact_nom: "MARTIN",
        },
        1
      )
    ).toBe("MARTIN Marie");
  });

  it("injecte lien Meet Google dans les variables", () => {
    const vars = buildPipeRdvEmailExtraVariables({
      pipe: {
        contact_id: 1,
        contact_prenom: "Jean",
        contact_nom: "DUPONT",
        secondary_contact_id: null,
        secondary_contact_prenom: null,
        secondary_contact_nom: null,
      },
      recipientContactId: 1,
      startAtUnix: 1_735_689_600,
      endAtUnix: 1_735_693_200,
      visioLink: "https://meet.google.com/abc-defg-hij",
    });
    expect(vars.lien_visio).toBe("https://meet.google.com/abc-defg-hij");
    expect(vars.date_rdv).toBeTruthy();
    expect(vars.heure_rdv).toBeTruthy();
  });

  it("formatPipeRdvParticipantNomPrenom", () => {
    expect(formatPipeRdvParticipantNomPrenom("Jean", "DUPONT")).toBe("DUPONT Jean");
  });

  it("co_contact vide sans co-participant", () => {
    expect(
      coContactLabelForRecipient(
        {
          contact_id: 1,
          contact_prenom: "Jean",
          contact_nom: "DUPONT",
          secondary_contact_id: null,
          secondary_contact_prenom: null,
          secondary_contact_nom: null,
        },
        1
      )
    ).toBe("");
    const vars = buildPipeRdvEmailExtraVariables({
      pipe: {
        contact_id: 1,
        contact_prenom: "Jean",
        contact_nom: "DUPONT",
        secondary_contact_id: null,
        secondary_contact_prenom: null,
        secondary_contact_nom: null,
      },
      recipientContactId: 1,
      startAtUnix: 1_735_689_600,
      endAtUnix: 1_735_693_200,
    });
    expect(vars.co_contact).toBe("");
  });

  it("pipeRdvRegistreForContact force VOUS si co-participant", () => {
    expect(
      pipeRdvRegistreForContact({ registre: "TU" }, { secondary_contact_id: 2 })
    ).toBe("VOUS");
    expect(
      pipeRdvRegistreForContact({ registre: "TU" }, { secondary_contact_id: null })
    ).toBe("TU");
  });
});
