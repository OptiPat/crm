import { describe, expect, it } from "vitest";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  buildMetaParPartenaireId,
  partenaireEncoursContribution,
} from "@/lib/partenaires/partenaires-meta";

function inv(
  partenaireId: number,
  montantInitial: number,
  encoursActuel?: number
): Investissement {
  return {
    id: 1,
    partenaire_id: partenaireId,
    type_produit: "ASSURANCE_VIE",
    montant_initial: montantInitial,
    encours_actuel: encoursActuel,
    origine: "MON_CONSEIL",
  } as Investissement;
}

describe("partenaires-meta", () => {
  it("utilise encours_actuel plutôt que montant souscrit", () => {
    const meta = buildMetaParPartenaireId([inv(1, 1_593_978_00, 1_200_000_00)]);
    expect(meta[1].encoursAvecMoi).toBe(1_200_000_00);
    expect(partenaireEncoursContribution(inv(1, 1_593_978_00, 1_200_000_00))).toBe(
      1_200_000_00
    );
  });

  it("ignore les placements à côté", () => {
    const meta = buildMetaParPartenaireId([
      { ...inv(1, 100_000_00), origine: "EXISTANT_CLIENT" } as Investissement,
    ]);
    expect(meta[1].encoursAvecMoi).toBe(0);
  });
});
