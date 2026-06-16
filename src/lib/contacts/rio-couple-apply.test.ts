import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";

vi.mock("@/lib/api/tauri-contacts", () => ({
  findContactByEmail: vi.fn(),
  findContactByName: vi.fn(),
  getContactById: vi.fn(),
  getContactsByFoyer: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
}));

vi.mock("@/lib/api/tauri-foyers", () => ({
  createFoyer: vi.fn(),
}));

vi.mock("@/lib/api/tauri-investissements", () => ({
  getInvestissementsByContact: vi.fn(),
  getInvestissementsByFoyer: vi.fn(),
}));

vi.mock("@/lib/contacts/rio-enfants-apply", () => ({
  syncRioEnfants: vi.fn(),
}));

vi.mock("@/lib/foyers/foyer-utils", () => ({
  buildFoyerNomFromMembers: vi.fn(() => "Foyer test"),
  linkContactToFoyer: vi.fn(),
}));

import {
  createContact,
  findContactByName,
  getContactById,
  getContactsByFoyer,
} from "@/lib/api/tauri-contacts";
import { createFoyer } from "@/lib/api/tauri-foyers";
import { getInvestissementsByContact } from "@/lib/api/tauri-investissements";
import { linkContactToFoyer } from "@/lib/foyers/foyer-utils";
import { applyCoupleRioImport } from "./rio-couple-apply";

function makeContact(id: number, nom: string, prenom: string): Contact {
  return {
    id,
    nom,
    prenom,
    categorie: "SUSPECT_CLIENT",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
  };
}

describe("applyCoupleRioImport", () => {
  beforeEach(() => {
    vi.mocked(findContactByName).mockReset();
    vi.mocked(getContactById).mockReset();
    vi.mocked(getContactsByFoyer).mockReset();
    vi.mocked(createContact).mockReset();
    vi.mocked(createFoyer).mockReset();
    vi.mocked(getInvestissementsByContact).mockReset();
    vi.mocked(linkContactToFoyer).mockReset();
    vi.mocked(getInvestissementsByContact).mockResolvedValue([]);
    vi.mocked(getContactsByFoyer).mockResolvedValue([]);
    vi.mocked(createFoyer).mockResolvedValue({
      id: 5,
      nom: "Foyer test",
      type_foyer: "COUPLE",
      created_at: 0,
      updated_at: 0,
    });
    vi.mocked(linkContactToFoyer).mockImplementation(async (contact, foyerId, role) => ({
      ...contact,
      foyer_id: foyerId,
      role_foyer: role,
    }));
  });

  it("diffère les champs financiers couple quand deferFinancialFields", async () => {
    vi.mocked(findContactByName).mockResolvedValue(null);
    vi.mocked(createContact)
      .mockResolvedValueOnce(makeContact(1, "GENTIL", "Gwendal"))
      .mockResolvedValueOnce(makeContact(2, "NOYEZ", "Laurene"));
    vi.mocked(getContactById)
      .mockResolvedValueOnce(makeContact(1, "GENTIL", "Gwendal"))
      .mockResolvedValueOnce(makeContact(2, "NOYEZ", "Laurene"));

    const result = await applyCoupleRioImport(
      {
        typeDocument: "RIO",
        isCouple: true,
        nom: "GENTIL",
        prenom: "Gwendal",
        revenusTotal: 50_000,
        chargesEmprunts: 100,
        objectifsPrincipaux: ["Retraite"],
        conjoint: {
          nom: "NOYEZ",
          prenom: "Laurene",
          revenusTotal: 40_000,
          chargesEmprunts: 200,
        },
      },
      {
        importContacts: [],
        confirmIdentityMerge: () => true,
        onMissingIdentity: vi.fn(),
      },
      { deferFinancialFields: true }
    );

    expect(result?.memberContactIds).toEqual([1, 2]);
    for (const call of vi.mocked(createContact).mock.calls) {
      expect(call[0].revenus_annuels).toBeUndefined();
      expect(call[0].objectifs_patrimoniaux).toBeUndefined();
    }
  });
});
