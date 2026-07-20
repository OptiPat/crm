import { CircleUser, Network, Share2, Users } from "lucide-react";
import { ContactClientStatsPanel } from "@/components/statistiques/ContactClientStatsPanel";
import { ContactFilleulOrganisationPanel } from "@/components/statistiques/ContactFilleulOrganisationPanel";
import { ContactPrescripteurPanel } from "@/components/statistiques/ContactPrescripteurPanel";
import { ContactSourceLeadPanel } from "@/components/statistiques/ContactSourceLeadPanel";
import { StatistiquesPageToolbar } from "@/components/statistiques/StatistiquesPageToolbar";
import { StatistiquesSection } from "@/components/statistiques/statistiques-ui";
import { StatistiquesPageDataProvider } from "@/components/statistiques/statistiques-page-data-context";
import { STATISTIQUES_SECTIONS } from "@/lib/statistiques/statistiques-sections";

type StatistiquesProps = {
  onNavigate?: (page: string) => void;
};

const SECTION_ICONS = {
  contacts: Users,
  prescripteurs: Share2,
  filleuls_organisation: Network,
  clients: CircleUser,
} as const;

function StatistiquesContent({ onNavigate }: StatistiquesProps) {
  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-8">
      <StatistiquesPageToolbar />

      {STATISTIQUES_SECTIONS.map((section) => (
        <StatistiquesSection
          key={section.id}
          sectionId={section.id}
          title={section.title}
          subtitle={section.subtitle}
          intro={section.intro}
          icon={SECTION_ICONS[section.id]}
          panelCount={section.panelCount}
        >
          {section.id === "contacts" ? <ContactSourceLeadPanel onNavigate={onNavigate} /> : null}
          {section.id === "prescripteurs" ? (
            <ContactPrescripteurPanel onNavigate={onNavigate} />
          ) : null}
          {section.id === "filleuls_organisation" ? (
            <ContactFilleulOrganisationPanel onNavigate={onNavigate} />
          ) : null}
          {section.id === "clients" ? <ContactClientStatsPanel onNavigate={onNavigate} /> : null}
        </StatistiquesSection>
      ))}
    </div>
  );
}

export function Statistiques({ onNavigate }: StatistiquesProps) {
  return (
    <StatistiquesPageDataProvider>
      <StatistiquesContent onNavigate={onNavigate} />
    </StatistiquesPageDataProvider>
  );
}
