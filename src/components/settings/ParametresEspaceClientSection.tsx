import { SettingsPanel } from "@/components/settings/parametres-ui";
import { useEspaceClientActive } from "@/components/espace-client/EspaceClientProvider";
import { EspaceClientBroadcastPanel } from "@/components/settings/EspaceClientBroadcastPanel";
import { EspaceClientConnexionPanel } from "@/components/settings/EspaceClientConnexionPanel";
import { EspaceClientRdvPanel } from "@/components/settings/EspaceClientRdvPanel";
import { EspaceClientWhatsAppPanel } from "@/components/settings/EspaceClientWhatsAppPanel";
import { EspaceClientSyncPanel } from "@/components/settings/EspaceClientSyncPanel";

/**
 * Réglages de l'espace client : ce qui vaut pour tous les clients.
 *
 * Activer un accès reste dans la fiche. Les campagnes ci-dessous
 * s'adressent à tous les espaces actifs.
 */
export function ParametresEspaceClientSection() {
  const espaceActif = useEspaceClientActive();

  if (!espaceActif) {
    return (
      <SettingsPanel
        title="Espace client"
        description="Portail patrimonial consultable par vos clients."
      >
        <p className="text-sm text-muted-foreground">
          Fonctionnalité non activée sur cette installation.
        </p>
      </SettingsPanel>
    );
  }

  return (
    <div className="space-y-6">
      <EspaceClientConnexionPanel />
      <EspaceClientRdvPanel />
      <EspaceClientWhatsAppPanel />
      <EspaceClientBroadcastPanel />
      <EspaceClientSyncPanel />
    </div>
  );
}
