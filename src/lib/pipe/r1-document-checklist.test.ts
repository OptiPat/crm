import { describe, expect, it } from "vitest";
import {
  countR1ChecklistProgress,
  isR1ChecklistItemComplete,
  isR1ChecklistPastStage,
  listMissingR1ChecklistLabels,
  shouldShowR1DocumentChecklist,
} from "./r1-document-checklist";
import { DEFAULT_PIPE_CHECKLIST_TEMPLATES } from "./pipe-checklist-template";
import type { PipeR1DocumentChecklist } from "@/lib/api/tauri-pipe-r1-checklist";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";

function baseChecklist(
  overrides: Partial<PipeR1DocumentChecklist> = {}
): PipeR1DocumentChecklist {
  return {
    pipe_id: 1,
    profile_salarie: false,
    profile_chef_entreprise: false,
    profile_retraite: false,
    items: {},
    updated_at: 0,
    ...overrides,
  };
}

describe("r1-document-checklist", () => {
  it("considère amortissement OK si pas de crédit", () => {
    expect(
      isR1ChecklistItemComplete(
        { id: "amortissement_prets", noCreditOption: true },
        { received: false, no_credit: true }
      )
    ).toBe(true);
    expect(
      isR1ChecklistItemComplete(
        { id: "amortissement_prets", noCreditOption: true },
        { received: false, no_credit: false }
      )
    ).toBe(false);
  });

  it("calcule la progression sur les lignes actives du template", () => {
    const progress = countR1ChecklistProgress(
      baseChecklist({
        profile_salarie: true,
        items: {
          avis_imposition: { received: true },
          releves_situation: { received: true },
          amortissement_prets: { received: false, no_credit: true },
        },
      }),
      DEFAULT_PIPE_CHECKLIST_TEMPLATES
    );
    expect(progress).toEqual({ received: 3, total: 5 });
  });

  it("détecte les étapes post-R1", () => {
    expect(isR1ChecklistPastStage("R1")).toBe(false);
    expect(isR1ChecklistPastStage("R2")).toBe(true);
    expect(isR1ChecklistPastStage("GAGNEE")).toBe(true);
  });

  it("affiche la checklist seulement si un RDV R1 est planifié", () => {
    const rdvR1 = {
      id: 1,
      pipe_id: 1,
      entry_type: "RDV",
      titre: "R1",
      contenu: null,
      occurred_at: 100,
      created_at: 100,
    } satisfies PipeTimelineEntryRecord;

    expect(shouldShowR1DocumentChecklist([])).toBe(false);
    expect(shouldShowR1DocumentChecklist([rdvR1])).toBe(true);
    expect(
      shouldShowR1DocumentChecklist([
        {
          id: 2,
          pipe_id: 1,
          entry_type: "NOTE",
          titre: null,
          contenu: "RDV R1 annulé",
          occurred_at: 200,
          created_at: 200,
        },
      ])
    ).toBe(false);
  });

  it("n'affiche pas amortissement manquant si pas de crédit", () => {
    const missing = listMissingR1ChecklistLabels(
      baseChecklist({
        items: {
          avis_imposition: { received: true },
          releves_situation: { received: true },
          amortissement_prets: { received: false, no_credit: true },
        },
      }),
      DEFAULT_PIPE_CHECKLIST_TEMPLATES
    );
    expect(missing).toEqual([]);
  });

  it("amortissement manquant sans noCreditOption explicite dans le template", () => {
    const templates = {
      ...DEFAULT_PIPE_CHECKLIST_TEMPLATES,
      R1: DEFAULT_PIPE_CHECKLIST_TEMPLATES.R1.map((item) =>
        item.id === "amortissement_prets"
          ? { ...item, noCreditOption: undefined }
          : item
      ),
    };
    const missing = listMissingR1ChecklistLabels(
      baseChecklist({
        items: {
          amortissement_prets: { received: false, no_credit: true },
        },
      }),
      templates
    );
    expect(missing).not.toContain("Tableaux d'amortissement des prêts en cours");
  });
});
