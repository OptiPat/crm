import { describe, expect, it } from "vitest";
import { syncDossierAutoFields } from "@/lib/souscription-cif/sync-dossier-auto-fields";
import { defaultSouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

const dossier = (patch: Partial<ReturnType<typeof defaultSouscriptionDossierFields>>) => ({
  ...defaultSouscriptionDossierFields(),
  ...patch,
});

describe("syncDossierAutoFields", () => {
  it("préremplit un champ vide et mémorise la valeur auto", () => {
    const patch = syncDossierAutoFields(dossier({}), [{ key: "lieuNaissance", fresh: "Lyon" }]);
    expect(patch.lieuNaissance).toBe("Lyon");
    expect(patch.autoValues).toEqual({ lieuNaissance: "Lyon" });
  });

  it("suit la fiche tant que le champ n'est pas retouché", () => {
    const patch = syncDossierAutoFields(
      dossier({ dateRio: "2026-01-10", autoValues: { dateRio: "2026-01-10" } }),
      [{ key: "dateRio", fresh: "2026-11-02" }]
    );
    expect(patch.dateRio).toBe("2026-11-02");
  });

  it("n'écrase pas une saisie manuelle", () => {
    const patch = syncDossierAutoFields(
      dossier({ lieuNaissance: "Montpellier", autoValues: { lieuNaissance: "Lyon" } }),
      [{ key: "lieuNaissance", fresh: "Lyon" }]
    );
    expect(patch.lieuNaissance).toBeUndefined();
  });

  it("n'efface pas une saisie manuelle quand la fiche est vide", () => {
    const patch = syncDossierAutoFields(dossier({ lieuNaissance: "Montpellier" }), [
      { key: "lieuNaissance", fresh: "" },
    ]);
    expect(patch).toEqual({});
  });

  it("ancien dossier : le lieu de naissance suit la fiche (toujours recopié avant)", () => {
    const patch = syncDossierAutoFields(dossier({ lieuNaissance: "Lyon" }), [
      { key: "lieuNaissance", fresh: "Montpellier", legacyAlwaysAuto: true },
    ]);
    expect(patch.lieuNaissance).toBe("Montpellier");
  });

  it("ancien dossier : remplace le texte type par les objectifs de la fiche", () => {
    const patch = syncDossierAutoFields(dossier({ objectifsClient: "Texte type" }), [
      { key: "objectifsClient", fresh: "Vos objectifs …", legacyAutoValues: ["Texte type"] },
    ]);
    expect(patch.objectifsClient).toBe("Vos objectifs …");
  });

  it("ancien dossier : garde un texte personnalisé", () => {
    const patch = syncDossierAutoFields(dossier({ objectifsClient: "Rédigé à la main" }), [
      { key: "objectifsClient", fresh: "Vos objectifs …", legacyAutoValues: ["Texte type"] },
    ]);
    expect(patch.objectifsClient).toBeUndefined();
  });
});
