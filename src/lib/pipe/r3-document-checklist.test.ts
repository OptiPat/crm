import { describe, expect, it } from "vitest";
import {
  countR3ChecklistProgress,
  isR3ChecklistItemComplete,
  listMissingR3ChecklistKeys,
  shouldShowR3DocumentChecklist,
} from "@/lib/pipe/r3-document-checklist";
import { DEFAULT_PIPE_CHECKLIST_TEMPLATES } from "@/lib/pipe/pipe-checklist-template";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";

const mkRdv = (titre: string): PipeTimelineEntryRecord => ({
  id: 1,
  pipe_id: 1,
  entry_type: "RDV",
  titre,
  contenu: null,
  occurred_at: 1,
  created_at: 1,
});

describe("r3-document-checklist", () => {
  it("considère une ligne reçue comme complète", () => {
    expect(isR3ChecklistItemComplete({ received: true })).toBe(true);
    expect(isR3ChecklistItemComplete({ received: false })).toBe(false);
  });

  it("compte les pièces manquantes", () => {
    const checklist = {
      pipe_id: 1,
      items: { der: { received: true } },
      updated_at: 1,
    };
    const missing = listMissingR3ChecklistKeys(checklist, DEFAULT_PIPE_CHECKLIST_TEMPLATES);
    expect(missing).not.toContain("der");
    expect(missing).toContain("rio");
    expect(missing.length).toBe(5);
  });

  it("affiche la checklist si RDV R3 placements planifié", () => {
    expect(shouldShowR3DocumentChecklist([mkRdv("R3")])).toBe(true);
    expect(shouldShowR3DocumentChecklist([mkRdv("R3 Placements")])).toBe(true);
    expect(shouldShowR3DocumentChecklist([mkRdv("R3 Immo")])).toBe(false);
    expect(shouldShowR3DocumentChecklist([mkRdv("R2")])).toBe(false);
  });

  it("calcule la progression", () => {
    const progress = countR3ChecklistProgress(
      { pipe_id: 1, items: { der: { received: true }, rio: { received: true } }, updated_at: 1 },
      DEFAULT_PIPE_CHECKLIST_TEMPLATES
    );
    expect(progress).toEqual({ received: 2, total: 6 });
  });
});
