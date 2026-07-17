import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIPE_CHECKLIST_TEMPLATES,
  getActivePipeChecklistTemplateItems,
  templateItemActiveForProfile,
} from "./pipe-checklist-template";

describe("pipe-checklist-template", () => {
  it("affiche les lignes de base sans profil", () => {
    const items = getActivePipeChecklistTemplateItems("R1", DEFAULT_PIPE_CHECKLIST_TEMPLATES, {
      salarie: false,
      chef_entreprise: false,
      retraite: false,
    });
    expect(items.map((item) => item.id)).toEqual([
      "avis_imposition",
      "releves_situation",
      "amortissement_prets",
    ]);
  });

  it("ajoute salarié et retraite selon le profil", () => {
    const items = getActivePipeChecklistTemplateItems("R1", DEFAULT_PIPE_CHECKLIST_TEMPLATES, {
      salarie: true,
      chef_entreprise: false,
      retraite: true,
    });
    expect(items.map((item) => item.id)).toEqual([
      "avis_imposition",
      "releves_situation",
      "amortissement_prets",
      "bulletin_salaire",
      "bulletin_salaire_decembre",
      "estimation_retraite",
    ]);
  });

  it("distingue base et profils conditionnels", () => {
    expect(
      templateItemActiveForProfile(
        { id: "x", label: "X", profiles: ["salarie"] },
        { salarie: false, chef_entreprise: false, retraite: false }
      )
    ).toBe(false);
    expect(
      templateItemActiveForProfile(
        { id: "y", label: "Y", profiles: ["base"] },
        { salarie: false, chef_entreprise: false, retraite: false }
      )
    ).toBe(true);
  });

  it("définit 6 pièces R3 placements par défaut", () => {
    const items = getActivePipeChecklistTemplateItems("R3", DEFAULT_PIPE_CHECKLIST_TEMPLATES, {
      salarie: false,
      chef_entreprise: false,
      retraite: false,
    });
    expect(items.map((item) => item.id)).toEqual([
      "der",
      "rio",
      "qpi_a_signer",
      "cni",
      "justificatif_domicile",
      "rib",
    ]);
    expect(items.slice(0, 3).map((item) => item.label)).toEqual([
      "DER (signé)",
      "RIO (signé)",
      "QPI (signé)",
    ]);
  });
});
