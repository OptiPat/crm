import { SettingsPanel } from "@/components/settings/parametres-ui";
import { ArbitrageFicheTemplatesManager } from "@/components/settings/ArbitrageFicheTemplatesManager";

export function ParametresFichesConseilSection() {
  return (
    <SettingsPanel
      title="Fiches conseil"
      description="Modèles PDF pré-remplis (arbitrage et modification des versements programmés). Le CRM complète nom, prénom et n° de contrat à la génération."
    >
      <div className="space-y-8">
        <section className="space-y-4">
          <p className="text-sm font-medium">Arbitrage</p>
          <div className="space-y-6">
            <ArbitrageFicheTemplatesManager
              embedded
              productKind="AV"
              title="Assurance vie"
            />
            <ArbitrageFicheTemplatesManager
              embedded
              productKind="PER"
              title="PER"
            />
          </div>
        </section>

        <section className="space-y-4">
          <p className="text-sm font-medium">Modification versements programmés</p>
          <div className="space-y-6">
            <ArbitrageFicheTemplatesManager
              embedded
              templateFamily="VP_MODIFICATION"
              productKind="AV"
              title="Assurance vie"
              emptyHint="Aucun modèle AV — requis pour la fiche conseil « Versements programmés : Modification » sur le pipe."
            />
            <ArbitrageFicheTemplatesManager
              embedded
              templateFamily="VP_MODIFICATION"
              productKind="PER"
              title="PER"
              emptyHint="Aucun modèle PER — requis pour la fiche conseil « Versements programmés : Modification » sur le pipe."
            />
          </div>
        </section>
      </div>
    </SettingsPanel>
  );
}
