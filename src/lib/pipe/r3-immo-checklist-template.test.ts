import { describe, expect, it } from "vitest";
import {
  cloneDefaultR3ImmoChecklistTemplate,
  DEFAULT_R3_IMMO_CHECKLIST_ITEMS,
  orderedR3ImmoSections,
} from "./r3-immo-checklist-template";

describe("r3-immo-checklist-template", () => {
  it("contient les pièces par défaut attendues", () => {
    expect(DEFAULT_R3_IMMO_CHECKLIST_ITEMS.length).toBeGreaterThan(30);
    expect(DEFAULT_R3_IMMO_CHECKLIST_ITEMS.some((item) => item.id === "titre_propriete")).toBe(
      true
    );
  });

  it("clone le template par défaut avec sections ordonnées", () => {
    const template = cloneDefaultR3ImmoChecklistTemplate();
    expect(template.items).toHaveLength(DEFAULT_R3_IMMO_CHECKLIST_ITEMS.length);
    expect(orderedR3ImmoSections(template).length).toBeGreaterThan(0);
  });
});
