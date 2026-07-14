import { describe, expect, it } from "vitest";
import {
  filterPlacementRowsForBoard,
  getPlacementBoardColumn,
  groupPlacementOperationsByBoardColumn,
  placementBoardRowShowsNonConformeAlert,
  placementBoardRowBadge,
  placementOperationIsDetachedSuiviDraft,
  formatPlacementBoardCardDate,
  formatPlacementBoardCardSubtitle,
  formatPlacementBoardDateTime,
} from "@/lib/placement/placement-operation-board";
import type { PlacementOperationWithContact } from "@/lib/api/tauri-box-placement";

const base = {
  pipe_timeline_entry_id: 5,
  email_received_at: null as number | null,
  non_conforme_at: null as number | null,
  partner_resent_at: null as number | null,
  client_notified_at: null as number | null,
  dismissed_at: null as number | null,
};

function row(
  partial: Partial<PlacementOperationWithContact["operation"]> &
    Pick<PlacementOperationWithContact, "contact_nom" | "contact_prenom">
): PlacementOperationWithContact {
  const { contact_nom, contact_prenom, ...op } = partial;
  return {
    operation: {
      id: op.id ?? 1,
      contact_id: 1,
      operation_type: "ARBITRAGE",
      status: op.status ?? "PENDING",
      created_at: 0,
      updated_at: op.updated_at ?? 0,
      ...base,
      ...op,
    },
    contact_nom,
    contact_prenom,
  };
}

describe("placement-operation-board", () => {
  it("PENDING brouillon suivi → acte", () => {
    expect(
      getPlacementBoardColumn({
        ...base,
        status: "PENDING",
        pipe_timeline_entry_id: null,
      })
    ).toBe("declare");
  });

  it("PENDING envoyé Stellium → attente partenaire", () => {
    expect(getPlacementBoardColumn({ ...base, status: "PENDING" })).toBe("waiting");
  });

  it("NON_CONFORME → réponse partenaire (alerte rouge)", () => {
    expect(
      getPlacementBoardColumn({
        ...base,
        status: "NON_CONFORME",
        non_conforme_at: 100,
        email_received_at: 100,
      })
    ).toBe("first_response");
    expect(
      placementBoardRowShowsNonConformeAlert({
        status: "NON_CONFORME",
        partner_resent_at: null,
      })
    ).toBe(true);
    expect(
      placementBoardRowShowsNonConformeAlert({
        status: "NON_CONFORME",
        partner_resent_at: 200,
      })
    ).toBe(false);
  });

  it("NON_CONFORME après renvoi → conforme (parcours NC)", () => {
    expect(
      getPlacementBoardColumn({
        ...base,
        status: "NON_CONFORME",
        non_conforme_at: 100,
        partner_resent_at: 200,
        email_received_at: 100,
      })
    ).toBe("conforme_after_nc");
  });

  it("CONFORME sans mail client → mail client", () => {
    expect(
      getPlacementBoardColumn({
        ...base,
        status: "CONFORME",
        email_received_at: 100,
      })
    ).toBe("client_mail");
  });

  it("CONFORME notifié → hors board", () => {
    expect(
      getPlacementBoardColumn({
        ...base,
        status: "CONFORME",
        client_notified_at: 100,
        email_received_at: 100,
      })
    ).toBeNull();
  });

  it("6 colonnes dans le groupement", () => {
    const groups = groupPlacementOperationsByBoardColumn([
      row({ id: 1, status: "PENDING", contact_nom: "A", contact_prenom: "B", updated_at: 10 }),
      row({
        id: 2,
        status: "NON_CONFORME",
        non_conforme_at: 50,
        email_received_at: 50,
        contact_nom: "C",
        contact_prenom: "D",
        updated_at: 20,
      }),
    ]);
    expect(Object.keys(groups)).toHaveLength(6);
    expect(groups.waiting).toHaveLength(1);
    expect(groups.first_response).toHaveLength(1);
    expect(groups.declare).toHaveLength(0);
  });

  it("dismissed exclu du board (sauf non conforme)", () => {
    expect(
      getPlacementBoardColumn({
        ...base,
        status: "NON_CONFORME",
        dismissed_at: 100,
        non_conforme_at: 100,
        email_received_at: 100,
      })
    ).toBe("first_response");
    expect(
      getPlacementBoardColumn({
        ...base,
        status: "PENDING",
        dismissed_at: 100,
      })
    ).toBeNull();
    const filtered = filterPlacementRowsForBoard([
      row({
        id: 1,
        status: "PENDING",
        dismissed_at: 100,
        contact_nom: "X",
        contact_prenom: "Y",
      }),
    ]);
    expect(filtered).toHaveLength(0);
  });

  it("badge brouillon suivi vs scan orphelin", () => {
    expect(
      placementBoardRowBadge({
        status: "PENDING",
        pipe_timeline_entry_id: null,
        email_received_at: null,
        pipe_id: 3,
      })
    ).toBe("awaiting_send");
    expect(
      placementBoardRowBadge({
        status: "PENDING",
        pipe_timeline_entry_id: null,
        email_received_at: null,
        pipe_id: null,
      })
    ).toBe("scan_orphan");
    expect(
      placementBoardRowBadge({
        status: "PENDING",
        pipe_timeline_entry_id: 5,
        email_received_at: null,
        pipe_id: 3,
      })
    ).toBeNull();
  });

  it("brouillon détaché (pipe supprimé) exclu du board", () => {
    expect(
      placementOperationIsDetachedSuiviDraft({
        status: "PENDING",
        pipe_id: null,
        pipe_timeline_entry_id: null,
        email_received_at: null,
        gmail_message_id: null,
        dismissed_at: null,
      })
    ).toBe(true);
    const filtered = filterPlacementRowsForBoard([
      row({
        id: 1,
        status: "PENDING",
        pipe_id: null,
        pipe_timeline_entry_id: null,
        email_received_at: null,
        contact_nom: "ALAMEDA",
        contact_prenom: "Luc",
      }),
    ]);
    expect(filtered).toHaveLength(0);
  });

  it("PENDING scan orphelin exclu du board", () => {
    const filtered = filterPlacementRowsForBoard([
      row({
        id: 1,
        status: "PENDING",
        pipe_id: null,
        pipe_timeline_entry_id: null,
        email_received_at: null,
        gmail_message_id: "scan-1",
        contact_nom: "X",
        contact_prenom: "Y",
      }),
    ]);
    expect(filtered).toHaveLength(0);
  });

  it("sous-titre carte sans répéter le contact", () => {
    expect(
      formatPlacementBoardCardSubtitle({
        contact_prenom: "Luc",
        contact_nom: "ALAMEDA",
        pipe_titre: "Luc ALAMEDA — suivi juillet 2026",
      })
    ).toBe("Luc ALAMEDA — suivi juillet 2026");
  });

  it("dates carte : création en colonne acte, dates métier ailleurs", () => {
    const created = 1_721_000_000;
    const sent = 1_721_086_400;
    const received = 1_721_172_800;
    const ncAt = 1_721_172_800;
    const resent = 1_721_259_200;
    const notified = 1_721_345_600;

    expect(
      formatPlacementBoardCardDate(
        {
          created_at: created,
          updated_at: sent,
          email_received_at: received,
          non_conforme_at: ncAt,
          partner_resent_at: resent,
          client_notified_at: notified,
          pipe_timeline_entry_id: 5,
          status: "PENDING",
        },
        "declare"
      )
    ).toMatchObject({ prefix: "Créé le" });

    expect(
      formatPlacementBoardCardDate(
        {
          created_at: created,
          updated_at: sent,
          email_received_at: null,
          non_conforme_at: null,
          partner_resent_at: null,
          client_notified_at: null,
          pipe_timeline_entry_id: 5,
          status: "PENDING",
        },
        "waiting"
      )
    ).toMatchObject({ prefix: "Envoyé le" });

    expect(
      formatPlacementBoardCardDate(
        {
          created_at: created,
          updated_at: sent,
          email_received_at: received,
          non_conforme_at: ncAt,
          partner_resent_at: null,
          client_notified_at: null,
          pipe_timeline_entry_id: 5,
          status: "NON_CONFORME",
        },
        "first_response"
      )
    ).toMatchObject({ prefix: "Non conforme le" });

    expect(
      formatPlacementBoardCardDate(
        {
          created_at: created,
          updated_at: sent,
          email_received_at: received,
          non_conforme_at: ncAt,
          partner_resent_at: resent,
          client_notified_at: null,
          pipe_timeline_entry_id: 5,
          status: "NON_CONFORME",
        },
        "conforme_after_nc"
      )
    ).toMatchObject({ prefix: "Renvoyé le" });

    expect(
      formatPlacementBoardCardDate(
        {
          created_at: created,
          updated_at: sent,
          email_received_at: received,
          non_conforme_at: null,
          partner_resent_at: null,
          client_notified_at: null,
          pipe_timeline_entry_id: 5,
          status: "CONFORME",
        },
        "client_mail"
      )
    ).toMatchObject({ prefix: "Conforme le" });

    expect(
      formatPlacementBoardCardDate(
        {
          created_at: created,
          updated_at: sent,
          email_received_at: received,
          non_conforme_at: null,
          partner_resent_at: null,
          client_notified_at: notified,
          pipe_timeline_entry_id: 5,
          status: "CONFORME",
        },
        "client_mail"
      )
    ).toMatchObject({ prefix: "Mail client le" });
  });

  it("formatPlacementBoardDateTime affiche jour et heure", () => {
    const formatted = formatPlacementBoardDateTime(1_721_086_400);
    expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });
});
