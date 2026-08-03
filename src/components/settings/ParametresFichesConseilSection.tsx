import { SettingsPanel } from "@/components/settings/parametres-ui";
import { ArbitrageFicheTemplatesManager } from "@/components/settings/ArbitrageFicheTemplatesManager";
import { FicheConseilRedactionPresetsManager } from "@/components/settings/FicheConseilRedactionPresetsManager";

export function ParametresFichesConseilSection() {
  return (
    <SettingsPanel
      title="Fiches conseil"
      description="Modèles PDF et textes de rédaction pour les fiches conseil arbitrage."
    >
      <div className="space-y-8">
        <section className="space-y-4">
          <p className="text-sm font-medium">Textes arbitrage</p>
          <div className="space-y-8">
            <FicheConseilRedactionPresetsManager
              productKind="AV"
              title="Assurance vie"
              description="Motif de l'opération et supports désinvestis / investis."
            />
            <FicheConseilRedactionPresetsManager
              productKind="PER"
              title="PER"
              description="Allocation d'actifs et opération (type, montant…)."
            />
          </div>
        </section>

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
          <p className="text-sm font-medium">Mise en place versements programmés</p>
          <div className="space-y-6">
            <ArbitrageFicheTemplatesManager
              embedded
              templateFamily="VP_MISE_EN_PLACE"
              productKind="AV"
              title="Assurance vie"
              emptyHint="Aucun modèle AV — requis pour la fiche conseil « Versements programmés : Mise en place » sur le pipe."
            />
            <ArbitrageFicheTemplatesManager
              embedded
              templateFamily="VP_MISE_EN_PLACE"
              productKind="PER"
              title="PER"
              emptyHint="Aucun modèle PER — requis pour la fiche conseil « Versements programmés : Mise en place » sur le pipe."
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
