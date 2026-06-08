import { describe, expect, it } from "vitest";
import { mergeRelationChangedDetails } from "@/lib/etiquettes/etiquette-events";

describe("mergeRelationChangedDetails", () => {
  it("garde le 1er évènement tel quel quand rien n'est en attente", () => {
    const merged = mergeRelationChangedDetails(null, {
      contactId: 1,
      skipQueueReload: true,
      skipEtiquettesChanged: true,
    });
    expect(merged.skipQueueReload).toBe(true);
    expect(merged.skipEtiquettesChanged).toBe(true);
  });

  it("ne saute pas le rechargement dès qu'un évènement le réclame", () => {
    // 1er : envoi individuel déjà patché en local (skip), 2e : a besoin du reload.
    const pending = mergeRelationChangedDetails(null, {
      skipQueueReload: true,
      skipEtiquettesChanged: true,
    });
    const merged = mergeRelationChangedDetails(pending, { contactId: 2 });
    expect(merged.skipQueueReload).toBe(false);
    expect(merged.skipEtiquettesChanged).toBe(false);
  });

  it("conserve skip uniquement si TOUS les évènements le demandent", () => {
    const pending = mergeRelationChangedDetails(null, { skipQueueReload: true });
    const merged = mergeRelationChangedDetails(pending, { skipQueueReload: true });
    expect(merged.skipQueueReload).toBe(true);
  });
});
