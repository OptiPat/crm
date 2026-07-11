import { describe, expect, it } from "vitest";
import {
  advancementStageFromTimelineEntry,
  formatTimelineEntryBadgeLabel,
  formatTimelineEntryContenu,
  formatTimelineEntryTitre,
  timelineStageFromEntry,
} from "./pipe-timeline-display";

describe("timelineStageFromEntry", () => {
  it("fixe Prospection à la création d'une affaire", () => {
    expect(
      timelineStageFromEntry({ entry_type: "CREATION", titre: "Test" }, { pipeType: "AFFAIRE" })
    ).toBe("PROSPECTION");
  });

  it("lit le code étape sur un avancement", () => {
    expect(
      timelineStageFromEntry({ entry_type: "AVANCEMENT", titre: "R1" })
    ).toBe("R1");
  });

  it("parse l'ancien libellé d'avancement", () => {
    expect(
      advancementStageFromTimelineEntry({
        entry_type: "AVANCEMENT",
        titre: "Avancement passé à R2",
      })
    ).toBe("R2");
  });
});

describe("formatTimelineEntryTitre", () => {
  it("masque le titre des jalons d'étape", () => {
    expect(formatTimelineEntryTitre({ entry_type: "CREATION", titre: "Test" })).toBeNull();
    expect(formatTimelineEntryTitre({ entry_type: "AVANCEMENT", titre: "R1" })).toBeNull();
  });

  it("conserve le titre des interactions", () => {
    expect(formatTimelineEntryTitre({ entry_type: "APPEL", titre: "Relance" })).toBe("Relance");
  });
});

describe("formatTimelineEntryContenu", () => {
  it("affiche les notes propres à l'entrée", () => {
    expect(
      formatTimelineEntryContenu({ contenu: "Compte-rendu R1" })
    ).toBe("Compte-rendu R1");
  });
});

describe("formatTimelineEntryBadgeLabel", () => {
  it("affiche l'étape sur un jalon", () => {
    expect(
      formatTimelineEntryBadgeLabel(
        { entry_type: "AVANCEMENT", titre: "R1" },
        { pipeType: "AFFAIRE" }
      )
    ).toBe("R1");
  });
});
