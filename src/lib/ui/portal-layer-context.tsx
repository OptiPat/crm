import { createContext, useContext, type ReactNode } from "react";
import {
  STACKED_DEEP_NESTED_POPOVER_Z,
  STACKED_NESTED_POPOVER_Z,
  STACKED_PORTAL_Z,
} from "@/lib/ui/stacked-sheet-layers";

export type PortalLayer = "default" | "stacked" | "nested" | "deepNested";

const PortalLayerContext = createContext<PortalLayer>("default");

export function PortalLayerProvider({
  layer,
  children,
}: {
  layer: PortalLayer;
  children: ReactNode;
}) {
  return (
    <PortalLayerContext.Provider value={layer}>{children}</PortalLayerContext.Provider>
  );
}

/** z-index des portails Radix (Select, Popover) selon le calque sheet/dialog parent. */
export function usePortalLayer(): PortalLayer {
  return useContext(PortalLayerContext);
}

export function usePortalLayerZ(): string {
  const layer = usePortalLayer();
  if (layer === "deepNested") return STACKED_DEEP_NESTED_POPOVER_Z;
  if (layer === "nested") return STACKED_NESTED_POPOVER_Z;
  if (layer === "stacked") return STACKED_PORTAL_Z;
  return "z-50";
}
