import { CircleUser, Network } from "lucide-react";
import { ContactClientStatsPanel } from "@/components/statistiques/ContactClientStatsPanel";
import { ContactFilleulOrganisationPanel } from "@/components/statistiques/ContactFilleulOrganisationPanel";
import { StatistiquesPageToolbar } from "@/components/statistiques/StatistiquesPageToolbar";
import { StatistiquesSection } from "@/components/statistiques/statistiques-ui";
import { StatistiquesPageDataProvider } from "@/components/statistiques/statistiques-page-data-context";
import { STATISTIQUES_SECTIONS, statistiquesSectionPanelCount } from "@/lib/statistiques/statistiques-sections";

type StatistiquesProps = {
  onNavigate?: (page: string) => void;
};

const SECTION_ICONS = {
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
          intro={section.intro}
          icon={SECTION_ICONS[section.id]}
          panelCount={statistiquesSectionPanelCount(section.id)}
        >
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
