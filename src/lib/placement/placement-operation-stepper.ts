import type { PlacementOperation } from "@/lib/api/tauri-box-placement";
import { PIPE_STAGE_FIELD_LABEL } from "@/lib/pipe/pipe-types";
import { formatStelliumProductForDisplay } from "@/lib/placement/stellium-box-placement-products";
import { placementOperationIsClosed, placementOperationIsUndeclared } from "@/lib/placement/placement-operations-ui";
import { placementOperationIsSuiviDraft } from "@/lib/placement/suivi-placement-draft";

export type PlacementStepperStepState = "done" | "active" | "pending";

export type PlacementStepperStepId =
  | "declare"
  | "waiting"
  | "first_response"
  | "conforme_after_nc"
  | "partner_fin"
  | "client_mail";

export interface PlacementStepperStep {
  id: PlacementStepperStepId;
  label: string;
  state: PlacementStepperStepState;
  /** 2e ligne sous le libellé (produit sur l’étape déclaration). */
  sublabel?: string;
  /** Première réponse Stellium = non conforme (pastille rouge si active). */
  responseNonConforme?: boolean;
}

/** Même intitulé que le stepper affaire (R1 / R2 / R3). */
export const PLACEMENT_STEPPER_FIELD_LABEL = PIPE_STAGE_FIELD_LABEL;

function ts(value: number | null | undefined): boolean {
  return value != null && value > 0;
}

function declareLabels(
  operation: Pick<PlacementOperation, "stellium_label" | "product_label">
): { label: string; sublabel?: string } {
  const acte = operation.stellium_label?.trim() ?? "";
  const produit = formatStelliumProductForDisplay(operation.product_label?.trim() ?? "");
  if (acte && produit) return { label: acte, sublabel: produit };
  return { label: acte || produit || "Opération" };
}

/** 6 étapes fixes, toujours affichées (comme Prospection → R1 → … → Gagnée). */
export function getPlacementOperationStepperSteps(
  operation: Pick<
    PlacementOperation,
    | "status"
    | "stellium_label"
    | "product_label"
    | "non_conforme_at"
    | "partner_resent_at"
    | "client_notified_at"
    | "email_received_at"
    | "pipe_timeline_entry_id"
    | "pipe_id"
    | "dismissed_at"
  >
): PlacementStepperStep[] {
  const declare = declareLabels(operation);

  if (placementOperationIsSuiviDraft(operation)) {
    return [
      {
        id: "declare",
        label: declare.label,
        sublabel: declare.sublabel,
        state: "active",
      },
      { id: "waiting", label: "En attente partenaire", state: "pending" },
      { id: "first_response", label: "Réponse partenaire", state: "pending" },
      { id: "conforme_after_nc", label: "Conforme", state: "pending" },
      { id: "partner_fin", label: "Validé partenaire", state: "pending" },
      { id: "client_mail", label: "Mail client", state: "pending" },
    ];
  }

  const status = operation.status;
  const hadNonConforme = ts(operation.non_conforme_at);
  const partnerResent = ts(operation.partner_resent_at);
  const clientNotified = ts(operation.client_notified_at);
  const firstMailReceived = status !== "PENDING" || ts(operation.email_received_at);
  const isConforme = status === "CONFORME";
  const isNonConforme = status === "NON_CONFORME";
  const isPending = status === "PENDING";
  const pipeTracked =
    operation.pipe_timeline_entry_id != null && operation.pipe_timeline_entry_id > 0;

  const waitingActive =
    isPending || (hadNonConforme && partnerResent && !isConforme);

  /** Libellé conditionnel : neutre en attente, puis Conforme ou Non conforme selon le mail. */
  const firstResponseLabel = (() => {
    if (!firstMailReceived) return "Réponse partenaire";
    if (hadNonConforme || isNonConforme) return "Non conforme";
    return "Conforme";
  })();

  const firstResponseState: PlacementStepperStepState = (() => {
    if (!firstMailReceived) return "pending";
    if (isNonConforme && !partnerResent) return "active";
    return "done";
  })();

  const firstResponseIsNonConforme =
    firstMailReceived && (isNonConforme || (isConforme && hadNonConforme));

  const conformeAfterNcState: PlacementStepperStepState = (() => {
    if (!hadNonConforme) return "pending";
    if (isConforme) return "done";
    if (partnerResent && isNonConforme) return "active";
    return "pending";
  })();

  const partnerFinLabel = hadNonConforme ? "Renvoyé partenaire" : "Validé partenaire";

  const partnerFinState: PlacementStepperStepState = (() => {
    if (hadNonConforme) {
      if (isConforme) return "done";
      if (partnerResent) return "done";
      if (isNonConforme) return "active";
      return "pending";
    }
    if (isConforme) return "done";
    return "pending";
  })();

  const clientMailState: PlacementStepperStepState = (() => {
    if (!isConforme) return "pending";
    if (!pipeTracked) return "pending";
    if (clientNotified) return "done";
    return "active";
  })();

  const waitingState: PlacementStepperStepState = waitingActive
    ? "active"
    : firstMailReceived || isConforme
      ? "done"
      : "pending";

  return [
    {
      id: "declare",
      label: declare.label,
      sublabel: declare.sublabel,
      state: "done",
    },
    {
      id: "waiting",
      label: "En attente partenaire",
      state: waitingState,
    },
    {
      id: "first_response",
      label: firstResponseLabel,
      state: firstResponseState,
      responseNonConforme: firstResponseIsNonConforme,
    },
    {
      id: "conforme_after_nc",
      label: "Conforme",
      state: conformeAfterNcState,
    },
    {
      id: "partner_fin",
      label: partnerFinLabel,
      state: partnerFinState,
    },
    {
      id: "client_mail",
      label: "Mail client",
      state: clientMailState,
    },
  ];
}

export function placementOperationCanMarkPartnerResent(
  operation: Pick<PlacementOperation, "status" | "partner_resent_at">
): boolean {
  return operation.status === "NON_CONFORME" && !ts(operation.partner_resent_at);
}

export function placementOperationShowsStepper(
  operation: Pick<PlacementOperation, "status" | "client_notified_at" | "dismissed_at">
): boolean {
  return !placementOperationIsClosed(operation);
}

export type PlacementBoardStepInput = Pick<
  PlacementOperation,
  | "status"
  | "stellium_label"
  | "product_label"
  | "non_conforme_at"
  | "partner_resent_at"
  | "client_notified_at"
  | "email_received_at"
  | "pipe_timeline_entry_id"
  | "pipe_id"
  | "dismissed_at"
>;

/** Colonne tableau = étape active du stepper (6 colonnes comme la timeline). */
export function getPlacementBoardActiveStepId(
  operation: PlacementBoardStepInput
): PlacementStepperStepId | null {
  if (!placementOperationShowsStepper(operation)) return null;

  if (placementOperationIsSuiviDraft(operation)) {
    return "declare";
  }

  if (
    placementOperationIsUndeclared(operation) &&
    operation.status === "PENDING" &&
    !ts(operation.email_received_at)
  ) {
    return "declare";
  }

  const steps = getPlacementOperationStepperSteps(operation);

  // Non conforme : colonne Réponse partenaire (étape 3), pas Partenaire
  const ncResponse = steps.find(
    (s) => s.id === "first_response" && s.state === "active" && s.responseNonConforme
  );
  if (ncResponse) return "first_response";

  let lastActive: PlacementStepperStepId | null = null;
  for (const step of steps) {
    if (step.state === "active") lastActive = step.id;
  }
  if (lastActive) return lastActive;

  if (operation.status === "CONFORME") {
    return "client_mail";
  }

  return null;
}
