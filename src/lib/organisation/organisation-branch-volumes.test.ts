import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  buildOrganisationVolumeRows,
  computeBranchVolume,
  computeSelfNetworkVolumeWithinDepth,
  contactOwnVolume,
  getSelfNetworkVolumeStatus,
  getVolumeBranchColorStatus,
  getVolumeBranchDisplayAmount,
  parseFilleulVolumeField,
} from "./organisation-branch-volumes";
import { buildOrganisationTree } from "./organisation-tree";

function c(
  id: number,
  opts: { parrainId?: number; volume?: number; prenom?: string } = {}
): Contact {
  return {
    id,
    nom: "NOM",
    prenom: opts.prenom ?? `P${id}`,
    categorie: "AUCUN",
    statut_suivi: "ACTIF",
    filleul_categorie: "FILLEUL",
    parrain_id: opts.parrainId,
    filleul_volume: opts.volume,
    created_at: 0,
    updated_at: 0,
  };
}

describe("organisation-branch-volumes", () => {
  it("contactOwnVolume et parseFilleulVolumeField", () => {
    expect(contactOwnVolume(c(1, { volume: 1000 }))).toBe(1000);
    expect(contactOwnVolume(c(1))).toBe(0);
    expect(parseFilleulVolumeField("")).toBe(0);
    expect(parseFilleulVolumeField("1 500,50")).toBe(1500.5);
  });

  it("computeBranchVolume inclut propre volume et descendance", () => {
    const contacts = [
      c(1, { volume: 10 }),
      c(2, { parrainId: 1, volume: 100, prenom: "Melanie" }),
      c(3, { parrainId: 2, volume: 20 }),
      c(4, { parrainId: 2, volume: 30 }),
      c(5, { parrainId: 3, volume: 5 }),
    ];
    const byParrain = new Map<number, Contact[]>([
      [1, [contacts[1]]],
      [2, [contacts[2], contacts[3]]],
      [3, [contacts[4]]],
    ]);
    const ownById = new Map(contacts.map((x) => [x.id, contactOwnVolume(x)]));

    expect(computeBranchVolume(2, ownById, byParrain)).toBe(100 + 20 + 30 + 5);
    expect(computeBranchVolume(1, ownById, byParrain)).toBe(10 + 100 + 20 + 30 + 5);
  });

  it("buildOrganisationVolumeRows calcule le volume branche", () => {
    const contacts = [
      {
        ...c(2, { parrainId: 1, volume: 1, prenom: "Moi" }),
        nom: "CGP",
        filleul_categorie: "FILLEUL",
      },
      c(4, { parrainId: 2, volume: 100, prenom: "Melanie" }),
      c(7, { parrainId: 4, volume: 40, prenom: "Alexandre" }),
    ];
    const tree = buildOrganisationTree(contacts, { nom: "CGP", prenom: "Moi" });
    const rows = buildOrganisationVolumeRows(tree, contacts);
    const melanie = rows.find((r) => r.label.includes("Melanie"));
    expect(melanie?.branchVolume).toBe(140);
  });

  it("getVolumeBranchColorStatus — prime de dev sur badge ; filleul direct 500 k€ sur vol. branche", () => {
    const rows = buildOrganisationVolumeRows(
      buildOrganisationTree(
        [
          {
            ...c(2, { parrainId: 1, volume: 3_000_000, prenom: "Moi" }),
            nom: "CGP",
          },
          c(3, { parrainId: 2, volume: 3_000_000, prenom: "G1" }),
        ],
        { nom: "CGP", prenom: "Moi" }
      ),
      [
        {
          ...c(2, { parrainId: 1, volume: 3_000_000, prenom: "Moi" }),
          nom: "CGP",
        },
        c(3, { parrainId: 2, volume: 600_000, prenom: "G1" }),
      ]
    );
    const self = rows.find((r) => r.generation === 0)!;
    const g1 = rows.find((r) => r.generation === 1)!;
    expect(getVolumeBranchDisplayAmount(self)).toBe(self.branchVolume);
    expect(getVolumeBranchDisplayAmount(self)).not.toBe(self.networkVolumeExclSelf);
    expect(getVolumeBranchColorStatus(self)).toBe("not_applicable");
    expect(getVolumeBranchColorStatus(g1)).toBe("target_met");

    const g1Below = buildOrganisationVolumeRows(
      buildOrganisationTree(
        [
          { ...c(2, { parrainId: 1, prenom: "Moi" }), nom: "CGP" },
          c(3, { parrainId: 2, volume: 100_000, prenom: "G1" }),
        ],
        { nom: "CGP", prenom: "Moi" }
      ),
      [
        { ...c(2, { parrainId: 1, prenom: "Moi" }), nom: "CGP" },
        c(3, { parrainId: 2, volume: 100_000, prenom: "G1" }),
      ]
    ).find((r) => r.generation === 1)!;
    expect(getVolumeBranchColorStatus(g1Below)).toBe("below_target");
  });

  it("computeSelfNetworkVolumeWithinDepth — gen 1–8 hors volume CGP", () => {
    const contacts = [
      {
        ...c(2, { parrainId: 1, volume: 1_000_000, prenom: "Moi" }),
        nom: "CGP",
        filleul_categorie: "FILLEUL",
      },
      c(3, { parrainId: 2, volume: 500_000, prenom: "G1" }),
      c(4, { parrainId: 3, volume: 200_000, prenom: "G2" }),
    ];
    const tree = buildOrganisationTree(contacts, { nom: "CGP", prenom: "Moi" });
    expect(computeSelfNetworkVolumeWithinDepth(tree)).toBe(700_000);
    expect(getSelfNetworkVolumeStatus(700_000)).toBe("below_target");
    expect(getSelfNetworkVolumeStatus(3_000_000)).toBe("target_met");
  });
});
