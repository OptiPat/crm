import { describe, expect, it } from "vitest";
import { defaultSouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";
import {
  acceptDossierSourceUpdate,
  dismissDossierSourceUpdate,
  listDossierSourceUpdates,
} from "@/lib/souscription-cif/dossier-source-updates";
import { syncDossierAutoFields } from "@/lib/souscription-cif/sync-dossier-auto-fields";

type Dossier = ReturnType<typeof defaultSouscriptionDossierFields>;

const sync = (dossier: Dossier, dateRio: string, niveau: string): Dossier => ({
  ...dossier,
  ...syncDossierAutoFields(dossier, [
    { key: "dateRio", fresh: dateRio },
    { key: "niveauExperience", fresh: niveau },
  ]),
});

describe("listDossierSourceUpdates", () => {
  // Import RIO + QPI, correction à la main, puis nouvel import l'année suivante.
  const imported = sync(defaultSouscriptionDossierFields(), "2026-01-10", "Informé");
  const corrected: Dossier = { ...imported, dateRio: "2026-01-12" };

  it("pas d'alerte après une correction à la main tant que la fiche ne change pas", () => {
    expect(listDossierSourceUpdates(corrected)).toEqual([]);
    expect(listDossierSourceUpdates(sync(corrected, "2026-01-10", "Informé"))).toEqual([]);
  });

  it("alerte sur le champ corrigé quand un nouveau RIO change la valeur", () => {
    const reimported = sync(corrected, "2027-02-03", "Expérimenté");
    // Champ non retouché : suit directement le nouveau QPI, sans alerte.
    expect(reimported.niveauExperience).toBe("Expérimenté");
    // Champ corrigé : conservé, mais signalé.
    expect(reimported.dateRio).toBe("2026-01-12");
    const updates = listDossierSourceUpdates(reimported);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: "field:dateRio",
      current: "2026-01-12",
      fresh: "2027-02-03",
      isDate: true,
      document: "lettre-mission",
    });
  });

  it("Reprendre : applique la nouvelle valeur et le champ suit de nouveau la fiche", () => {
    const reimported = sync(corrected, "2027-02-03", "Informé");
    const [update] = listDossierSourceUpdates(reimported);
    const accepted = { ...reimported, ...acceptDossierSourceUpdate(reimported, update!) };
    expect(accepted.dateRio).toBe("2027-02-03");
    expect(listDossierSourceUpdates(accepted)).toEqual([]);
    expect(sync(accepted, "2028-03-04", "Informé").dateRio).toBe("2028-03-04");
  });

  it("Garder ma saisie : l'alerte disparaît jusqu'au prochain changement", () => {
    const reimported = sync(corrected, "2027-02-03", "Informé");
    const [update] = listDossierSourceUpdates(reimported);
    const kept = { ...reimported, ...dismissDossierSourceUpdate(reimported, update!) };
    expect(kept.dateRio).toBe("2026-01-12");
    expect(listDossierSourceUpdates(kept)).toEqual([]);
    expect(listDossierSourceUpdates(sync(kept, "2027-02-03", "Informé"))).toEqual([]);
    expect(listDossierSourceUpdates(sync(kept, "2028-03-04", "Informé"))).toHaveLength(1);
  });

  it("pas d'alerte si la saisie rejoint la nouvelle valeur ou si le champ est vide", () => {
    const reimported = sync(corrected, "2027-02-03", "Informé");
    expect(listDossierSourceUpdates({ ...reimported, dateRio: "2027-02-03" })).toEqual([]);
    expect(listDossierSourceUpdates({ ...reimported, dateRio: "" })).toEqual([]);
  });

  it("ancien dossier retouché (sans valeur auto) : référence posée sans alerte", () => {
    const legacy: Dossier = { ...defaultSouscriptionDossierFields(), dateRio: "2025-05-05" };
    const adopted = sync(legacy, "2026-01-10", "Informé");
    expect(adopted.dateRio).toBe("2025-05-05");
    expect(listDossierSourceUpdates(adopted)).toEqual([]);
    expect(listDossierSourceUpdates(sync(adopted, "2027-02-03", "Informé"))).toHaveLength(1);
  });

  it("saisie avant tout import : alerte au premier import du QPI / RIO", () => {
    const empty = sync(defaultSouscriptionDossierFields(), "", "");
    const typed: Dossier = { ...empty, dateRio: "2026-01-12", niveauExperience: "Informé" };
    const imported = sync(typed, "2026-01-10", "Averti");
    expect(imported.dateRio).toBe("2026-01-12");
    expect(imported.niveauExperience).toBe("Informé");
    expect(listDossierSourceUpdates(imported).map((u) => u.id)).toEqual([
      "field:dateRio",
      "field:niveauExperience",
    ]);
  });

  it("document source supprimé : l'alerte disparaît", () => {
    const reimported = sync(corrected, "2027-02-03", "Informé");
    expect(listDossierSourceUpdates(reimported)).toHaveLength(1);
    const removed = sync(reimported, "", "Informé");
    expect(removed.dateRio).toBe("2026-01-12");
    expect(listDossierSourceUpdates(removed)).toEqual([]);
  });

  it("niveau d'expérience ignoré pour les produits sans ce champ (G3F)", () => {
    const edited: Dossier = { ...imported, niveauExperience: "Novice" };
    const reimported = sync(edited, "2026-01-10", "Expérimenté");
    expect(listDossierSourceUpdates(reimported)).toHaveLength(1);
    expect(
      listDossierSourceUpdates(reimported, { includeNiveauExperience: false })
    ).toEqual([]);
  });
});
