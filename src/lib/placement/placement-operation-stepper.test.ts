import { describe, expect, it } from "vitest";
import {
  getPlacementBoardActiveStepId,
  getPlacementOperationStepperSteps,
  placementOperationCanMarkPartnerResent,
} from "@/lib/placement/placement-operation-stepper";

const base = {
  stellium_label: "Arbitrage libre",
  product_label: "Cristalliance Avenir",
  pipe_timeline_entry_id: 10,
  email_received_at: null as number | null,
  non_conforme_at: null as number | null,
  partner_resent_at: null as number | null,
  client_notified_at: null as number | null,
};

function stepState(
  steps: ReturnType<typeof getPlacementOperationStepperSteps>,
  id: string
) {
  return steps.find((s) => s.id === id)?.state;
}

describe("placement-operation-stepper", () => {
  it("brouillon suivi : étape 1 active, pas En attente partenaire", () => {
    const steps = getPlacementOperationStepperSteps({
      ...base,
      status: "PENDING",
      pipe_id: 3,
      pipe_timeline_entry_id: null,
      dismissed_at: null,
    });
    expect(stepState(steps, "declare")).toBe("active");
    expect(stepState(steps, "waiting")).toBe("pending");
  });

  it("toujours 6 étapes dont En attente partenaire", () => {
    const steps = getPlacementOperationStepperSteps({ ...base, status: "PENDING" });
    expect(steps).toHaveLength(6);
    expect(steps.find((s) => s.id === "waiting")?.label).toBe("En attente partenaire");
    expect(stepState(steps, "waiting")).toBe("active");
    expect(stepState(steps, "first_response")).toBe("pending");
    expect(steps.find((s) => s.id === "first_response")?.label).toBe("Réponse partenaire");
  });

  it("étape 1 = libellé acte + produit en sous-titre", () => {
    const steps = getPlacementOperationStepperSteps({ ...base, status: "PENDING" });
    const declare = steps.find((s) => s.id === "declare");
    expect(declare?.label).toBe("Arbitrage libre");
    expect(declare?.sublabel).toBe("Cristalliance Avenir");
  });

  it("versement complémentaire : étape 1 = libellé acte (+ produit)", () => {
    const steps = getPlacementOperationStepperSteps({
      ...base,
      status: "PENDING",
      stellium_label: "Versement complémentaire",
      product_label: "Cristalliance Avenir",
      pipe_timeline_entry_id: null,
      pipe_id: 10,
      dismissed_at: null,
    });
    const declare = steps.find((s) => s.id === "declare");
    expect(declare?.label).toBe("Versement complémentaire");
    expect(declare?.sublabel).toBe("Cristalliance Avenir");
    expect(declare?.state).toBe("active");
  });

  it("chemin direct : 6 étapes, Validé partenaire à l’étape 5", () => {
    const steps = getPlacementOperationStepperSteps({
      ...base,
      status: "CONFORME",
      email_received_at: 1000,
    });
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.id)).toEqual([
      "declare",
      "waiting",
      "first_response",
      "conforme_after_nc",
      "partner_fin",
      "client_mail",
    ]);
    expect(steps.find((s) => s.id === "partner_fin")?.label).toBe("Validé partenaire");
    expect(stepState(steps, "partner_fin")).toBe("done");
    expect(stepState(steps, "waiting")).toBe("done");
    const response = steps.find((s) => s.id === "first_response");
    expect(response?.label).toBe("Conforme");
    expect(stepState(steps, "conforme_after_nc")).toBe("pending");
  });

  it("chemin non conforme : renvoi puis conforme", () => {
    let steps = getPlacementOperationStepperSteps({
      ...base,
      status: "NON_CONFORME",
      non_conforme_at: 500,
      email_received_at: 500,
    });
    const response = steps.find((s) => s.id === "first_response");
    expect(response?.state).toBe("active");
    expect(response?.label).toBe("Non conforme");
    expect(response?.responseNonConforme).toBe(true);
    expect(placementOperationCanMarkPartnerResent({ status: "NON_CONFORME", partner_resent_at: null })).toBe(
      true
    );

    steps = getPlacementOperationStepperSteps({
      ...base,
      status: "NON_CONFORME",
      non_conforme_at: 500,
      partner_resent_at: 600,
      email_received_at: 500,
    });
    expect(stepState(steps, "partner_fin")).toBe("done");
    expect(stepState(steps, "waiting")).toBe("active");
    expect(stepState(steps, "conforme_after_nc")).toBe("active");

    steps = getPlacementOperationStepperSteps({
      ...base,
      status: "CONFORME",
      non_conforme_at: 500,
      partner_resent_at: 600,
      email_received_at: 900,
    });
    expect(stepState(steps, "conforme_after_nc")).toBe("done");
    expect(stepState(steps, "client_mail")).toBe("active");
  });

  it("colonne tableau = dernière étape active du stepper", () => {
    expect(
      getPlacementBoardActiveStepId({
        ...base,
        status: "PENDING",
        pipe_id: 3,
        pipe_timeline_entry_id: null,
        dismissed_at: null,
      })
    ).toBe("declare");
    expect(
      getPlacementBoardActiveStepId({
        ...base,
        status: "PENDING",
      })
    ).toBe("waiting");
    expect(
      getPlacementBoardActiveStepId({
        ...base,
        status: "NON_CONFORME",
        non_conforme_at: 500,
        email_received_at: 500,
      })
    ).toBe("first_response");
    expect(
      getPlacementBoardActiveStepId({
        ...base,
        status: "CONFORME",
        email_received_at: 900,
      })
    ).toBe("client_mail");
  });
});
