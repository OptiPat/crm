import { CircleUser, Network, Share2, Users } from "lucide-react";
import { ContactClientStatsPanel } from "@/components/statistiques/ContactClientStatsPanel";
import { ContactFilleulOrganisationPanel } from "@/components/statistiques/ContactFilleulOrganisationPanel";
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
        sectionId="filleuls_organisation"
        title="Organisation filleuls"
        subtitle="Stats générales"
        icon={Network}
      >
        <ContactFilleulOrganisationPanel onNavigate={onNavigate} />
      </StatistiquesCollapsibleSection>

      <StatistiquesCollapsibleSection
        sectionId="clients"
        title="Clients"
        subtitle="Stats générales"
        icon={CircleUser}
      >
        <ContactClientStatsPanel onNavigate={onNavigate} />
      </StatistiquesCollapsibleSection>
    </div>
  );
}
