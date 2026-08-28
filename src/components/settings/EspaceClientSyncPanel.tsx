import { useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import { useEspaceClientActive } from "@/components/espace-client/EspaceClientProvider";
import {
  importAllEspaceDepots,
  pushAllEspaceClients,
} from "@/lib/api/tauri-espace-client";
import { formatEspaceImportSummaryParts } from "@/lib/espace-client/espace-client-format";
import { notifyDocumentsChanged } from "@/lib/documents/document-events";

/**
 * Synchronisation de tous les clients dont l'accès est actif.
 *
 * Le portail n'affiche que la photo envoyée par le CRM : après une
 * modification qui vaut pour tout le monde — bouton de rendez-vous, mise à
 * jour du logiciel —, il faut la renvoyer à chacun.
 */
export function EspaceClientSyncPanel() {
  const espaceActif = useEspaceClientActive();
  const [enCours, setEnCours] = useState(false);
  const [dernier, setDernier] = useState<string | null>(null);
  const [importEnCours, setImportEnCours] = useState(false);
  const [dernierImport, setDernierImport] = useState<string | null>(null);

  if (!espaceActif) return null;

  const synchroniser = async () => {
    setEnCours(true);
    try {
      const resultat = await pushAllEspaceClients();
      if (resultat.total === 0) {
        setDernier("Aucun client avec un accès actif.");
        toast.info("Aucun client à synchroniser");
      } else if (resultat.echecs.length === 0) {
        setDernier(`${resultat.reussis} client(s) synchronisé(s).`);
        toast.success(`${resultat.reussis} client(s) synchronisé(s)`);
      } else {
        setDernier(
          `${resultat.reussis} sur ${resultat.total} — échecs : ${resultat.echecs.join(" ; ")}`
        );
        toast.warning(
          `${resultat.reussis} sur ${resultat.total} synchronisés, ${resultat.echecs.length} en échec`
        );
      }
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Synchronisation impossible");
    } finally {
      setEnCours(false);
    }
  };

  const importer = async () => {
    setImportEnCours(true);
    try {
      const resultat = await importAllEspaceDepots();
      if (resultat.imported > 0) {
        notifyDocumentsChanged();
      }
      const parts = formatEspaceImportSummaryParts(resultat);
      if (resultat.total === 0) {
        setDernierImport("Aucun client avec un accès actif.");
        toast.info("Aucun client à importer");
      } else if (parts.length > 0 && resultat.echecs.length === 0) {
        const resume = `${resultat.reussis} client(s) · ${parts.join(" · ")}`;
        setDernierImport(resume);
        toast.success(resume);
      } else if (parts.length === 0 && resultat.echecs.length === 0) {
        setDernierImport("Aucune saisie en attente sur le portail.");
        toast.message("Aucune saisie en attente sur le portail");
      } else {
        const resume = [
          `${resultat.reussis} sur ${resultat.total}`,
          ...parts,
          resultat.echecs.length > 0
            ? `échecs : ${resultat.echecs.join(" ; ")}`
            : null,
        ]
          .filter(Boolean)
          .join(" — ");
        setDernierImport(resume);
        toast.warning(
          `${resultat.reussis} sur ${resultat.total} importés, ${resultat.echecs.length} en échec`
        );
      }
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Import impossible");
    } finally {
      setImportEnCours(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsPanel
        title="Synchroniser tous les clients"
        description="Renvoie à chaque client dont l'accès est actif la version à jour de son espace."
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            À lancer après avoir changé un réglage commun. Les échéances jamais
            annoncées déclencheront leur email au passage — évitez donc les
            horaires nocturnes.
          </p>

          <Button
            type="button"
            disabled={enCours || importEnCours}
            onClick={() => void synchroniser()}
          >
            {enCours ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Synchroniser tous les clients
          </Button>

          {dernier ? (
            <p className="text-sm text-muted-foreground">{dernier}</p>
          ) : null}
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Importer saisies clients"
        description="Ramène dans le CRM ce que les clients ont déclaré ou déposé sur leur espace."
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Documents, nouveaux avoirs, encours et retraits — pour tous les
            accès actifs. Le bouton fiche reste utile pour un client à la fois.
          </p>

          <Button
            type="button"
            disabled={enCours || importEnCours}
            onClick={() => void importer()}
          >
            {importEnCours ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Importer saisies clients
          </Button>

          {dernierImport ? (
            <p className="text-sm text-muted-foreground">{dernierImport}</p>
          ) : null}
        </div>
      </SettingsPanel>
    </div>
  );
}
