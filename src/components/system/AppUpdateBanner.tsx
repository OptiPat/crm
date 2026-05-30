import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppUpdate } from "./app-update-context";

/** Bannière visible tant qu'une MAJ est disponible (même après « Plus tard » sur la popup). */
export function AppUpdateBanner() {
  const { pendingUpdate, openInstallDialog } = useAppUpdate();

  if (!pendingUpdate || import.meta.env.DEV) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2.5"
    >
      <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
        Nouvelle version <strong>{pendingUpdate.version}</strong> disponible — mise à jour en un clic
        (vos données restent sur cet ordinateur).
      </p>
      <Button size="sm" className="gap-2 shrink-0" onClick={openInstallDialog}>
        <Download className="h-4 w-4" />
        Mettre à jour
      </Button>
    </div>
  );
}
