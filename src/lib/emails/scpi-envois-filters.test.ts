import { describe, expect, it } from "vitest";
import {
  filterReadyByScpiBatch,
  filterScpiBulletinReadyItems,
  parseScpiQueuePeriod,
} from "@/lib/emails/scpi-envois-filters";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";

function item(partial: Partial<EtiquetteEmailQueueItem>): EtiquetteEmailQueueItem {
  return {
    contact_id: 1,
    contact_nom: "DUPONT",
    contact_prenom: "Jean",
    contact_email: "a@example.com",
    contact_registre: null,
    etiquette_id: 1,
    etiquette_nom: "Modèle · Bulletin SCPI trimestriel",
    etiquette_couleur: "#ccc",
    email_date_prevue: 0,
    email_date_envoi: null,
    email_is_relance: false,
    queue_issue: null,
    template_variables: null,
    campaign_variables: JSON.stringify({ periode: "T1 2026" }),
    queue_row_kind: "template",
    contact_etiquette_id: null,
    template_sujet: null,
    ...partial,
  } as EtiquetteEmailQueueItem;
}

describe("scpi-envois-filters", () => {
  it("filtre bulletins SCPI", () => {
    const list = [
      item({ contact_id: 1 }),
      item({ contact_id: 2, etiquette_nom: "Relance client" }),
    ];
    expect(filterScpiBulletinReadyItems(list)).toHaveLength(1);
  });

  it("filtre par période batch", () => {
    const list = [
      item({ campaign_variables: JSON.stringify({ periode: "T1 2026" }) }),
      item({ campaign_variables: JSON.stringify({ periode: "T2 2026" }) }),
    ];
    expect(filterReadyByScpiBatch(list, "T1 2026")).toHaveLength(1);
  });

  it("parse période campagne", () => {
    expect(parseScpiQueuePeriod(item({}))).toBe("T1 2026");
  });
});
