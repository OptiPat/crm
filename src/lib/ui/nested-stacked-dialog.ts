import { cn } from "@/lib/utils";
import {
  STACKED_DEEP_NESTED_SHEET_Z,
  STACKED_NESTED_SHEET_Z,
} from "@/lib/ui/stacked-sheet-layers";
import {
  preventCustomOverlayOutsideDismiss,
  preventStackedSheetOutsideDismiss,
} from "@/lib/ui/radix-outside-interaction";
import type { PortalLayer } from "@/lib/ui/portal-layer-context";

export type NestedStackDepth = "sheet" | "deep";

export function nestedStackedDialogClass(
  base: string,
  nestedSheet: boolean,
  depth: NestedStackDepth = "sheet"
): string {
  if (!nestedSheet) return base;
  const z = depth === "deep" ? STACKED_DEEP_NESTED_SHEET_Z : STACKED_NESTED_SHEET_Z;
  return cn(base, z);
}

export function nestedStackedPortalLayer(
  nestedSheet: boolean,
  depth: NestedStackDepth = "sheet"
): PortalLayer {
  if (!nestedSheet) return "default";
  return depth === "deep" ? "deepNested" : "nested";
}

export function nestedStackedOutsideHandlers(nestedSheet: boolean) {
  // Toujours actif (pas seulement en sheet empilé) : un overlay maison portalé
  // (ex. confirmation de fusion RIO) doit rester interactif même par-dessus le
  // Dialog par défaut, sinon Radix traite le clic comme « outside » et bloque tout.
  const handler = nestedSheet ? preventStackedSheetOutsideDismiss : preventCustomOverlayOutsideDismiss;
  return {
    onInteractOutside: handler,
    onPointerDownOutside: handler,
  };
}
