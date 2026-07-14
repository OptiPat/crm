import type { PlacementOperation } from "@/lib/api/tauri-box-placement";
import { escapeHtmlText, sanitizeEmailHeaderValue } from "@/lib/emails/template-email-html";
import { placementOperationTypeLabel } from "@/lib/placement/placement-operations-ui";
import { formatStelliumProductForDisplay } from "@/lib/placement/stellium-box-placement-products";

const PARIS_TZ = "Europe/Paris";

export function formatPlacementConformeEmailDate(receivedAtUnix?: number | null): string {
  if (receivedAtUnix == null || receivedAtUnix <= 0) return "";
  return new Date(receivedAtUnix * 1000).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: PARIS_TZ,
  });
}

export function buildPlacementConformeEmailExtraVariables(
  operation: Pick<
    PlacementOperation,
    "operation_type" | "product_label" | "stellium_label" | "email_received_at"
  >
): Record<string, string> {
  return {
    type_operation: placementOperationTypeLabel(operation.operation_type),
    produit: formatStelliumProductForDisplay(operation.product_label?.trim() ?? ""),
    libelle_stellium: operation.stellium_label?.trim() ?? "",
    date_operation: formatPlacementConformeEmailDate(operation.email_received_at),
  };
}

/** Variables pour envoi : champs issus du mail Stellium échappés (corps HTML). */
export function buildPlacementConformeEmailExtraVariablesForSend(
  operation: Pick<
    PlacementOperation,
    "operation_type" | "product_label" | "stellium_label" | "email_received_at"
  >
): Record<string, string> {
  const base = buildPlacementConformeEmailExtraVariables(operation);
  return {
    ...base,
    produit: escapeHtmlText(sanitizeEmailHeaderValue(base.produit)),
    libelle_stellium: escapeHtmlText(sanitizeEmailHeaderValue(base.libelle_stellium)),
  };
}
