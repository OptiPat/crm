import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";

vi.mock("@/lib/api/tauri-contacts", () => ({
  getContactsByFoyer: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
}));

import {
  createContact,
  getContactsByFoyer,
  updateContact,
} from "@/lib/api/tauri-contacts";
import { syncRioEnfants } from "./rio-enfants-apply";

describe("syncRioEnfants", () => {
  beforeEach(() => {
    vi.mocked(getContactsByFoyer).mockReset();
    vi.mocked(createContact).mockReset();
    vi.mocked(updateContact).mockReset();
  });

  it("ne matche pas un déclarant même homonyme", async () => {
    const parent: Contact = {
      id: 10,
      nom: "LEGRAND",
      prenom: "Paul",
      categorie: "CLIENT",
      statut_suivi: "ACTIF",
      role_foyer: "DECLARANT_1",
      foyer_id: 1,
      created_at: 0,
      updated_at: 0,
    };
    vi.mocked(getContactsByFoyer).mockResolvedValue([parent]);
    vi.mocked(createContact).mockImplementation(async (payload) => ({
      id: 11,
      nom: payload.nom,
      prenom: payload.prenom,
      categorie: payload.categorie || "SUSPECT_CLIENT",
      statut_suivi: "ACTIF",
      role_foyer: payload.role_foyer ?? undefined,
      foyer_id: payload.foyer_id ?? undefined,
      created_at: 0,
      updated_at: 0,
    }));

    const synced = await syncRioEnfants({
      foyerId: 1,
      enfants: [
        {
          prenom: "Paul",
          nom: "LEGRAND",
          dateNaissance: "25/10/1975",
        },
      ],
    });

    expect(synced).toBe(1);
    expect(createContact).toHaveBeenCalledTimes(1);
    expect(updateContact).not.toHaveBeenCalled();
  });

  it("met à jour un enfant existant sans effacer sa date si RIO sans date", async () => {
    const child: Contact = {
      id: 20,
      nom: "LEGRAND",
      prenom: "Lisa",
      categorie: "SUSPECT_CLIENT",
      statut_suivi: "ACTIF",
      role_foyer: "ENFANT",
      foyer_id: 1,
      date_naissance: 1_000_000_000,
      created_at: 0,
      updated_at: 0,
    };
    vi.mocked(getContactsByFoyer).mockResolvedValue([child]);
    vi.mocked(updateContact).mockResolvedValue(child);

    await syncRioEnfants({
      foyerId: 1,
      enfants: [{ prenom: "Lisa", nom: "LEGRAND" }],
    });

    const payload = vi.mocked(updateContact).mock.calls[0]?.[1];
    expect(payload?.date_naissance).toBeTruthy();
    expect(payload?.role_foyer).toBe("ENFANT");
  });
});
