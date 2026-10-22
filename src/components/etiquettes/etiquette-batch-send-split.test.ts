import { describe, expect, it } from "vitest";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import { batchRecipientLabel, splitBatchSendItems } from "./etiquette-batch-send-split";

function item(id: number, extra: Partial<EtiquetteEmailQueueItem> = {}): EtiquetteEmailQueueItem {
  return {
    contact_etiquette_id: id,
    contact_id: id,
    contact_nom: `Nom${id}`,
    contact_prenom: `Prenom${id}`,
    contact_email: `c${id}@ex.fr`,
    ...extra,
  } as EtiquetteEmailQueueItem;
}

describe("splitBatchSendItems", () => {
  it("exclut les lignes bloquées avec leur raison, garde l'ordre des autres", () => {
    const items = [item(1), item(2), item(3)];
    const { sendable, blocked } = splitBatchSendItems(items, (i) =>
      i.contact_etiquette_id === 2 ? "Résumé SCPI périmé" : null
    );
    expect(sendable.map((i) => i.contact_etiquette_id)).toEqual([1, 3]);
    expect(blocked).toEqual([{ item: items[1], reason: "Résumé SCPI périmé" }]);
  });

  it("tout envoyable si rien n'est bloqué", () => {
    const { sendable, blocked } = splitBatchSendItems([item(1)], () => null);
    expect(sendable).toHaveLength(1);
    expect(blocked).toHaveLength(0);
  });
});

describe("batchRecipientLabel", () => {
  it("nom complet, sinon email", () => {
    expect(batchRecipientLabel(item(1))).toBe("Prenom1 Nom1");
    expect(batchRecipientLabel(item(2, { contact_prenom: "", contact_nom: "" }))).toBe("c2@ex.fr");
  });
});
