import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  filterProspectionDateTargets,
  hasAnyProspectionDates,
  isProspectionDateMemberEligible,
  pipeCoContactIdsForContact,
  prospectionDatesOverridesForMember,
  shouldApplyProspectionDateOverride,
} from "./foyer-prospection-dates-sync";

const member = (partial: Partial<Contact> & Pick<Contact, "id">): Contact =>
  ({
    nom: "DUPONT",
    prenom: "Jean",
    categorie: "CLIENT",
    statut_suivi: "ACTIF",
    ...partial,
  }) as Contact;

describe("foyer-prospection-dates-sync", () => {
  it("hasAnyProspectionDates détecte R1 ou dernier contact", () => {
    expect(hasAnyProspectionDates({})).toBe(false);
    expect(hasAnyProspectionDates({ date_r1: "2026-01-15" })).toBe(true);
  });

  it("pipeCoContactIdsForContact trouve le co-contact Affaire", () => {
    expect(
      pipeCoContactIdsForContact(10, [
        {
          pipe_type: "AFFAIRE",
          contact_id: 10,
          secondary_contact_id: 20,
        },
        {
          pipe_type: "ACTE_GESTION",
          contact_id: 10,
          secondary_contact_id: 99,
        },
        {
          pipe_type: "AFFAIRE",
          contact_id: 30,
          secondary_contact_id: 10,
        },
      ])
    ).toEqual([20, 30]);
  });

  it("filterProspectionDateTargets inclut co-déclarant AUCUN", () => {
    const members = [
      member({ id: 1 }),
      member({ id: 2, categorie: "AUCUN", role_foyer: "DECLARANT_2", prenom: "Marie" }),
      member({ id: 3, categorie: "AUCUN", role_foyer: "ENFANT", prenom: "Luc" }),
    ];
    expect(filterProspectionDateTargets(members, 1).map((m) => m.id)).toEqual([2]);
  });

  it("prospectionDatesOverridesForMember promeut co-déclarant si R1 renseigné", () => {
    expect(
      prospectionDatesOverridesForMember(
        {
          categorie: "AUCUN",
          role_foyer: "DECLARANT_2",
          filleul_categorie: undefined,
          date_r1: undefined,
          date_dernier_contact: undefined,
        },
        { date_r1: "2026-03-01", date_dernier_contact: "2026-03-10" }
      )
    ).toEqual({
      date_r1: "2026-03-01",
      date_dernier_contact: "2026-03-10",
      categorie: "PROSPECT_CLIENT",
    });
  });

  it("shouldApplyProspectionDateOverride refuse une date plus ancienne", () => {
    expect(shouldApplyProspectionDateOverride("2026-04-01", "2026-03-01")).toBe(false);
    expect(shouldApplyProspectionDateOverride("2026-03-01", "2026-04-01")).toBe(true);
  });

  it("prospectionDatesOverridesForMember ne remplace pas une date plus récente", () => {
    expect(
      prospectionDatesOverridesForMember(
        {
          categorie: "CLIENT",
          role_foyer: "DECLARANT_2",
          filleul_categorie: undefined,
          date_r1: Math.floor(new Date("2026-04-15").getTime() / 1000),
          date_dernier_contact: Math.floor(new Date("2026-04-20").getTime() / 1000),
        },
        { date_r1: "2026-03-01", date_dernier_contact: "2026-03-10" }
      )
    ).toBeNull();
  });

  it("prospectionDatesOverridesForMember promeut co-déclarant si seul dernier contact", () => {
    expect(
      prospectionDatesOverridesForMember(
        {
          categorie: "AUCUN",
          role_foyer: "DECLARANT_2",
          filleul_categorie: undefined,
          date_r1: undefined,
          date_dernier_contact: undefined,
        },
        { date_dernier_contact: "2026-03-10" }
      )
    ).toEqual({
      date_dernier_contact: "2026-03-10",
      categorie: "PROSPECT_CLIENT",
    });
  });

  it("isProspectionDateMemberEligible accepte un client", () => {
    expect(
      isProspectionDateMemberEligible({
        categorie: "CLIENT",
        role_foyer: "DECLARANT_1",
        filleul_categorie: undefined,
      })
    ).toBe(true);
  });
});
