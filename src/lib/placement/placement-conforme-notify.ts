import {
  getPlacementOperation,
  type PlacementOperation,
} from "@/lib/api/tauri-box-placement";
import {
  maybeSendPlacementConformeEmailForOperation,
  processPlacementConformeNotificationsByIds,
} from "@/lib/placement/placement-conforme-email";
import { toast } from "sonner";

export async function notifyPlacementConformeClientsAfterScan(
  newConformeIds: number[] | undefined,
  options?: { quiet?: boolean }
): Promise<void> {
  const ids = newConformeIds?.filter((id) => id > 0) ?? [];
  if (ids.length === 0) return;

  const result = await processPlacementConformeNotificationsByIds(
    ids,
    async (id) => {
      try {
        return await getPlacementOperation(id);
      } catch {
        return null;
      }
    },
    options
  );

  if (!options?.quiet && result.sent > 0) {
    toast.success(
      result.sent === 1
        ? "Email client Box Placement envoyé"
        : `${result.sent} emails client Box Placement envoyés`
    );
  }
}

export async function notifyPlacementConformeClientAfterManualMark(
  operation: PlacementOperation
): Promise<void> {
  const outcome = await maybeSendPlacementConformeEmailForOperation(operation);
  if (outcome === "sent") {
    toast.success("Email client Box Placement envoyé");
  }
}

export async function retryPlacementConformeClientEmail(
  operation: PlacementOperation
): Promise<void> {
  const outcome = await maybeSendPlacementConformeEmailForOperation(operation);
  if (outcome === "sent") {
    toast.success("Email client Box Placement envoyé");
  } else if (outcome === "skipped") {
    toast.message("Email client non envoyé — vérifiez le modèle, l'email contact ou la connexion OAuth.");
  }
}
