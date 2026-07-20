import { Users } from "lucide-react";
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
        title="Contacts"
        subtitle="Origine et segmentation des contacts"
        icon={Users}
      >
        <ContactSourceLeadPanel onNavigate={onNavigate} />
      </StatistiquesCollapsibleSection>
    </div>
  );
}
