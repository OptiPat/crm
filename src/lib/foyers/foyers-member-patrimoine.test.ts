import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { buildFoyerMembersWithInvestments } from "@/lib/foyers/foyers-member-patrimoine";

describe("buildFoyerMembersWithInvestments", () => {
  it("attache investissements perso et commun", () => {
    const contact: Contact = {
      id: 1,
      prenom: "Jean",
      nom: "Dupont",
      foyer_id: 10,
      role_foyer: "DECLARANT_1",
    } as Contact;

    const perso: Investissement = {
      id: 100,
      contact_id: 1,
      type_produit: "AV",
      montant_initial: 50000,
      origine: "MON_CONSEIL",
    } as Investissement;

    const commun: Investissement = {
      id: 101,
      foyer_id: 10,
      type_produit: "SCPI",
      montant_initial: 30000,
      origine: "MON_CONSEIL",
    } as Investissement;

    const result = buildFoyerMembersWithInvestments(
      [contact],
      { 1: [perso] },
      { 10: [commun] }
    );

    expect(result).toHaveLength(1);
    expect(result[0].investissements).toHaveLength(2);
    expect(result[0].investissements.some((i) => i.isCommun)).toBe(true);
    expect(result[0].avecMoiTotal).toBe(80000);
  });
});
