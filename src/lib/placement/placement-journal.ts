import { createPipeTimelineEntry } from "@/lib/api/tauri-pipe-timeline";
import type { PlacementOperation } from "@/lib/api/tauri-box-placement";

function placementActeProduitLabel(
  operation: Pick<PlacementOperation, "stellium_label" | "product_label">
): string {
  const acte = operation.stellium_label?.trim();
  const produit = operation.product_label?.trim();
  if (acte && produit) return `${acte} — ${produit}`;
  return acte || produit || "Opération";
}

/** Trace dans l'historique pipe après envoi du mail client Box Placement. */
export async function journalPlacementClientEmailSent(
  operation: Pick<PlacementOperation, "pipe_id" | "stellium_label" | "product_label">
): Promise<void> {
  const pipeId = operation.pipe_id;
  if (pipeId == null || pipeId <= 0) return;

  await createPipeTimelineEntry({
    pipe_id: pipeId,
    entry_type: "NOTE",
    titre: "Mail client Box Placement envoyé",
    contenu: placementActeProduitLabel(operation),
    occurred_at: Math.floor(Date.now() / 1000),
  });
}
