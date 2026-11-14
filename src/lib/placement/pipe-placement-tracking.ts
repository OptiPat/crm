import {
  createPlacementOperation,
  getPlacementOperation,
  listPlacementOperationsForPipe,
  notifyPlacementOperationsChanged,
  type PlacementOperation,
  type PlacementOperationType,
} from "@/lib/api/tauri-box-placement";
import { getPipeById, setPipeStage, type PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import {
  PLACEMENT_PARTENAIRE_TIMELINE_ENTRY_TYPE,
  placementOperationTypeForPartenaireJournal,
} from "@/lib/placement/pipe-placement-partenaire-types";
import {
  isNouvelleSouscriptionAffaire,
  isVersementComplementaireAffaire,
  VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
} from "@/lib/pipe/pipe-suivi";
import { datetimeLocalToUnix, unixToDatetimeLocalInput } from "@/lib/pipe/pipe-timeline-types";
import { inferTypeProduitFromStelliumProductLabel } from "@/lib/pipe/remuneration-type-produit";

export async function createPlacementFromPipeJournal(options: {
  contactId: number;
  pipeId: number;
  pipeTimelineEntryId: number;
  operationType: PlacementOperationType | string;
  stelliumLabel?: string | null;
  productLabel?: string | null;
}): Promise<void> {
  await createPlacementOperation({
    contact_id: options.contactId,
    pipe_id: options.pipeId,
    pipe_timeline_entry_id: options.pipeTimelineEntryId,
    operation_type: options.operationType,
    stellium_label: options.stelliumLabel ?? null,
    product_label: options.productLabel ?? null,
  });
  notifyPlacementOperationsChanged();
}

/** Versement auto uniquement si l'affaire enfant est rattachée à un Suivi (pas à une autre affaire). */
export function shouldTrackVersementAffaireOnPipeCreate(
  pipe: Pick<PipeRecord, "pipe_type" | "parent_pipe_id" | "contact_id">,
  parentPipeType: string | null | undefined
): boolean {
  return (
    pipe.pipe_type === "AFFAIRE" &&
    pipe.parent_pipe_id != null &&
    pipe.parent_pipe_id > 0 &&
    pipe.contact_id > 0 &&
    parentPipeType === "ACTE_GESTION"
  );
}

/** Brouillon VERSEMENT sur l'affaire enfant (étape 1 du stepper — confirmé via Stellium). */
export async function trackVersementAffaireOnPipeCreate(
  pipe: PipeRecord,
  options?: { productLabel?: string | null; montantCentimes?: number | null }
): Promise<boolean> {
  if (!pipe.parent_pipe_id || pipe.parent_pipe_id <= 0) return false;
  const parent = await getPipeById(pipe.parent_pipe_id);
  if (!shouldTrackVersementAffaireOnPipeCreate(pipe, parent.pipe_type)) {
    return false;
  }
  const montantCentimes = options?.montantCentimes;
  if (!montantCentimes || montantCentimes <= 0) {
    return false;
  }
  const productLabel = options?.productLabel?.trim() || null;
  const typeProduit = productLabel
    ? inferTypeProduitFromStelliumProductLabel(productLabel)
    : null;
  await createPlacementOperation({
    contact_id: pipe.contact_id,
    pipe_id: pipe.id,
    operation_type: "VERSEMENT",
    stellium_label: VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
    product_label: productLabel,
    montant_centimes: montantCentimes,
    type_produit: typeProduit,
  });
  notifyPlacementOperationsChanged();
  return true;
}

function isPlacementConformeAndClientNotified(
  op: Pick<PlacementOperation, "status" | "client_notified_at">
): boolean {
  return op.status === "CONFORME" && op.client_notified_at != null && op.client_notified_at > 0;
}

/**
 * Affaire enfant de Suivi : Gagnée uniquement après mail client (étape 6).
 * - versement complémentaire : dès que le versement est notifié ;
 * - nouvelle souscription : quand toutes les souscriptions actives de l'affaire le sont.
 */
export async function maybeAdvanceVersementAffaireToGagneeAfterClientMail(
  operation: Pick<PlacementOperation, "id" | "pipe_id" | "status">
): Promise<void> {
  if (!operation.pipe_id || operation.pipe_id <= 0) return;
  if (operation.status !== "CONFORME") return;
  const op = await getPlacementOperation(operation.id);
  if (!isPlacementConformeAndClientNotified(op)) return;
  const pipe = await getPipeById(operation.pipe_id);
  if (pipe.stage === "GAGNEE") return;
  if (isVersementComplementaireAffaire(pipe)) {
    await setPipeStage(operation.pipe_id, "GAGNEE");
    return;
  }
  await maybeAdvanceNouvelleSouscriptionAffaireToGagnee(pipe);
}

/**
 * Affaire « Nouvelle souscription » : Gagnée quand toutes les souscriptions actives (hors retirées /
 * archivées) sont conformes et notifiées au client. Réévaluée aussi après un retrait d'acte.
 * Renvoie `true` si l'affaire vient de passer en Gagnée.
 */
export async function maybeAdvanceNouvelleSouscriptionAffaireToGagnee(
  pipe: Pick<PipeRecord, "id" | "pipe_type" | "parent_pipe_id" | "titre" | "stage">
): Promise<boolean> {
  if (pipe.stage === "GAGNEE" || !isNouvelleSouscriptionAffaire(pipe)) return false;
  const active = (await listPlacementOperationsForPipe(pipe.id)).filter(
    (row) => !row.dismissed_at && !row.archived_at
  );
  if (active.length === 0 || !active.every(isPlacementConformeAndClientNotified)) return false;
  await setPipeStage(pipe.id, "GAGNEE");
  return true;
}

export async function journalAffairePartenairePlacement(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe: Pick<PipeRecord, "id" | "contact_id">;
  journalEntryType: keyof typeof PLACEMENT_PARTENAIRE_TIMELINE_ENTRY_TYPE;
  contenu?: string | null;
}): Promise<void> {
  if (options.pipe.contact_id <= 0) {
    throw new Error("Contact requis pour le suivi partenaire");
  }
  const entryType = PLACEMENT_PARTENAIRE_TIMELINE_ENTRY_TYPE[options.journalEntryType];
  const operationType = placementOperationTypeForPartenaireJournal(options.journalEntryType);
  const occurredAtUnix = datetimeLocalToUnix(unixToDatetimeLocalInput());
  const entry = await options.timeline.addEntry({
    entry_type: entryType,
    titre: options.journalEntryType === "VERSEMENT" ? "Versement partenaire" : "Souscription partenaire",
    contenu: options.contenu?.trim() || null,
    occurred_at: occurredAtUnix,
  });
  await createPlacementFromPipeJournal({
    contactId: options.pipe.contact_id,
    pipeId: options.pipe.id,
    pipeTimelineEntryId: entry.id,
    operationType,
  });
}
