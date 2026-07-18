import { describe, expect, it } from "vitest";
import {
  formatR3ImmoRevenueProfileLabel,
  resolveR3ImmoRevenueProfile,
} from "@/lib/pipe/r3-immo-r1-profile-sync";
import {
  buildR3ImmoChecklistContext,
  getActiveR3ImmoChecklistItems,
} from "@/lib/pipe/r3-immo-document-checklist";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { PipeR3ImmoDocumentChecklist } from "@/lib/api/tauri-pipe-r3-immo-checklist";

function baseContact(): Contact {
  return {
    id: 1,
    nom: "DUPONT",
    prenom: "Jean",
    categorie: "PROSPECT_CLIENT",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
  };
}

function baseImmoChecklist(): PipeR3ImmoDocumentChecklist {
  return {
    pipe_id: 1,
    profile_salarie: false,
    profile_chef_entreprise: false,
    profile_revenus_configured: false,
    emprunteur_personne_morale: false,
    revenus_fonciers_hors_micro: false,
    revenus_via_sci: false,
    projet_vefa: false,
    projet_ancien: false,
    projet_scpi: false,
    items: {},
    updated_at: 0,
  };
}

describe("r3-immo-r1-profile-sync", () => {
  it("reprend le profil salarié du R1 si R3 immo non renseigné", () => {
    const resolved = resolveR3ImmoRevenueProfile(baseImmoChecklist(), {
      profile_salarie: true,
      profile_chef_entreprise: false,
    });
    expect(resolved.source).toBe("r1");
    expect(resolved.profile_salarie).toBe(true);
    expect(formatR3ImmoRevenueProfileLabel(resolved)).toBe("Salarié");
  });

  it("privilégie l'override R3 immo sur le R1", () => {
    const resolved = resolveR3ImmoRevenueProfile(
      {
        ...baseImmoChecklist(),
        profile_chef_entreprise: true,
        profile_revenus_configured: true,
      },
      { profile_salarie: true, profile_chef_entreprise: false }
    );
    expect(resolved.source).toBe("r3_immo");
    expect(resolved.profile_chef_entreprise).toBe(true);
  });

  it("permet de désactiver un profil repris du R1 via override explicite", () => {
    const resolved = resolveR3ImmoRevenueProfile(
      {
        ...baseImmoChecklist(),
        profile_salarie: false,
        profile_chef_entreprise: false,
        profile_revenus_configured: true,
      },
      { profile_salarie: true, profile_chef_entreprise: false }
    );
    expect(resolved.source).toBe("r3_immo");
    expect(resolved.profile_salarie).toBe(false);
    expect(formatR3ImmoRevenueProfileLabel(resolved)).toBeNull();
  });

  it("affiche les deux profils revenus si cochés", () => {
    expect(
      formatR3ImmoRevenueProfileLabel({
        profile_salarie: true,
        profile_chef_entreprise: true,
      })
    ).toBe("Salarié · Chef d'entreprise");
  });

  it("active les pièces salarié via le profil R1", () => {
    const ctx = buildR3ImmoChecklistContext({
      contact: baseContact(),
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [],
      checklist: baseImmoChecklist(),
      r1Checklist: { profile_salarie: true, profile_chef_entreprise: false },
    });
    expect(ctx.revenueProfileSource).toBe("r1");
    const ids = getActiveR3ImmoChecklistItems(ctx).map((i) => i.id);
    expect(ids).toContain("bulletins_paie");
  });
});
