import { ContactAgePanel } from "./ContactAgePanel";
import { ContactAttritionPanel } from "./ContactAttritionPanel";
import { ContactClientAbovePanierMoyenPanel } from "./ContactClientAbovePanierMoyenPanel";
import { ContactClientPatrimoinePanels } from "./ContactClientPatrimoinePanels";
import { ContactClientProductCoveragePanels } from "./ContactClientProductCoveragePanels";
import { ContactClientScpiReinvestPanel } from "./ContactClientScpiReinvestPanel";
import { ContactClientVpCoveragePanel } from "./ContactClientVpCoveragePanel";
import { ContactGeographyPanel } from "./ContactGeographyPanel";
import { ContactPrescripteurPanel } from "./ContactPrescripteurPanel";
import { ContactSourceLeadPanel } from "./ContactSourceLeadPanel";

type ContactClientStatsPanelProps = {
  onNavigate?: (page: string) => void;
};

export function ContactClientStatsPanel({ onNavigate }: ContactClientStatsPanelProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <ContactGeographyPanel onNavigate={onNavigate} lens="client" />
        <ContactAgePanel onNavigate={onNavigate} lens="client" />
      </div>
      <ContactSourceLeadPanel onNavigate={onNavigate} lens="client" />
      <ContactPrescripteurPanel onNavigate={onNavigate} lens="client" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <ContactClientPatrimoinePanels onNavigate={onNavigate} />
        <ContactClientAbovePanierMoyenPanel onNavigate={onNavigate} />
        <ContactClientProductCoveragePanels onNavigate={onNavigate} />
        <ContactClientScpiReinvestPanel onNavigate={onNavigate} />
        <ContactClientVpCoveragePanel onNavigate={onNavigate} />
        <div className="lg:col-span-2">
          <ContactAttritionPanel onNavigate={onNavigate} title="Attrition" />
        </div>
      </div>
    </div>
  );
}
