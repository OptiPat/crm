import { useCallback, useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import { useEspaceClientActive } from "@/components/espace-client/EspaceClientProvider";
import {
  getEspaceClientSyncConfig,
  saveEspaceClientSyncConfig,
} from "@/lib/api/tauri-espace-client";
import type { AgendaLink } from "@/lib/emails/agenda-links";

interface EspaceClientRdvSettingProps {
  links: AgendaLink[];
}

/**
 * Choix du lien ouvert par le bouton permanent de l'espace client.
 *
 * Ce réglage vit à côté des liens d'agenda plutôt que dans une fiche contact :
 * il vaut pour tous les clients. Un seul lien, choisi par le conseiller — faire
 * trancher le client entre deux types de rendez-vous n'est pas sa décision.
 */
export function EspaceClientRdvSetting({ links }: EspaceClientRdvSettingProps) {
  const espaceActif = useEspaceClientActive();
  const [lienId, setLienId] = useState("");
  const [portalUrl, setPortalUrl] = useState("");
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    try {
      const config = await getEspaceClientSyncConfig();
      setLienId(config.rdv_lien_id?.trim() ?? "");
      setPortalUrl(config.portal_url?.trim() ?? "");
    } catch {
      setLienId("");
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
    <div className="space-y-2 rounded-xl border border-border/80 bg-background p-4 shadow-sm">
      <Label className="text-base flex items-center gap-1.5">
        <CalendarPlus className="h-4 w-4 text-muted-foreground" />
        Bouton « Prendre rendez-vous » de l'espace client
      </Label>
      <p className="text-sm text-muted-foreground">
        Lequel de vos liens s'ouvre quand un client clique sur le bouton de son
        espace. Vos échéances peuvent en désigner un autre, au cas par cas.
      </p>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ajoutez d&apos;abord un lien ci-dessus.
        </p>
      ) : (
        <select
          value={lienId}
          onChange={(event) => void enregistrer(event.target.value)}
          disabled={chargement}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Aucun bouton</option>
          {links.map((lien) => (
            <option key={lien.id} value={lien.id}>
              {lien.label || lien.id}
            </option>
          ))}
        </select>
      )}

      <p className="text-sm text-muted-foreground">
        Le changement atteint vos clients à la prochaine synchronisation.
      </p>
    </div>
  );
}
