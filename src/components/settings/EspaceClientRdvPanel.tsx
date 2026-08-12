import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import {
  getEspaceClientSyncConfig,
  saveEspaceClientSyncConfig,
} from "@/lib/api/tauri-espace-client";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { normalizeAgendaLinks, type AgendaLink } from "@/lib/emails/agenda-links";

/**
 * Lien ouvert par le bouton permanent de l'espace client.
 *
 * Un seul, choisi par le conseiller : faire trancher le client entre « bilan
 * annuel » et « point rapide » lui demanderait une décision qui n'est pas la
 * sienne. Les échéances, elles, désignent chacune leur propre lien.
 */
export function EspaceClientRdvPanel() {
  const [liens, setLiens] = useState<AgendaLink[]>([]);
  const [lienId, setLienId] = useState("");
  const [portalUrl, setPortalUrl] = useState("");
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    try {
      const [cgp, sync] = await Promise.all([
        getCgpConfig(),
        getEspaceClientSyncConfig(),
      ]);
      setLiens(normalizeAgendaLinks(cgp));
      setLienId(sync.rdv_lien_id?.trim() ?? "");
      setPortalUrl(sync.portal_url?.trim() ?? "");
    } catch {
      setLiens([]);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const enregistrer = async (valeur: string) => {
    const precedent = lienId;
    setLienId(valeur);
    try {
      await saveEspaceClientSyncConfig(portalUrl, undefined, valeur);
      toast.success("Bouton de rendez-vous enregistré");
    } catch (error) {
      setLienId(precedent);
      toast.error(invokeErrorMessage(error) || "Enregistrement impossible");
    }
  };

  return (
    <SettingsPanel
      title="Bouton « Prendre rendez-vous »"
      description="Lequel de vos liens d'agenda s'ouvre depuis l'espace client."
    >
      <div className="space-y-3">
        {liens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun lien d&apos;agenda. Ajoutez-en un dans Agenda &amp; RDV.
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="espace-rdv-lien">Lien proposé au client</Label>
            <select
              id="espace-rdv-lien"
              value={lienId}
              onChange={(event) => void enregistrer(event.target.value)}
              disabled={chargement || !portalUrl}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Aucun bouton</option>
              {liens.map((lien) => (
                <option key={lien.id} value={lien.id}>
                  {lien.label || lien.id}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {portalUrl
            ? "Vos échéances peuvent désigner un autre lien, au cas par cas. Le changement atteint vos clients à la prochaine synchronisation."
            : "Renseignez d'abord l'adresse du portail ci-dessus."}
        </p>
      </div>
    </SettingsPanel>
  );
}
