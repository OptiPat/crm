import { describe, expect, it } from "vitest";
import {
  advancementStageFromTimelineEntry,
  buildSuiviPlacementTimelineHints,
  formatTimelineEntryBadgeLabel,
  formatTimelineEntryContenu,
  formatTimelineEntryTitre,
  getPipeTimelineEntryStyle,
  resolveSuiviTimelinePlacementColumn,
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

  it("masque le titre des notes quand il sert de badge", () => {
    expect(
      formatTimelineEntryTitre({
        entry_type: "NOTE",
        titre: "Mail client Box Placement envoyé",
      })
    ).toBeNull();
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
  it("affiche Passage R1 sur un avancement", () => {
    expect(
      formatTimelineEntryBadgeLabel(
        { entry_type: "AVANCEMENT", titre: "R1" },
        { pipeType: "AFFAIRE" }
      )
    ).toBe("Passage R1");
  });

  it("garde Prospection sur la création", () => {
    expect(
      formatTimelineEntryBadgeLabel(
        { entry_type: "CREATION", titre: "Affaire" },
        { pipeType: "AFFAIRE" }
      )
    ).toBe("Prospection");
  });

  it("affiche Création du suivi sur un pipe ACTE_GESTION", () => {
    expect(
      formatTimelineEntryBadgeLabel(
        { entry_type: "CREATION", titre: "Suivi mai 2026" },
        { pipeType: "ACTE_GESTION" }
      )
    ).toBe("Création du suivi");
  });

  it("utilise le titre comme badge pour une note journal", () => {
    expect(
      formatTimelineEntryBadgeLabel({
        entry_type: "NOTE",
        titre: "Réponse Stellium — Conforme",
        contenu: "Détail",
      })
    ).toBe("Réponse Stellium — Conforme");
  });
});

describe("resolveSuiviTimelinePlacementColumn", () => {
  const hints = buildSuiviPlacementTimelineHints([
    {
      pipe_timeline_entry_id: 2,
      stellium_label: "Arbitrage libre",
      product_label: "Evoluvie",
    },
  ]);

  it("mappe les entrées suivi sur les colonnes du tableau Stellium", () => {
    expect(
      resolveSuiviTimelinePlacementColumn({ id: 1, entry_type: "CREATION", titre: null })
    ).toBe("declare");
    expect(
      resolveSuiviTimelinePlacementColumn(
        { id: 2, entry_type: "NOTE", titre: "Arbitrage libre — Evoluvie" },
        hints
      )
    ).toBe("declare");
    expect(
      resolveSuiviTimelinePlacementColumn(
        { id: 99, entry_type: "NOTE", titre: "Arbitrage libre — Evoluvie" },
        hints
      )
    ).toBe("declare");
    expect(
      resolveSuiviTimelinePlacementColumn({
        id: 3,
        entry_type: "NOTE",
        titre: "Réponse Stellium — Conforme",
      })
    ).toBe("first_response");
    expect(
      resolveSuiviTimelinePlacementColumn({
        id: 4,
        entry_type: "NOTE",
        titre: "Mail client Box Placement envoyé",
      })
    ).toBe("client_mail");
  });
});

describe("getPipeTimelineEntryStyle", () => {
  it("aligne les couleurs affaire sur le kanban (RDV R1 = sky)", () => {
    const style = getPipeTimelineEntryStyle(
      {
        id: 1,
        entry_type: "RDV",
        titre: "R1",
        contenu: null,
        occurred_at: 100,
      },
      { pipeType: "AFFAIRE", timelineEntries: [] }
    );
    expect(style.dot).toContain("sky");
  });

  it("aligne les actes suivi sur la colonne Acte (ardoise)", () => {
    const hints = buildSuiviPlacementTimelineHints([
      {
        pipe_timeline_entry_id: 2,
        stellium_label: "Arbitrage libre",
        product_label: "Evoluvie",
      },
    ]);
    const style = getPipeTimelineEntryStyle(
      {
        id: 2,
        entry_type: "NOTE",
        titre: "Arbitrage libre — Evoluvie",
        contenu: null,
        occurred_at: 200,
      },
      { pipeType: "ACTE_GESTION", suiviPlacementHints: hints }
    );
    expect(style.dot).toContain("slate");
  });

  it("utilise l'ardoise par défaut sur le suivi hors workflow Stellium", () => {
    const style = getPipeTimelineEntryStyle(
      {
        id: 5,
        entry_type: "APPEL",
        titre: "Relance",
        contenu: null,
        occurred_at: 300,
      },
      { pipeType: "ACTE_GESTION", suiviPlacementHints: buildSuiviPlacementTimelineHints([]) }
    );
    expect(style.dot).toContain("slate");
  });
});
