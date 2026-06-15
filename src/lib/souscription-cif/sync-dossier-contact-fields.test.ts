import { describe, expect, it } from "vitest";
import {
  isContactSelectionReady,
  lieuNaissanceFromContact,
} from "@/lib/souscription-cif/sync-dossier-contact-fields";
import type { Contact } from "@/lib/api/tauri-contacts";

const contact: Contact = {
  id: 7,
  categorie: "CLIENT",
  nom: "DUPONT",
  prenom: "Marie",
  statut_suivi: "ACTIF",
  lieu_naissance: "Lyon",
  created_at: 0,
  updated_at: 0,
};

describe("isContactSelectionReady", () => {
  it("accepte id et contact alignés", () => {
    expect(isContactSelectionReady(7, contact)).toBe(true);
  });

  it("refuse contact stale (id sélecteur ≠ contact)", () => {
    expect(isContactSelectionReady(8, contact)).toBe(false);
  });
});

describe("lieuNaissanceFromContact", () => {
  it("retourne le lieu trimé ou vide", () => {
    expect(lieuNaissanceFromContact(contact)).toBe("Lyon");
    expect(lieuNaissanceFromContact({ ...contact, lieu_naissance: "  " })).toBe("");
    expect(lieuNaissanceFromContact(null)).toBe("");
  });
});
