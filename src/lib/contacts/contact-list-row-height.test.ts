import { describe, expect, it } from "vitest";
import { estimateContactListRowHeight } from "./contact-list-row-height";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";

const baseContact: Contact = {
  id: 1,
  prenom: "Jean",
  nom: "Dupont",
  categorie: "CLIENT",
  email: "jean@example.com",
  telephone: "0612345678",
} as Contact;

describe("estimateContactListRowHeight", () => {
  it("augmente avec les étiquettes affichées", () => {
    const sans: Record<number, ContactEtiquetteDetails[]> = {};
    const avec: Record<number, ContactEtiquetteDetails[]> = {
      1: [
        { etiquette_id: 1, etiquette_nom: "Suivi > 1 an" },
        { etiquette_id: 2, etiquette_nom: "Exceltis — Février 2025" },
      ] as ContactEtiquetteDetails[],
    };
    expect(estimateContactListRowHeight(baseContact, avec)).toBeGreaterThan(
      estimateContactListRowHeight(baseContact, sans)
    );
  });
});
