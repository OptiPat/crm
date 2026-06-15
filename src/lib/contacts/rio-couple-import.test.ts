import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  pickPreferredContactForCouple,
  resolveCoupleMemberInContacts,
  toPerson1Extract,
  toPerson2Extract,
} from "./rio-couple-import";
import type { ExtractedData } from "@/lib/pdf";

const baseContact = (overrides: Partial<Contact> & Pick<Contact, "id" | "nom" | "prenom">): Contact =>
  ({
    categorie: "CLIENT",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }) as Contact;

const coupleData: ExtractedData = {
  isCouple: true,
  nom: "DEBBAGHI",
  prenom: "Mehdi",
  email: "sci.meta@yahoo.com",
  conjoint: {
    nom: "DEBBAGHI",
    prenom: "Aleksandra",
    email: "contact.szymanska@gmail.com",
  },
};

describe("rio-couple-import", () => {
  const person1 = toPerson1Extract(coupleData);
  const person2 = toPerson2Extract(coupleData)!;

  it("résout par email sans créer de doublon", () => {
    const mehdi = baseContact({
      id: 1,
      nom: "DEBBAGHI",
      prenom: "Mehdi",
      email: "sci.meta@yahoo.com",
    });
    const found = resolveCoupleMemberInContacts(person1, [mehdi]);
    expect(found?.id).toBe(1);
  });

  it("résout le conjoint via le foyer du premier membre", () => {
    const mehdi = baseContact({
      id: 1,
      nom: "DEBBAGHI",
      prenom: "Mehdi",
      foyer_id: 10,
    });
    const aleks = baseContact({
      id: 2,
      nom: "DEBBAGHI",
      prenom: "Aleksandra",
      foyer_id: 10,
    });
    const found = resolveCoupleMemberInContacts(person2, [mehdi, aleks], {
      spouseContact: mehdi,
    });
    expect(found?.id).toBe(2);
  });

  it("associe la fiche ouverte au bon membre du couple", () => {
    const aleks = baseContact({
      id: 2,
      nom: "DEBBAGHI",
      prenom: "Aleksandra",
      email: "contact.szymanska@gmail.com",
    });
    const picked = pickPreferredContactForCouple(aleks, person1, person2);
    expect(picked.person2Preferred?.id).toBe(2);
    expect(picked.person1Preferred).toBeUndefined();
  });

  it("ne matche pas un homonyme sans email ni foyer", () => {
    const other = baseContact({ id: 9, nom: "AUTRE", prenom: "Client" });
    expect(resolveCoupleMemberInContacts(person1, [other])).toBeNull();
  });

  it("n'assigne pas la fiche ouverte au mauvais membre", () => {
    const aleks = baseContact({
      id: 2,
      nom: "DEBBAGHI",
      prenom: "Aleksandra",
      email: "contact.szymanska@gmail.com",
    });
    expect(
      resolveCoupleMemberInContacts(person1, [aleks], { preferredContact: aleks })
    ).toBeNull();
  });
});
