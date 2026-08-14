import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import {
  getEspaceClientSyncConfig,
  saveEspaceClientWhatsApp,
} from "@/lib/api/tauri-espace-client";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { hasMessagingPhone } from "@/lib/contacts/birthday-outreach";

/**
 * Numéro WhatsApp du cabinet, ouvert par le bouton flottant de l'espace client.
 *
 * Un clic ouvre l'application sur téléphone, WhatsApp Web ou l'appli bureau
 * sur ordinateur — pas de chat intégré, pas d'API Business.
 */
export function EspaceClientWhatsAppPanel() {
  const [telephone, setTelephone] = useState("");
  const [enregistre, setEnregistre] = useState("");
  const [cabinetMobile, setCabinetMobile] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState("");
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [cgp, sync] = await Promise.all([
        getCgpConfig(),
        getEspaceClientSyncConfig(),
      ]);
      const actuel = sync.whatsapp_telephone?.trim() ?? "";
      setTelephone(actuel);
      setEnregistre(actuel);
      setPortalUrl(sync.portal_url?.trim() ?? "");
      const cgpTel = cgp.telephone?.trim() ?? "";
      setCabinetMobile(hasMessagingPhone(cgpTel) ? cgpTel : null);
    } catch {
      setTelephone("");
      setEnregistre("");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const enregistrer = async () => {
    setEnregistrement(true);
    try {
      const config = await saveEspaceClientWhatsApp(telephone);
      const actuel = config.whatsapp_telephone?.trim() ?? "";
      setTelephone(actuel);
      setEnregistre(actuel);
      toast.success(
        actuel
          ? "Bouton WhatsApp enregistré"
          : "Bouton WhatsApp retiré"
      );
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Enregistrement impossible");
    } finally {
      setEnregistrement(false);
    }
  };

  const sale = telephone.trim() !== enregistre.trim();

  return (
    <SettingsPanel
      title="Bouton WhatsApp"
      description="Logo flottant en bas de l'espace client : un clic ouvre une discussion avec vous."
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="espace-whatsapp-tel">Mobile WhatsApp du cabinet</Label>
          <Input
            id="espace-whatsapp-tel"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="06 12 34 56 78"
            value={telephone}
            onChange={(event) => setTelephone(event.target.value)}
            disabled={chargement || !portalUrl}
          />
        </div>

        {cabinetMobile && telephone.trim() !== cabinetMobile ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            disabled={chargement || !portalUrl}
            onClick={() => setTelephone(cabinetMobile)}
          >
            Utiliser le mobile du cabinet ({cabinetMobile})
          </button>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => void enregistrer()}
            disabled={chargement || enregistrement || !portalUrl || !sale}
          >
            {enregistrement ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {portalUrl
            ? "Laissez vide pour masquer le bouton. Le changement atteint vos clients à la prochaine synchronisation."
            : "Renseignez d'abord l'adresse du portail ci-dessus."}
        </p>
      </div>
    </SettingsPanel>
  );
}
