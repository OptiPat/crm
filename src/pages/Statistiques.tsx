import { Share2, UserMinus, Users } from "lucide-react";
import { ContactAttritionPanel } from "@/components/statistiques/ContactAttritionPanel";
import { ContactPrescripteurPanel } from "@/components/statistiques/ContactPrescripteurPanel";
import { ContactSourceLeadPanel } from "@/components/statistiques/ContactSourceLeadPanel";
import { StatistiquesCollapsibleSection } from "@/components/statistiques/statistiques-ui";

type StatistiquesProps = {
  onNavigate?: (page: string) => void;
};

export function Statistiques({ onNavigate }: StatistiquesProps) {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-8">
      <StatistiquesCollapsibleSection
        sectionId="contacts"
        title="Source / lead"
        subtitle="Origine des contacts et taux de conversion par source"
        icon={Users}
      >
        <ContactSourceLeadPanel onNavigate={onNavigate} />
      </StatistiquesCollapsibleSection>

      <StatistiquesCollapsibleSection
        sectionId="prescripteurs"
        title="Prescripteurs"
        subtitle="Qui vous recommande des clients et des filleuls — conversion par prescripteur"
        icon={Share2}
      >
        <ContactPrescripteurPanel onNavigate={onNavigate} />
      </StatistiquesCollapsibleSection>

      <StatistiquesCollapsibleSection
        sectionId="attrition"
        title="Attrition"
        subtitle="Clients devenus anciens clients et filleuls désinscrits du réseau"
        icon={UserMinus}
      >
        <ContactAttritionPanel onNavigate={onNavigate} />
      </StatistiquesCollapsibleSection>
    </div>
  );
}
