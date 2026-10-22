import type { ReactNode } from "react";
import { PageErrorBoundary } from "@/components/layout/PageErrorBoundary";

/** Protège une partie de la page (fenêtre d'import…) : même affichage que les pages. */
export function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <PageErrorBoundary title="Cette partie de la page n'a pas pu s'afficher">{children}</PageErrorBoundary>
  );
}
