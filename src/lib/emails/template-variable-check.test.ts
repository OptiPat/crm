import { describe, expect, it } from "vitest";
import { findUnknownTemplateVariables } from "./template-variable-check";

describe("variables inconnues", () => {
  it("signale les fautes de frappe, majuscules et espaces (non remplacés à l'envoi)", () => {
    expect(
      findUnknownTemplateVariables(
        "Bonjour {{prenom}} {{nom}}, {{cgp_prenom}} — {{prénom}} {{prenon}} {{Prenom}} {{ nom }}"
      )
    ).toEqual(["{{prénom}}", "{{prenon}}", "{{Prenom}}", "{{ nom }}"]);
  });

  it("connaît les variables utilisées par les modèles existants (Stellium, Pipe, SCPI…)", () => {
    const used =
      "{{beneficiary_prenom}} {{bulletin_resume_html}} {{co_contact_et_prenom}} {{date_rdv}} " +
      "{{encours}} {{nets}} {{perf_pct}} {{perf_signed}} {{perf_detail_html_tu}} {{lieu_rdv}} " +
      "{{liste_documents_r3_immo_html}} {{rendement_exceltis}} {{scpi_intro_vous}} {{libelle_client}}";
    expect(findUnknownTemplateVariables(used)).toEqual([]);
  });

  it("laisse les liens d'agenda à leur propre contrôle, mais pas une faute dessus", () => {
    expect(findUnknownTemplateVariables("{{lien_agenda_xyz}} {{lien_calendly}} {{lien_agenda}}")).toEqual(
      []
    );
    expect(findUnknownTemplateVariables("{{lien_agendaa}}")).toEqual(["{{lien_agendaa}}"]);
  });
});
