import { describe, expect, it } from "vitest";
import { buildTacheDraftFromAlerte } from "@/lib/taches/tache-from-alerte";
import type { AlerteWithContact } from "@/lib/api/tauri-dashboard";

const alerte: AlerteWithContact = {
  alerte_id: 1,
  contact_id: 42,
  contact_nom: "DUPONT",
  contact_prenom: "Jean",
  contact_categorie: "CLIENT",
  date_dernier_contact: null,
  type_alerte: "SUIVI_CLIENT_1AN",
  message: "Suivi client +1 an - DUPONT Jean",
  date_alerte: "1700000000",
};

describe("buildTacheDraftFromAlerte", () => {
  it("préremplit titre et contact", () => {
    const draft = buildTacheDraftFromAlerte(alerte);
    expect(draft.contactIds).toEqual([42]);
    expect(draft.titre).toContain("Suivi client +1 an");
    expect(draft.titre).toContain("Jean DUPONT");
    expect(draft.dateEcheance).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
