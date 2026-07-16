import { describe, expect, it } from "vitest";
import type { PlacementOperationWithContact } from "@/lib/api/tauri-box-placement";
import {
  buildSuiviPlacementColumnByPipe,
  placementCountsShowListBadge,
  resolveSuiviListStatusBadge,
} from "@/lib/pipe/pipe-list-badges";

function row(
  partial: Partial<PlacementOperationWithContact["operation"]>
): PlacementOperationWithContact {
  return {
    operation: {
      id: partial.id ?? 1,
      contact_id: partial.contact_id ?? 1,
      operation_type: partial.operation_type ?? "ARBITRAGE",
      status: partial.status ?? "PENDING",
      created_at: partial.created_at ?? 1,
      updated_at: partial.updated_at ?? 1,
      pipe_id: partial.pipe_id,
      pipe_timeline_entry_id: partial.pipe_timeline_entry_id,
      email_received_at: partial.email_received_at,
      ...partial,
    },
    contact_nom: "DUPONT",
    contact_prenom: "Jean",
    pipe_titre: "Suivi test",
  };
}

describe("placementCountsShowListBadge", () => {
  it("retourne false sans compteurs ouverts", () => {
    expect(placementCountsShowListBadge(undefined)).toBe(false);
    expect(
      placementCountsShowListBadge({ unsent: 0, pending: 0, non_conforme: 0 })
    ).toBe(false);
  });

  it("retourne true si au moins un compteur ouvert", () => {
    expect(placementCountsShowListBadge({ unsent: 1, pending: 0, non_conforme: 0 })).toBe(
      true
    );
  });
});

describe("buildSuiviPlacementColumnByPipe", () => {
  it("retourne la colonne la plus en amont pour un pipe", () => {
    const map = buildSuiviPlacementColumnByPipe([
      row({
        id: 1,
        contact_id: 1,
        pipe_id: 10,
        operation_type: "ARBITRAGE",
        status: "CONFORME",
        created_at: 1,
        updated_at: 2,
        email_received_at: 100,
        pipe_timeline_entry_id: 5,
      }),
      row({
        id: 2,
        contact_id: 1,
        pipe_id: 10,
        operation_type: "ARBITRAGE",
        status: "PENDING",
        created_at: 1,
        updated_at: 3,
        pipe_timeline_entry_id: 6,
      }),
    ]);
    expect(map[10]).toEqual({ column: "waiting", count: 1 });
  });
});

describe("resolveSuiviListStatusBadge", () => {
  it("affiche Journal sans acte partenaire", () => {
    expect(resolveSuiviListStatusBadge(3, {})).toEqual({
      label: "Journal",
      badgeClassName: "bg-muted text-muted-foreground border-border",
    });
  });

  it("affiche Conforme - Mail client pour la colonne mail", () => {
    expect(
      resolveSuiviListStatusBadge(10, {
        10: { column: "client_mail", count: 1 },
      }).label
    ).toBe("Conforme - Mail client");
  });

  it("affiche le libellé court de colonne avec compteur", () => {
    expect(
      resolveSuiviListStatusBadge(10, {
        10: { column: "first_response", count: 2 },
      }).label
    ).toBe("Réponse · 2");
  });
});
