import { describe, expect, it } from "vitest";
import {
  getEtiquetteQueueItemKey,
  isSameEtiquetteQueueItem,
} from "./etiquette-queue-item-key";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";

const base = {
  contact_etiquette_id: 3,
  contact_id: 99,
} as EtiquetteEmailQueueItem;

describe("etiquette-queue-item-key", () => {
  it("distingue étiquette et modèle avec le même id numérique", () => {
    expect(
      getEtiquetteQueueItemKey({ ...base, queue_row_kind: "etiquette" })
    ).toBe("etiquette:3");
    expect(
      getEtiquetteQueueItemKey({ ...base, queue_row_kind: "template" })
    ).toBe("template:3");
    expect(
      isSameEtiquetteQueueItem(
        { ...base, queue_row_kind: "etiquette" },
        { ...base, queue_row_kind: "template" }
      )
    ).toBe(false);
  });
});
