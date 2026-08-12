import { SettingsPanel } from "@/components/settings/parametres-ui";
import { useEspaceClientActive } from "@/components/espace-client/EspaceClientProvider";
import { EspaceClientConnexionPanel } from "@/components/settings/EspaceClientConnexionPanel";
import { EspaceClientRdvPanel } from "@/components/settings/EspaceClientRdvPanel";
import { EspaceClientSyncPanel } from "@/components/settings/EspaceClientSyncPanel";

/**
 * Réglages de l'espace client : ce qui vaut pour tous les clients.
 *
 * Ce qui appartient à une personne — activer son accès, lui écrire une
 * échéance, lui demander un document — reste dans sa fiche.
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
      <EspaceClientSyncPanel />
    </div>
  );
}
