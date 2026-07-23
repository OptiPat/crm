import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulVolumeExercice } from "@/lib/api/tauri-filleul-volumes";
import { buildMemberDossierVolumeRows } from "@/lib/organisation/organisation-member-dossier";

const contact = {
  id: 2,
  nom: "DUPONT",
  prenom: "Jean",
  categorie: "AUCUN",
  filleul_categorie: "FILLEUL",
  filleul_volume: 90_000,
  filleul_volume_manager: 400_000,
  parrain_id: 1,
  statut_suivi: "ACTIF",
  created_at: 0,
  updated_at: 0,
} as Contact;

const selfContact = {
  id: 1,
  nom: "MOI",
  prenom: "CGP",
  categorie: "AUCUN",
  filleul_categorie: "FILLEUL",
  statut_suivi: "ACTIF",
  created_at: 0,
  updated_at: 0,
} as Contact;

describe("organisation-member-dossier", () => {
  it("fusionne historique importé et exercice courant live", () => {
    const history: FilleulVolumeExercice[] = [
      {
        contactId: 2,
        exerciceLabel: "2023-2024",
        volumePropre: 120_000,
        volumeBranche: 300_000,
        volumeManager: 500_000,
        closedAt: 1,
        source: "cloture",
      },
    ];
    const rows = buildMemberDossierVolumeRows(
      contact,
      history,
      [selfContact, contact],
      selfContact,
      new Date(2026, 5, 1)
    );
    expect(rows.some((row) => row.exerciceLabel === "2023-2024")).toBe(true);
    expect(rows.some((row) => row.exerciceLabel === "2025-2026" && row.isCurrent)).toBe(true);
    const current = rows.find((row) => row.isCurrent);
    expect(current?.volumePropre).toBe(90_000);
    expect(current?.source).toBe("live");
  });

  it("privilégie les volumes live si l'exercice courant est importé mais non clôturé", () => {
    const history: FilleulVolumeExercice[] = [
      {
        contactId: 2,
        exerciceLabel: "2025-2026",
        volumePropre: 10_000,
        volumeBranche: 50_000,
        volumeManager: 100_000,
        closedAt: null,
        source: "import",
      },
    ];
    const rows = buildMemberDossierVolumeRows(
      contact,
      history,
      [selfContact, contact],
      selfContact,
      new Date(2026, 5, 1)
    );
    const current = rows.find((row) => row.isCurrent);
    expect(current?.volumePropre).toBe(90_000);
    expect(current?.source).toBe("live");
  });

  it("conserve le snapshot si l'exercice courant est clôturé", () => {
    const history: FilleulVolumeExercice[] = [
      {
        contactId: 2,
        exerciceLabel: "2025-2026",
        volumePropre: 10_000,
        volumeBranche: 50_000,
        volumeManager: 100_000,
        closedAt: 1,
        source: "cloture",
      },
    ];
    const rows = buildMemberDossierVolumeRows(
      contact,
      history,
      [selfContact, contact],
      selfContact,
      new Date(2026, 5, 1)
    );
    const current = rows.find((row) => row.isCurrent);
    expect(current?.volumePropre).toBe(10_000);
    expect(current?.source).toBe("cloture");
  });
});
