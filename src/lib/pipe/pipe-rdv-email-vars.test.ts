import { describe, expect, it } from "vitest";
import {
  buildPipeRdvEmailExtraVariables,
  coContactFieldsForRecipient,
  coContactLabelForRecipient,
  formatPipeRdvEmailTime,
  formatPipeRdvParticipantNomPrenom,
  pipeRdvRegistreForContact,
  resolveRdvEmailVisioAndLieu,
} from "@/lib/pipe/pipe-rdv-email-vars";

describe("pipe-rdv-email-vars", () => {
  it("formatPipeRdvEmailTime en notation française (20h30, 9h30)", () => {
    // dimanche 12 juil. 2026 20:30 Europe/Paris (CEST)
    expect(formatPipeRdvEmailTime(1_783_881_000)).toBe("20h30");
    // lundi 13 juil. 2026 09:30 Europe/Paris
    expect(formatPipeRdvEmailTime(1_783_927_800)).toBe("9h30");
  });

  it("formate nom prénom du co-contact pour le principal", () => {
    const fields = coContactFieldsForRecipient(
      {
        contact_id: 1,
        contact_prenom: "Jean",
        contact_nom: "DUPONT",
        secondary_contact_id: 2,
        secondary_contact_prenom: "Marie",
        secondary_contact_nom: "MARTIN",
      },
      1
    );
    expect(fields.co_contact).toBe("MARTIN Marie");
    expect(fields.co_contact_prenom).toBe("Marie");
    expect(fields.co_contact_nom).toBe("MARTIN");
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
    expect(vars.co_contact_prenom).toBe("");
    expect(vars.co_contact_nom).toBe("");
  });

  it("injecte co_contact_prenom et co_contact_nom pour un couple", () => {
    const vars = buildPipeRdvEmailExtraVariables({
      pipe: {
        contact_id: 1,
        contact_prenom: "Jean",
        contact_nom: "DUPONT",
        secondary_contact_id: 2,
        secondary_contact_prenom: "Marie",
        secondary_contact_nom: "MARTIN",
      },
      recipientContactId: 1,
      startAtUnix: 1_735_689_600,
      endAtUnix: 1_735_693_200,
    });
    expect(vars.co_contact_prenom).toBe("Marie");
    expect(vars.co_contact_nom).toBe("MARTIN");
  });

  it("resolveRdvEmailVisioAndLieu sans Google : adresse physique", () => {
    const resolved = resolveRdvEmailVisioAndLieu({
      visio: { mode: "none" },
      physicalAddress: "8 place du Marché, 75001 Paris",
    });
    expect(resolved.lien_visio).toBe("");
    expect(resolved.lieu_rdv).toBe("8 place du Marché, 75001 Paris");
  });

  it("co_contact_et_prenom vide sans co-participant", () => {
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
    expect(vars.co_contact_et_prenom).toBe("");
  });

  it("co_contact_et_prenom pour un couple", () => {
    const vars = buildPipeRdvEmailExtraVariables({
      pipe: {
        contact_id: 1,
        contact_prenom: "Jean",
        contact_nom: "DUPONT",
        secondary_contact_id: 2,
        secondary_contact_prenom: "Marie",
        secondary_contact_nom: "MARTIN",
      },
      recipientContactId: 1,
      startAtUnix: 1_735_689_600,
      endAtUnix: 1_735_693_200,
    });
    expect(vars.co_contact_et_prenom).toBe(" et Marie");
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
