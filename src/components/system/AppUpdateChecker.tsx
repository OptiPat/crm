import { useState } from "react";
import { useAppUpdate } from "./app-update-context";

/** Bouton manuel pour Paramètres */
export function CheckForUpdatesButton() {
  const [checking, setChecking] = useState(false);
  const { currentVersion, checkForUpdates, pendingUpdate, openInstallDialog } = useAppUpdate();

  const handleClick = async () => {
    setChecking(true);
    try {
      await checkForUpdates({ silent: false });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-muted-foreground">Version installée : {currentVersion}</span>
      {pendingUpdate && (
        <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
          Mise à jour {pendingUpdate.version} disponible
        </span>
      )}
      <button
        type="button"
        className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
        onClick={handleClick}
        disabled={checking}
      >
        {checking ? "Vérification…" : "Rechercher une mise à jour"}
      </button>
      {pendingUpdate && (
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={openInstallDialog}
        >
          Installer {pendingUpdate.version}
        </button>
      )}
    </div>
  );
}
