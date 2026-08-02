import { describe, expect, it } from "vitest";
import { resolvePlacementConformeRecipientContactIds } from "@/lib/placement/placement-conforme-recipients";

describe("resolvePlacementConformeRecipientContactIds", () => {
  it("retourne le contact de l'opération sans pipe", () => {
    expect(resolvePlacementConformeRecipientContactIds(72, null)).toEqual([72]);
  });

  it("retourne les deux contacts d'une affaire couple", () => {
    expect(
      resolvePlacementConformeRecipientContactIds(72, {
        contact_id: 72,
        secondary_contact_id: 73,
      })
    ).toEqual([72, 73]);
  });

  it("pipe couple : toujours les deux, même si l'opération est au nom du co-contact", () => {
    expect(
      resolvePlacementConformeRecipientContactIds(73, {
        contact_id: 72,
        secondary_contact_id: 73,
      })
    ).toEqual([72, 73]);
  });

  it("pipe solo : contact du pipe uniquement", () => {
    expect(
      resolvePlacementConformeRecipientContactIds(99, {
        contact_id: 72,
        secondary_contact_id: null,
      })
    ).toEqual([72]);
  });

  it("sans pipe : contact de l'opération", () => {
    expect(resolvePlacementConformeRecipientContactIds(72, null)).toEqual([72]);
  });

  it("dédoublonne si le contact opération est aussi co-contact", () => {
    expect(
      resolvePlacementConformeRecipientContactIds(72, {
        contact_id: 72,
        secondary_contact_id: 72,
      })
    ).toEqual([72]);
  });
});
