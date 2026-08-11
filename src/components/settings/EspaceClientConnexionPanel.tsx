import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import { useEspaceClientActive } from "@/components/espace-client/EspaceClientProvider";
import {
  getEspaceClientSyncConfig,
  saveEspaceClientSyncConfig,
} from "@/lib/api/tauri-espace-client";

/**
 * Connexion du CRM au portail : adresse et clé partagée.
 *
 * Ce réglage vaut pour tous les clients — il vivait dans la fiche contact, où
 * il donnait l'illusion d'être propre à la personne affichée.
 */
export function EspaceClientConnexionPanel() {
  const espaceActif = useEspaceClientActive();
  const [portalUrl, setPortalUrl] = useState("");
  const [syncSecret, setSyncSecret] = useState("");
  const [hasSyncSecret, setHasSyncSecret] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);

  const charger = useCallback(async () => {
    try {
      const config = await getEspaceClientSyncConfig();
      setPortalUrl(config.portal_url?.trim() ?? "");
      setHasSyncSecret(config.has_sync_secret);
    } catch {
      setPortalUrl("");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (!espaceActif) {
      setChargement(false);
      return;
    }
    void charger();
  }, [espaceActif, charger]);

  if (!espaceActif) return null;

  const enregistrer = async () => {
    setEnregistrement(true);
    try {
      const config = await saveEspaceClientSyncConfig(
        portalUrl,
        syncSecret.trim() || undefined
      );
      setHasSyncSecret(config.has_sync_secret);
      setSyncSecret("");
      toast.success("Connexion portail enregistrée");
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Enregistrement impossible");
    } finally {
      setEnregistrement(false);
    }
  };

  return (
    <SettingsPanel
      title="Espace client — connexion au portail"
      description="Adresse du portail et clé partagée. La synchronisation d'un client se lance depuis sa fiche."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="parametres-portal-url">URL du portail</Label>
          <Input
            id="parametres-portal-url"
            type="url"
            value={portalUrl}
            onChange={(event) => setPortalUrl(event.target.value)}
            placeholder="https://espace.example.com"
            disabled={chargement || enregistrement}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="parametres-sync-secret">
            Clé de synchronisation
            {hasSyncSecret ? (
              <span className="ml-1 font-normal text-muted-foreground">
                — déjà configurée, laissez vide pour la conserver
              </span>
            ) : null}
          </Label>
          <Input
            id="parametres-sync-secret"
            type="password"
            autoComplete="new-password"
            value={syncSecret}
            onChange={(event) => setSyncSecret(event.target.value)}
            placeholder="Clé partagée CRM ↔ portail"
            disabled={chargement || enregistrement}
          />
          <p className="text-sm text-muted-foreground">
            La même valeur doit figurer dans le fichier de configuration du
            serveur. Elle signe chaque synchronisation.
          </p>
        </div>

        <Button
          type="button"
          disabled={chargement || enregistrement || !portalUrl.trim()}
          onClick={() => void enregistrer()}
        >
          Enregistrer la connexion
        </Button>
      </div>
    </SettingsPanel>
  );
}
