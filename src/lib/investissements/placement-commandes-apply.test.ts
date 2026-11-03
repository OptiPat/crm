import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";

const created: Investissement[] = [];
const updated: number[] = [];

vi.mock("@/lib/api/tauri-contacts", () => ({
  getAllContacts: vi.fn(async () => [
    {
      id: 1,
      nom: "LEGRAND",
      prenom: "Christian",
      categorie: "CLIENT",
      statut_suivi: "ACTIF",
      created_at: 0,
      updated_at: 0,
    } as Contact,
  ]),
  updateContact: vi.fn(),
}));
vi.mock("@/lib/api/tauri-foyers", () => ({
  createFoyer: vi.fn(),
  getAllFoyers: vi.fn(async () => []),
}));
vi.mock("@/lib/api/tauri-partenaires", () => ({
  createPartenaire: vi.fn(),
  getAllPartenaires: vi.fn(async () => []),
}));
vi.mock("@/lib/api/tauri-investissements", () => ({
  getAllInvestissements: vi.fn(async () => []),
  createInvestissement: vi.fn(async (payload: Record<string, unknown>) => {
    const inv = { ...payload, id: 100 + created.length, created_at: 0, updated_at: 0 } as Investissement;
    created.push(inv);
    return inv;
  }),
  updateInvestissement: vi.fn(async (id: number, payload: Record<string, unknown>) => {
    updated.push(id);
    return { ...payload, id, created_at: 0, updated_at: 0 } as Investissement;
  }),
  closeInvestissement: vi.fn(),
}));
vi.mock("@/lib/investissements/investissement-events", () => ({
  notifyInvestissementsChanged: vi.fn(),
}));
vi.mock("@/lib/contacts/contact-events", () => ({
  notifyContactsChanged: vi.fn(),
}));

import {
  applyPlacementCommandesImport,
  buildPlacementCommandesImportPreview,
  defaultSelectedPlacementLineKeys,
  parsePlacementCommandeRows,
  placementCreatedInvestissementIds,
} from "./placement-commandes-import";
import { getAllContacts } from "@/lib/api/tauri-contacts";
import { getAllInvestissements } from "@/lib/api/tauri-investissements";

describe("applyPlacementCommandesImport", () => {
  beforeEach(() => {
    created.length = 0;
    updated.length = 0;
  });

  it("souscriptions annuelles même produit / montant : une fiche par souscription", async () => {
    const row = (date: string) => ({
      "Nom complet Investisseur": "LEGRAND Christian",
      "Type Produit": "Girardin Industriel",
      "Libellé Produit": "G3F",
      "Date Effet": "",
      "Date du dernier Mouvement VC": date,
      "Type du dernier Mouvement VC": "Versement initial",
      "Montant du dernier Mouvement VC": 10000,
      "Etat Commande": "En-cours",
    });
    const parsed = parsePlacementCommandeRows([row("31/01/2023"), row("30/06/2023")]);
    const lines = buildPlacementCommandesImportPreview(parsed, await getAllContacts(), []);
    const result = await applyPlacementCommandesImport(
      lines,
      defaultSelectedPlacementLineKeys(lines)
    );
    expect(result.applied).toBe(2);
    expect(created).toHaveLength(2);
    expect(updated).toHaveLength(0);
  });

  it("2e clic « Importer » : la ligne restante ne capte pas la souscription créée au 1er", async () => {
    const row = (date: string) => ({
      "Nom complet Investisseur": "LEGRAND Christian",
      "Type Produit": "Girardin Industriel",
      "Libellé Produit": "G3F",
      "Date Effet": "",
      "Date du dernier Mouvement VC": date,
      "Type du dernier Mouvement VC": "Versement initial",
      "Montant du dernier Mouvement VC": 10000,
      "Etat Commande": "En-cours",
    });
    const contacts = await getAllContacts();
    const lines = buildPlacementCommandesImportPreview(
      parsePlacementCommandeRows([row("31/01/2023"), row("30/06/2023")]),
      contacts,
      []
    );
    const first = await applyPlacementCommandesImport(lines, new Set([lines[0]!.lineKey]));
    expect(created).toHaveLength(1);

    // Comme le dialog : on relit la base (qui contient la 1re), moins les créations de l'aperçu.
    const createdIds = placementCreatedInvestissementIds(first.lines);
    const remaining = buildPlacementCommandesImportPreview(
      parsePlacementCommandeRows([row("30/06/2023")]),
      contacts,
      created.filter((i) => !createdIds.has(i.id))
    );
    expect(remaining[0]!.status).toBe("ready");

    vi.mocked(getAllInvestissements).mockResolvedValueOnce([...created]);
    const second = await applyPlacementCommandesImport(first.lines, new Set([first.lines[1]!.lineKey]));
    expect(second.applied).toBe(1);
    expect(created).toHaveLength(2);
    expect(updated).toHaveLength(0);
  });
});
