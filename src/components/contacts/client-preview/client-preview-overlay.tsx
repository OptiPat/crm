import { createContext, useContext, type ReactNode } from "react";

const ClientPreviewOverlayPortalContext = createContext<HTMLElement | null>(null);

export function ClientPreviewOverlayPortalProvider({
  portalEl,
  children,
}: {
  portalEl: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <ClientPreviewOverlayPortalContext.Provider value={portalEl}>
      {children}
    </ClientPreviewOverlayPortalContext.Provider>
  );
}

/** Cible de portail pour les modales dans le cadre simulateur CRM. */
export function useClientPreviewOverlayPortal() {
  return useContext(ClientPreviewOverlayPortalContext);
}
