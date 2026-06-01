import { describe, expect, it } from "vitest";
import { resolveSuiviRowDisplay } from "./contact-row-suivi-display";
import type { ContactPriorite } from "./contact-priority";

const urgent1An: ContactPriorite = {
  rowClass: "",
  priorite: 1,
  label: "Suivi > 1 an",
  dotClass: "bg-red-500",
};

describe("resolveSuiviRowDisplay", () => {
  it("masque le libellé priorité si l'étiquette système suivi est déjà affichée", () => {
    const result = resolveSuiviRowDisplay(urgent1An, [
      {
        id: 1,
        contact_id: 42,
        etiquette_id: 1,
        etiquette_nom: "Suivi > 1 an",
        etiquette_couleur: "#f00",
        etiquette_icone: null,
        date_attribution: 1,
        attribue_par: "AUTO",
        email_envoye: false,
        email_date_prevue: null,
        notes: null,
      },
    ]);
    expect(result.showPrioriteLabel).toBe(false);
    expect(result.etiquettesForRow).toHaveLength(1);
  });

  it("masque « Jamais suivi » si l'étiquette système équivalente est affichée", () => {
    const jamaisSuivi: ContactPriorite = {
      rowClass: "",
      priorite: 1,
      label: "Jamais suivi",
      dotClass: "bg-red-500",
    };
    const result = resolveSuiviRowDisplay(jamaisSuivi, [
      {
        id: 2,
        contact_id: 42,
        etiquette_id: 2,
        etiquette_nom: "Jamais suivi",
        etiquette_couleur: "#f00",
        etiquette_icone: null,
        date_attribution: 1,
        attribue_par: "AUTO",
        email_envoye: false,
        email_date_prevue: null,
        notes: null,
      },
    ]);
    expect(result.showPrioriteLabel).toBe(false);
  });

  it("garde le libellé priorité sans étiquette suivi équivalente", () => {
    const result = resolveSuiviRowDisplay(urgent1An, []);
    expect(result.showPrioriteLabel).toBe(true);
  });
});
