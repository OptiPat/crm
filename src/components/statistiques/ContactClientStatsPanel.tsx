import { ContactAgePanel } from "./ContactAgePanel";
import { ContactAttritionPanel } from "./ContactAttritionPanel";
import { ContactClientAbovePanierMoyenPanel } from "./ContactClientAbovePanierMoyenPanel";
import { ContactClientPatrimoinePanels } from "./ContactClientPatrimoinePanels";
import { ContactClientProductCoveragePanels } from "./ContactClientProductCoveragePanels";
import { ContactClientScpiReinvestPanel } from "./ContactClientScpiReinvestPanel";
import { ContactGeographyPanel } from "./ContactGeographyPanel";

type ContactClientStatsPanelProps = {
  onNavigate?: (page: string) => void;
};

export function ContactClientStatsPanel({ onNavigate }: ContactClientStatsPanelProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <ContactGeographyPanel onNavigate={onNavigate} lens="client" />
      <ContactAgePanel onNavigate={onNavigate} lens="client" />
      <ContactClientPatrimoinePanels />
      <ContactClientProductCoveragePanels onNavigate={onNavigate} />
      <ContactClientAbovePanierMoyenPanel onNavigate={onNavigate} />
      <ContactClientScpiReinvestPanel onNavigate={onNavigate} />
      <div className="lg:col-span-2">
        <ContactAttritionPanel onNavigate={onNavigate} title="Attrition" />
      </div>
    </div>
  );
}
