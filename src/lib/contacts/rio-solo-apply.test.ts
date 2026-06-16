import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";

vi.mock("@/lib/api/tauri-contacts", () => ({
  findContactByEmail: vi.fn(),
  findContactByName: vi.fn(),
  getContactById: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
}));

vi.mock("@/lib/api/tauri-investissements", () => ({
  getInvestissementsByContact: vi.fn(),
  getInvestissementsByFoyer: vi.fn(),
}));

vi.mock("@/lib/contacts/rio-enfants-apply", () => ({
  syncRioEnfants: vi.fn(),
}));

vi.mock("@/lib/contacts/rio-foyer-ensure", () => ({
  ensureDeclarantFoyer: vi.fn(),
}));

import {
  createContact,
  findContactByEmail,
  findContactByName,
  getContactById,
  updateContact,
} from "@/lib/api/tauri-contacts";
import { getInvestissementsByContact } from "@/lib/api/tauri-investissements";
import { ensureDeclarantFoyer } from "@/lib/contacts/rio-foyer-ensure";
import { applySoloRioImport } from "./rio-solo-apply";

const baseContact: Contact = {
  id: 42,
  nom: "PLAZA",
  prenom: "Nicolas",
  categorie: "SUSPECT_CLIENT",
  statut_suivi: "ACTIF",
  created_at: 0,
  updated_at: 0,
};

describe("applySoloRioImport", () => {
  beforeEach(() => {
    vi.mocked(findContactByEmail).mockReset();
    vi.mocked(findContactByName).mockReset();
    vi.mocked(getContactById).mockReset();
    vi.mocked(createContact).mockReset();
    vi.mocked(updateContact).mockReset();
    vi.mocked(getInvestissementsByContact).mockReset();
    vi.mocked(ensureDeclarantFoyer).mockReset();
    vi.mocked(getInvestissementsByContact).mockResolvedValue([]);
    vi.mocked(ensureDeclarantFoyer).mockResolvedValue({
      contact: baseContact,
      foyerId: 1,
    });
    vi.mocked(updateContact).mockImplementation(async (_id, payload) => ({
      ...baseContact,
      nom: payload.nom ?? baseContact.nom,
      prenom: payload.prenom ?? baseContact.prenom,
      categorie: payload.categorie ?? baseContact.categorie,
      statut_suivi: payload.statut_suivi ?? baseContact.statut_suivi,
    }));
  });

  it("diffère revenus/charges quand deferFinancialFields", async () => {
    vi.mocked(getContactById).mockResolvedValue(baseContact);

    const result = await applySoloRioImport(
      {
        typeDocument: "RIO",
        nom: "PLAZA",
        prenom: "Nicolas",
        revenusTotal: 80_000,
        chargesEmprunts: 2_400,
        objectifsPrincipaux: ["Retraite"],
        assuranceVie: 50_000,
      },
      {
        effectiveContactId: 42,
        confirmIdentityMerge: () => true,
        onMissingIdentity: vi.fn(),
      },
      { deferFinancialFields: true }
    );

    expect(result?.finalContactId).toBe(42);
    const payload = vi.mocked(updateContact).mock.calls[0]?.[1];
    expect(payload?.revenus_annuels).toBeUndefined();
    expect(payload?.charges_emprunts).toBeUndefined();
    expect(payload?.objectifs_patrimoniaux).toBeUndefined();
  });

  it("applique les champs financiers immédiatement sans defer", async () => {
    vi.mocked(findContactByName).mockResolvedValue(null);
    vi.mocked(createContact).mockImplementation(async (payload) => ({
      id: 99,
      nom: payload.nom,
      prenom: payload.prenom,
      categorie: payload.categorie || "SUSPECT_CLIENT",
      statut_suivi: "ACTIF",
      revenus_annuels: payload.revenus_annuels,
      charges_emprunts: payload.charges_emprunts,
      created_at: 0,
      updated_at: 0,
    }));
    vi.mocked(getContactById).mockResolvedValue({
      ...baseContact,
      id: 99,
      revenus_annuels: 80_000,
      charges_emprunts: 2_400,
    });

    await applySoloRioImport(
      {
        typeDocument: "RIO",
        nom: "DUPONT",
        prenom: "Marie",
        revenusTotal: 80_000,
        chargesEmprunts: 2_400,
      },
      {
        confirmIdentityMerge: () => true,
        onMissingIdentity: vi.fn(),
      }
    );

    const payload = vi.mocked(createContact).mock.calls[0]?.[0];
    expect(payload?.revenus_annuels).toBe(80_000);
    expect(payload?.charges_emprunts).toBe(2_400);
  });
});
