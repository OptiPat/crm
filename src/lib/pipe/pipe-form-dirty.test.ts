import { describe, expect, it } from "vitest";
import {
  mergePipeFormOnReload,
  type PipeFormSnapshot,
} from "@/lib/pipe/pipe-form-dirty";

const base: PipeFormSnapshot = {
  contactId: 1,
  secondaryContactId: 0,
  pipeType: "AFFAIRE",
  parentPipeId: null,
  titre: "Dossier Martin",
  stage: "R1",
  notes: "",
};

describe("mergePipeFormOnReload", () => {
  it("prend la nouvelle étape si l'utilisateur n'y a pas touché, garde ses champs modifiés", () => {
    const current = { ...base, notes: "saisie en cours" };
    const incoming = { ...base, stage: "R2" as const, notes: "note serveur" };
    const { form, initial } = mergePipeFormOnReload(base, current, incoming);
    expect(form.stage).toBe("R2");
    expect(form.notes).toBe("saisie en cours");
    expect(initial.stage).toBe("R2");
    expect(initial.notes).toBe("");
  });

  it("garde l'étape choisie par l'utilisateur", () => {
    const current = { ...base, stage: "R3" as const };
    const incoming = { ...base, stage: "R2" as const, titre: "Nouveau titre" };
    const { form, initial } = mergePipeFormOnReload(base, current, incoming);
    expect(form.stage).toBe("R3");
    expect(form.titre).toBe("Nouveau titre");
    expect(initial.stage).toBe("R1");
    expect(initial.titre).toBe("Nouveau titre");
  });

  it("ignore les espaces de bord pour décider si un texte est touché", () => {
    const current = { ...base, titre: "Dossier Martin  " };
    const incoming = { ...base, titre: "Dossier Durand" };
    expect(mergePipeFormOnReload(base, current, incoming).form.titre).toBe("Dossier Durand");
  });
});
