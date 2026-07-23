import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { buildOrganisationTree } from "@/lib/organisation/organisation-tree";
import {
  collectOrganisationMemberRoster,
  filterOrganisationMemberRoster,
  findOrganisationMemberRosterEntry,
  organisationMemberLevelLabel,
} from "@/lib/organisation/organisation-member-roster";

const contacts = [
  {
    id: 1,
    nom: "MOI",
    prenom: "CGP",
    categorie: "AUCUN",
    filleul_categorie: "FILLEUL",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
  },
  {
    id: 2,
    nom: "ACTIF",
    prenom: "Paul",
    categorie: "AUCUN",
    filleul_categorie: "FILLEUL",
    parrain_id: 1,
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
  },
  {
    id: 3,
    nom: "PARTI",
    prenom: "Jean",
    categorie: "AUCUN",
    filleul_categorie: "FILLEUL_DESINSCRIT",
    parrain_id: 1,
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
  },
] as Contact[];

describe("organisation-member-roster", () => {
  const tree = buildOrganisationTree(contacts, {
    prenom: "CGP",
    nom: "MOI",
  } as CgpConfig);

  it("collecte actifs, désinscrits et CGP", () => {
    const roster = collectOrganisationMemberRoster(tree);
    expect(roster).toHaveLength(3);
    expect(findOrganisationMemberRosterEntry(roster, 3)?.status).toBe("desinscrit");
    expect(findOrganisationMemberRosterEntry(roster, 2)?.status).toBe("actif");
  });

  it("filtre par recherche et statut désinscrit", () => {
    const roster = collectOrganisationMemberRoster(tree);
    expect(filterOrganisationMemberRoster(roster, "parti", "all")).toHaveLength(1);
    expect(filterOrganisationMemberRoster(roster, "", "desinscrit")).toHaveLength(1);
    expect(filterOrganisationMemberRoster(roster, "", "actif").every((e) => e.status !== "desinscrit")).toBe(
      true
    );
  });

  it("affiche niveau 1, 2… (pas génération)", () => {
    expect(organisationMemberLevelLabel(1)).toBe("Niveau 1");
    expect(organisationMemberLevelLabel(3)).toBe("Niveau 3");
    expect(organisationMemberLevelLabel(0)).toBeNull();
  });
});
