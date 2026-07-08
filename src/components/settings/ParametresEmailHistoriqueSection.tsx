import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { SETTING_CONTACT_MAIL_AUTO_SYNC } from "@/lib/api/tauri-contact-gmail";
import { getSetting, setSetting } from "@/lib/api/tauri-settings";
import { toast } from "sonner";

export function ParametresEmailHistoriqueSection() {
  const [autoMailSync, setAutoMailSync] = useState(false);

  useEffect(() => {
    getSetting(SETTING_CONTACT_MAIL_AUTO_SYNC)
      .then((v) => setAutoMailSync(v === "1"))
      .catch(() => setAutoMailSync(false));
  }, []);

  return (
    <SettingsPanel
      title="Historique boîte mail (fiche contact)"
      description="Synchronisation légère et incrémentale — n'impacte pas la détection « en attente de réponse » des campagnes."
    >
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/80 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Sync auto à l'ouverture de Relation client</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Une passe incrémentale à l'ouverture de Relation client. Utilisez « Sync Gmail » sur la
            fiche pour l'import complet (5 ans), repris automatiquement par lots jusqu'à la fin.
          </p>
        </div>
        <Switch
          checked={autoMailSync}
          onCheckedChange={(checked) => {
            setAutoMailSync(checked);
            void setSetting(SETTING_CONTACT_MAIL_AUTO_SYNC, checked ? "1" : "0").catch(() =>
              toast.error("Impossible d'enregistrer le réglage")
            );
          }}
        />
      </div>
    </SettingsPanel>
  );
}
