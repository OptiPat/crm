import { useEffect, useState } from "react";
import { SettingsLoading } from "@/components/settings/parametres-ui";
import { ComptaConfigPanel } from "@/components/compta/ComptaConfigPanel";
import { getComptaConfig, type ComptaConfig } from "@/lib/api/tauri-compta";

export function ParametresComptaSection() {
  const now = new Date();
  const [config, setConfig] = useState<ComptaConfig | null>(null);

  useEffect(() => {
    void getComptaConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  if (!config) {
    return <SettingsLoading />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Comptabilité</h2>
        <p className="text-sm text-muted-foreground">
          Adresse de départ, barème km et dossier racine Google Drive pour la sync.
        </p>
      </div>
      <ComptaConfigPanel
        config={config}
        year={now.getFullYear()}
        month={now.getMonth() + 1}
        defaultOpen
        onSaved={setConfig}
      />
    </div>
  );
}
