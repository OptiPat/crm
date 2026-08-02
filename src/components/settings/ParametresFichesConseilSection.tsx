import { SettingsPanel } from "@/components/settings/parametres-ui";
import { ArbitrageFicheTemplatesManager } from "@/components/settings/ArbitrageFicheTemplatesManager";

export function ParametresFichesConseilSection() {
  return (
    <SettingsPanel
      title="Fiches conseil"
      description="Modèles PDF pré-remplis pour l'arbitrage AV et PER. Le CRM complète nom, prénom et n° de contrat à la génération."
    >
      <div className="space-y-6">
        <ArbitrageFicheTemplatesManager
          embedded
          productKind="AV"
          title="Assurance vie (AV)"
        />
        <ArbitrageFicheTemplatesManager
          embedded
          productKind="PER"
          title="PER"
        />
      </div>
    </SettingsPanel>
  );
}
